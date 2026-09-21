// Integração local completa: Pages handlers + workerd + D1; Groq sempre simulado.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { COMPARE_CASES } from './fixtures/compare-quality-cases.mjs';
import { M04_ERROR } from '../tests/helpers/compare-schema-error.js';
import { checkDiaryRuntime } from './check-diary-runtime.mjs';
import { checkPantryRuntime } from './check-pantry-runtime.mjs';
import { checkPriorityRuntime } from './check-priority-runtime.mjs';
import { checkDeletionRuntime } from './check-deletion-runtime.mjs';
import { checkVideoRuntime } from './check-video-runtime.mjs';
import { checkRedirectRuntime } from './check-redirect-runtime.mjs';

await checkRedirectRuntime();

// Números amplos SÓ para testes; não representam cotas gratuitas aprovadas.
const common = { visitorDay: 1000, visitorMinute: 1000, networkDay: 1000, networkMinute: 1000,
  globalDay: 1000, globalMinute: 1000, dayTokens: 10000000, minuteTokens: 10000000, reserveTokens: 8000 };
const policy = { ingress: { ...common, reserveTokens: 0, dayTokens: 0, minuteTokens: 0 },
  session: { ...common, reserveTokens: 0, dayTokens: 0, minuteTokens: 0 },
  generation: { ...common, visitorDay: 3 }, vision: { ...common, reserveTokens: 4000 } };
const { outputFiles } = await build({
  stdin: { contents: `import { createApiHandlers } from './src/http/api.js';
    import { deleteHistory } from './src/history/delete.js';
    import { requireVisitorSession } from './src/security/session.js';
    import { onRequestGet as health } from './functions/api/health.js';
    import { reserveUsage, finishUsage, pruneUsage } from './src/security/quota.js';
    import { MODEL } from './src/providers/groq.js';
    import { VISION_MODEL } from './src/providers/groq-vision.js';
    import { compareSchemaError } from './tests/helpers/compare-schema-error.js';
    import { videoRuntimeHandler } from './scripts/fixtures/video-runtime-handler.mjs';
    export default { async fetch(request, baseEnv) {
      // Miniflare pode inserir o IP da conexão antes de chamar este wrapper.
      // A ausência deve ser injetada DEPOIS dessa entrada, só neste arnês.
      if (request.headers.get('X-Test-Missing-IP') === 'true') {
        request = new Request(request);
        request.headers.delete('CF-Connecting-IP');
        request.headers.delete('X-Test-Missing-IP');
        if (request.headers.has('CF-Connecting-IP')) throw Error('Missing-IP fixture failed');
      }
      // Overrides EXCLUSIVOS deste harness, nunca presentes nas rotas publicáveis.
      const env = { ...baseEnv, ...JSON.parse(request.headers.get('X-Test-Env') || '{}') };
      const path = new URL(request.url).pathname;
      if (path === '/video') return videoRuntimeHandler(request, env);
      if (path === '/api/health') {
        if (request.headers.get('X-Test-Health-Fault') === 'true') {
          Object.defineProperty(env, 'DB', { get() { throw Error('Detalhe interno do teste.'); } });
        }
        return health({ env });
      }
      if (path === '/reserve') {
        try { return Response.json(await reserveUsage(request, env, 'generation',
          request.headers.get('X-Test-Visitor'), { now: Number(request.headers.get('X-Test-Now')) })); }
        catch (e) { return Response.json({ code: e.code }, { status: 400 }); }
      }
      if (path === '/prune') { await pruneUsage(env); return Response.json({ ok: true }); }
      let historyReads = 0;
      if (env.DB?.prepare) {
        const database = env.DB;
        env.DB = { prepare(sql) {
          if (sql.includes('FROM preferences') || sql.includes('FROM meal_logs') || sql.includes('FROM pantry_items')) historyReads++;
          return database.prepare(sql);
        }, batch(statements) { return database.batch(statements); } };
      }
      const handlers = createApiHandlers({ fetchImpl: async (_, init) => {
        // Conta as chamadas simuladas em tabela só do banco de teste.
        await env.DB.prepare('INSERT INTO test_calls (kind) VALUES (?1)').bind(path).run();
        const body = JSON.parse(init.body);
        // Corrida determinística EXCLUSIVA do teste; nenhuma rota de produção lê este header.
        if (request.headers.get('X-Test-Delete-During-Provider') === 'true') {
          await deleteHistory(env, await requireVisitorSession(request, env), { version: 1, confirmed: true }, crypto.randomUUID());
        }
        await env.DB.prepare('INSERT INTO test_provider_requests (body_json) VALUES (?1)').bind(JSON.stringify(body)).run();
        if (request.headers.get('X-Test-No-History-Reads') === 'true' && historyReads !== 0) {
          throw Error('Compare consultou histórico indevidamente.');
        }
        const error = request.headers.get('X-Test-Provider');
        // Corpo M04 fornecido pelo usuário, incluindo failed_generation inválido, sem reparo.
        if (error === 'compare-m04-body') return Response.json(compareSchemaError(), { status: 400 });
        if (['schema-400', 'rejected-400', 'rejected-413', 'rejected-415', 'rejected-422'].includes(error)) {
          // Mesmo formato error/message/type/code relatado, mas valores privados fictícios.
          return Response.json({ error: { message: 'DIAGNOSTICO_PRIVADO', type: 'invalid_request_error',
            code: error === 'rejected-400' ? 'other_error' : 'json_validate_failed',
            failed_generation: 'GERACAO_PRIVADA' } }, { status: Number(error.split('-')[1]) });
        }
        if (error === '429') return new Response('PRIVATE PROVIDER ERROR', { status: 429 });
        if (error === '500') return new Response('PRIVATE PROVIDER ERROR', { status: 500 });
        if (error === 'invalid') return Response.json({ model: body.model, choices: [{ finish_reason: 'stop', message: { content: '{}' } }] });
        let data;
        if (body.model === VISION_MODEL) {
          if (!body.messages[1].content[1].image_url.url.startsWith('data:image/png;base64,')) throw Error('image missing');
          data = { version: 1, status: 'recognized', ingredients: ['ARROZ'] };
        } else {
          if (body.model !== MODEL) throw Error('model changed');
          const input = JSON.parse(body.messages[1].content);
          const expectedConstraints = request.headers.get('X-Test-Constraints');
          if (expectedConstraints) {
            const actual = { equipment: input.equipment, avoid_equipment: input.avoid_equipment, max_dishes: input.max_dishes };
            if (JSON.stringify(actual) !== expectedConstraints || !body.messages[0].content.includes('max_dishes')) {
              throw Error('Restrições não chegaram ao adaptador.');
            }
          }
          data = input.mode === 'ready'
            ? { version: 1, mode: 'ready', suggestions: [{ title: 'Prato de arroz', description: 'Uma opção para buscar.', search_term: 'prato de arroz', servings: input.people }] }
            : { version: 1, mode: 'cook', suggestions: [{ title: 'Arroz', servings: input.people, total_minutes: input.time_minutes,
                ingredients: [{ name: 'arroz', quantity: 100, unit: 'g' }], steps: ['Prepare o arroz.'] }] };
          if (input.mode === 'compare') {
            if (Object.hasOwn(input, 'hourly_rate_brl')) throw Error('Valor da hora enviado indevidamente à IA.');
            if (body.response_format.json_schema.name !== 'meal_compare_v1' || !body.response_format.json_schema.strict) {
              throw Error('Schema compare não chegou ao provedor.');
            }
            if (JSON.stringify(body.response_format.json_schema.schema).includes('"anyOf"')) throw Error('Schema compare reintroduziu anyOf.');
            data = { version: 1, mode: 'compare', cook: { status: 'suggested', suggestions: data.suggestions, reason: null },
              ready: { status: 'suggested', reason: null, suggestions: [{ title: 'Prato de arroz', description: 'Uma opção para buscar.',
                search_term: 'prato de arroz', servings: input.people, estimated_price_brl: { value: 20, origin: 'estimado' } }] } };
            const noOption = { status: 'not_suggested', reason: 'Não foi encontrada uma opção compatível.', suggestions: null };
            if (error === 'compare-cook-none' || error === 'compare-both-none') data.cook = noOption;
            if (error === 'compare-ready-none' || error === 'compare-both-none') data.ready = noOption;
            if (error === 'compare-missing') delete data.ready;
            if (error === 'compare-enum') data.cook.suggestions[0].ingredients[0].unit = 'dentes';
            if (error === 'compare-price') data.ready.suggestions[0].estimated_price_brl.value = 1.001;
          }
          if (error === 'empty') data.suggestions = [];
        }
        return Response.json({ model: body.model, choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(data) } }],
          usage: { prompt_tokens: 2000, completion_tokens: 100, total_tokens: error === 'overage' ? 12000 : 2100 } });
      }});
      if (path.endsWith('/pantry-deduction')) {
        return handlers.pantryDeduction({ request, env, params: { id: path.split('/')[2] } });
      }
      if (path === '/pantry' || path.startsWith('/pantry/')) {
        return handlers.pantry({ request, env, params: path === '/pantry' ? {} : { id: path.slice('/pantry/'.length) } });
      }
      if (path === '/meal-logs' || path.startsWith('/meal-logs/')) {
        return handlers.mealLogs({ request, env, params: path === '/meal-logs' ? {} : { id: path.slice('/meal-logs/'.length) } });
      }
      if (path === '/plans' || path.startsWith('/plans/')) {
        return handlers.plans({ request, env, params: path === '/plans' ? {} : { id: path.slice('/plans/'.length) } });
      }
      if (path === '/bootstrap') return handlers.bootstrap({ request, env });
      return path === '/history' ? handlers.history({ request, env })
        : path === '/preferences' ? handlers.preferences({ request, env }) : path === '/session' ? handlers.session({ request, env })
        : path === '/vision' ? handlers.analyze({ request, env }) : handlers.generate({ request, env });
    }};`, resolveDir: process.cwd() },
  bundle: true, write: false, format: 'esm', platform: 'browser',
});
const mf = new Miniflare(convertV4MiniflareOptions({ host: '127.0.0.1', port: 0, workers: [{
  name: 'api-test', modules: true, script: outputFiles[0].text, compatibilityDate: '2026-09-06',
  d1Databases: { DB: 'api-test-disposable' }, bindings: {
    SESSIONS_ENABLED: 'true', AI_ENABLED: 'true', VISION_ENABLED: 'true',
    SESSION_SECRET: 'fake-api-session-test-secret-not-production', IP_HASH_SECRET: 'fake-api-network-test-secret-not-production',
    GROQ_API_KEY: 'fake-no-network-key', QUOTA_POLICY_JSON: JSON.stringify(policy),
  },
}] }));
const ready = { mode: 'ready', meal: 'almoço', people: 1 };
let checks = 0;
try {
  const db = await mf.getD1Database('DB', 'api-test');
  for (const file of ['0001_initial.sql', '0002_usage_reservations.sql', '0003_plan_history.sql', '0004_meal_logs.sql', '0005_pantry.sql', '0006_history_deletion.sql', '0007_video_cache_quota.sql', '0008_meal_log_ratings.sql']) {
    const sql = (await readFile(new URL('../migrations/' + file, import.meta.url), 'utf8')).replace(/--[^\n]*/gu, '');
    // Cada CREATE TRIGGER é mantido inteiro, incluindo seus SELECTs e END.
    for (const statement of sql.split(/\n(?=CREATE |PRAGMA |ALTER )/u).map(s => s.trim()).filter(Boolean)) await db.prepare(statement).run();
  }
  await db.prepare('CREATE TABLE test_calls (kind TEXT NOT NULL)').run();
  await db.prepare('CREATE TABLE test_provider_requests (body_json TEXT NOT NULL)').run();
  const clean = async () => { await db.batch(['usage_reservations', 'usage_buckets', 'visitors', 'test_calls', 'test_provider_requests'].map(t => db.prepare(`DELETE FROM ${t}`))); };
  const calls = async () => (await db.prepare('SELECT COUNT(*) AS n FROM test_calls').first()).n;
  const send = (path, { method = 'POST', cookie = '', body = ready, key = crypto.randomUUID(), headers = {}, overrides, ip = '192.0.2.1' } = {}) => {
    const h = { Origin: 'https://local.test', 'Content-Type': 'application/json', 'Idempotency-Key': key, Cookie: cookie,
      ...(ip ? { 'CF-Connecting-IP': ip } : { 'X-Test-Missing-IP': 'true' }), ...(overrides ? { 'X-Test-Env': JSON.stringify(overrides) } : {}), ...headers };
    return mf.dispatchFetch('https://local.test' + path, { method, headers: h,
      ...(method === 'GET' ? {} : { body: typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body) }) });
  };
  const session = async (options = {}) => {
    const r = await send('/session', { ...options, body: {} });
    assert.equal(r.status, 201, JSON.stringify(await r.clone().json()));
    assert.equal(r.headers.get('Cache-Control'), 'no-store');
    return r.headers.get('Set-Cookie').split(';')[0];
  };
  const altered = patch => ({ QUOTA_POLICY_JSON: JSON.stringify({ ...policy, ...patch }) });
  const scenario = async (name, fn) => { await clean(); await fn(); checks++; console.log('OK: ' + name); };

  for (const [reason, overrides] of [
    ['ok', {}], ['flag_off', { SESSIONS_ENABLED: 'false' }],
    ['policy_empty', { QUOTA_POLICY_JSON: '{}' }], ['policy_invalid', { QUOTA_POLICY_JSON: '{' }],
    ['secret_missing', { SESSION_SECRET: null }], ['secret_invalid', { SESSION_SECRET: true }],
    ['db_unbound', { DB: null }], ['config_error', {}],
  ]) {
    await scenario(`health no runtime: ${reason}, sem dados internos ou consumo`, async () => {
      const response = await mf.dispatchFetch('https://local.test/api/health', { headers: {
        'X-Test-Env': JSON.stringify(overrides), ...(reason === 'config_error' ? { 'X-Test-Health-Fault': 'true' } : {}),
      } });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
      assert.deepEqual(await response.json(), { status: 'ok', stage: 'backend', generationAvailable: reason === 'ok',
        visionAvailable: reason === 'ok', sessionsAvailable: reason === 'ok',
        reasons: { generation: reason, vision: reason, session: reason } });
      assert.equal(await calls(), 0);
      for (const table of ['visitors', 'usage_reservations', 'usage_buckets']) {
        assert.equal((await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).n, 0);
      }
    });
  }

  await scenario('flags e configuração incompleta não iniciam IA', async () => {
    for (const overrides of [{ AI_ENABLED: 'false' }, { SESSIONS_ENABLED: 'false' }, { QUOTA_POLICY_JSON: '{}' }, { GROQ_API_KEY: '' }]) {
      assert.equal((await send('/generate', { overrides })).status, 503);
    }
    assert.equal(await calls(), 0);
  });
  await scenario('sessão protegida, reuso e reenvio sem duplicação', async () => {
    const cookie = await session();
    const key = crypto.randomUUID();
    const reused = await send('/session', { cookie, key, body: {} });
    assert.equal(reused.status, 200); assert.equal(reused.headers.get('Set-Cookie'), null);
    assert.equal((await send('/session', { cookie, key, body: {} })).status, 409);
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM visitors').first()).n, 1);
  });
  await scenario('12 gerações concorrentes: exatamente 3 chamadas', async () => {
    const cookie = await session();
    const results = await Promise.all(Array.from({ length: 12 }, () => send('/generate', { cookie })));
    assert.equal(results.filter(r => r.status === 200).length, 3);
    assert.equal(results.filter(r => r.status === 429).length, 9);
    assert.equal(await calls(), 3);
    const counter = await db.prepare("SELECT requests, reserved_tokens FROM usage_buckets WHERE scope='global' AND bucket_key='generation:Day:all'").first();
    assert.deepEqual(counter, { requests: 3, reserved_tokens: 24000 });
  });
  await scenario('tentativas de sessão têm limite próprio antes de criar visitantes', async () => {
    const overrides = altered({ session: { ...policy.session, visitorDay: 1, networkDay: 2 } });
    await session({ overrides }); await session({ overrides });
    assert.equal((await send('/session', { overrides, body: {} })).status, 429);
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM visitors').first()).n, 2);
    assert.equal(await calls(), 0);
  });
  await scenario('limite de entrada bloqueia repetição de pedidos sem sessão', async () => {
    const overrides = altered({ ingress: { ...policy.ingress, globalMinute: 1 } });
    assert.equal((await send('/generate', { overrides })).status, 401);
    assert.equal((await send('/generate', { overrides })).status, 429);
    assert.equal(await calls(), 0);
  });
  await scenario('oito reenvios simultâneos: uma chamada', async () => {
    const cookie = await session(), key = crypto.randomUUID();
    const results = await Promise.all(Array.from({ length: 8 }, () => send('/generate', { cookie, key })));
    assert.equal(results.filter(r => r.status === 200).length, 1);
    assert.equal(results.filter(r => r.status === 409).length, 7);
    assert.equal(await calls(), 1);
  });
  await scenario('entrada inválida, sessão ausente, origem e rede: sem IA', async () => {
    const cookie = await session();
    for (const [options, status] of [[{}, 401], [{ cookie, body: { mode: 'bad' } }, 400],
      [{ cookie, body: 'x'.repeat(16385) }, 413], [{ cookie, headers: { Origin: 'https://evil.test' } }, 403],
      [{ cookie, ip: null }, 503], [{ cookie, key: 'invalid' }, 400]]) {
      assert.equal((await send('/generate', options)).status, status);
    }
    assert.equal(await calls(), 0);
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM usage_reservations WHERE operation='generation'").first()).n, 0);
  });
  await scenario('rede compartilhada não multiplica o teto ao criar outro visitante', async () => {
    const a = await session(), b = await session();
    const overrides = altered({ generation: { ...policy.generation, networkDay: 3 } });
    const results = await Promise.all([a, a, b, b].map(cookie => send('/generate', { cookie, overrides })));
    assert.equal(results.filter(r => r.status === 200).length, 3); assert.equal(await calls(), 3);
  });
  await scenario('teto global de pedidos entre redes distintas', async () => {
    const a = await session(), b = await session({ ip: '198.51.100.1' });
    const overrides = altered({ generation: { ...policy.generation, globalDay: 2 } });
    const results = await Promise.all([[a, '192.0.2.1'], [b, '198.51.100.1'], [a, '192.0.2.1']].map(([cookie, ip]) => send('/generate', { cookie, ip, overrides })));
    assert.equal(results.filter(r => r.status === 200).length, 2); assert.equal(await calls(), 2);
  });
  await scenario('teto global diário de tokens é independente do número de pedidos', async () => {
    const cookie = await session();
    const overrides = altered({ generation: { ...policy.generation, dayTokens: 16000 } });
    assert.equal((await send('/generate', { cookie, overrides })).status, 200);
    assert.equal((await send('/generate', { cookie, overrides })).status, 200);
    assert.equal((await send('/generate', { cookie, overrides })).status, 429);
    assert.equal(await calls(), 2);
  });
  await scenario('cozinhar mantém contrato de entrada/saída', async () => {
    const cookie = await session();
    const r = await send('/generate', { cookie, body: { mode: 'cook', meal: 'jantar', people: 2, time_minutes: 20, ingredient_policy: 'only_available', ingredients: ['arroz'] } });
    assert.equal(r.status, 200); assert.equal((await r.json()).data.suggestions[0].servings, 2);
  });
  await scenario('cook encaminha equipamento e louça em uma chamada por pedido', async () => {
    const cookie = await session();
    for (const fields of [
      { equipment: ['fogao'], avoid_equipment: ['forno'], max_dishes: 2 },
      { equipment: [], avoid_equipment: [], max_dishes: 0 },
    ]) {
      const response = await send('/generate', { cookie,
        body: { mode: 'cook', meal: 'lanche', people: 1, time_minutes: 15,
          ingredient_policy: 'only_available', ingredients: ['banana'], ...fields },
        headers: { 'X-Test-Constraints': JSON.stringify(fields) } });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).data.mode, 'cook');
    }
    // Prova encaminhamento e cota; a receita simulada não comprova obediência semântica.
    assert.equal(await calls(), 2);
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM usage_reservations WHERE operation='generation'").first()).n, 2);
  });
  await scenario('restrições inválidas e campos de preparo em ready falham antes da reserva de IA', async () => {
    const cookie = await session();
    const cook = { mode: 'cook', meal: 'jantar', people: 1, time_minutes: 15, ingredient_policy: 'suggest', ingredients: [] };
    for (const body of [
      { ...cook, equipment: ['FORNO'] }, { ...cook, avoid_equipment: ['forno', 'forno'] },
      { ...cook, equipment: ['forno'], avoid_equipment: ['forno'] }, { ...cook, max_dishes: 21 },
      { ...ready, equipment: [] }, { ...ready, avoid_equipment: [] }, { ...ready, max_dishes: 0 },
    ]) {
      const response = await send('/generate', { cookie, body });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { code: 'INVALID_INPUT', message: 'Não foi possível processar este pedido agora. Tente novamente.', quotaReserved: false });
    }
    assert.equal(await calls(), 0);
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM usage_reservations WHERE operation='generation'").first()).n, 0);
  });
  await scenario('compare: uma chamada e reserva, cálculo local e cota compartilhada com cook/ready', async () => {
    const cookie = await session(), key = crypto.randomUUID();
    const body = { mode: 'compare', meal: 'jantar', people: 1, time_minutes: 15,
      ingredient_policy: 'suggest', ingredients: [], equipment: ['fogao'], avoid_equipment: ['forno'], max_dishes: 2, hourly_rate_brl: 50 };
    const constraints = JSON.stringify({ equipment: body.equipment, avoid_equipment: body.avoid_equipment, max_dishes: body.max_dishes });
    const response = await send('/generate', { cookie, key, body, headers: { 'X-Test-Constraints': constraints } });
    assert.equal(response.status, 200);
    const value = await response.json();
    assert.equal(value.data.mode, 'compare');
    assert.equal(Object.hasOwn(value.data.cook, 'reason'), false);
    assert.equal(Object.hasOwn(value.data.ready, 'reason'), false);
    assert.equal(value.comparison.cook.alternatives[0].time_cost_brl.value, 12.5);
    assert.equal(value.comparison.partial_comparison.pairs[0].difference_brl.value, 7.5);
    assert.equal(value.comparison.partial_comparison.is_total_savings, false);
    assert.equal(value.comparison.partial_comparison.pairs[0].difference_brl.based_on_estimates, true);
    assert.equal(value.metadata.usage.total_tokens, 2100);
    assert.equal(value.quota.reserved, true);
    assert.equal(await calls(), 1);
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM usage_reservations WHERE operation='generation'").first()).n, 1);
    const duplicate = await send('/generate', { cookie, key, body });
    assert.equal(duplicate.status, 409); assert.equal(await calls(), 1);
    const cookBody = { ...body, mode: 'cook' }; delete cookBody.hourly_rate_brl;
    assert.equal((await send('/generate', { cookie, body: cookBody })).status, 200);
    assert.equal((await send('/generate', { cookie, body: ready })).status, 200);
    assert.equal((await send('/generate', { cookie, body })).status, 429);
    assert.equal(await calls(), 3);
  });
  await scenario('compare: lados sem opção são resultado 200, não erro ou segunda chamada', async () => {
    const cookie = await session();
    const body = { mode: 'compare', meal: 'jantar', people: 1, time_minutes: 15, ingredient_policy: 'suggest', ingredients: [] };
    for (const kind of ['compare-cook-none', 'compare-ready-none', 'compare-both-none']) {
      const response = await send('/generate', { cookie, body, headers: { 'X-Test-Provider': kind } });
      assert.equal(response.status, 200);
      const value = await response.json();
      assert.equal(value.comparison.partial_comparison.status, 'unavailable');
      assert.deepEqual(value.comparison.partial_comparison.pairs, []);
      if (kind !== 'compare-ready-none') assert.equal(value.data.cook.status, 'not_suggested');
      if (kind !== 'compare-cook-none') assert.equal(value.data.ready.status, 'not_suggested');
      for (const side of [value.data.cook, value.data.ready]) {
        assert.equal(Object.hasOwn(side, side.status === 'suggested' ? 'reason' : 'suggestions'), false);
      }
    }
    assert.equal(await calls(), 3);
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM usage_reservations WHERE operation='generation'").first()).n, 3);
  });
  await scenario('compare: saída inválida preserva 502 e reserva, sem cálculo ou retry', async () => {
    const cookie = await session();
    const body = { mode: 'compare', meal: 'jantar', people: 1, time_minutes: 15, ingredient_policy: 'suggest', ingredients: [] };
    for (const kind of ['compare-missing', 'compare-enum', 'compare-price']) {
      const response = await send('/generate', { cookie, body, headers: { 'X-Test-Provider': kind } });
      assert.equal(response.status, 502);
      assert.deepEqual(await response.json(), { code: 'INVALID_OUTPUT', message: 'A IA não devolveu uma resposta válida para este pedido.', quotaReserved: true });
    }
    assert.equal(await calls(), 3);
    assert.equal((await send('/generate', { cookie, body })).status, 429);
    assert.equal(await calls(), 3);
  });
  await scenario('compare: rejeição do schema pela Groq mantém código distinto e não expõe diagnóstico', async () => {
    const cookie = await session();
    const body = { mode: 'compare', meal: 'jantar', people: 1, time_minutes: 15, ingredient_policy: 'suggest', ingredients: [] };
    const response = await send('/generate', { cookie, body, headers: { 'X-Test-Provider': 'schema-400' } });
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { code: 'PROVIDER_SCHEMA_REJECTED',
      message: 'O provedor rejeitou o formato da resposta gerada pela IA.', quotaReserved: true });
    assert.equal(await calls(), 1);
  });
  await scenario('compare M04: corpo fornecido retorna 502 sem diagnóstico privado ou reparo', async () => {
    const cookie = await session();
    const body = structuredClone(COMPARE_CASES.find(entry => entry.id === 'M04').input);
    const response = await send('/generate', { cookie, body, headers: { 'X-Test-Provider': 'compare-m04-body' } });
    assert.equal(response.status, 502);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    const text = await response.text();
    assert.deepEqual(JSON.parse(text), { code: 'PROVIDER_SCHEMA_REJECTED',
      message: 'O provedor rejeitou o formato da resposta gerada pela IA.', quotaReserved: true });
    const exposed = text + JSON.stringify([...response.headers]);
    for (const privateText of [M04_ERROR.message, M04_ERROR.failed_generation, 'failed_generation', 'Pizza Assada Pronta', 'Não há fonte de calor']) {
      assert.equal(exposed.includes(privateText), false);
    }
    assert.equal(await calls(), 1);
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM usage_reservations WHERE operation='generation' AND status='failed'").first()).n, 1);
  });
  await scenario('compare: flags desligadas continuam 503 sem chamada ou reserva de geração', async () => {
    const body = { mode: 'compare', meal: 'jantar', people: 1, time_minutes: 15, ingredient_policy: 'suggest', ingredients: [] };
    const response = await send('/generate', { body, overrides: { AI_ENABLED: 'false', SESSIONS_ENABLED: 'false', VISION_ENABLED: 'false', QUOTA_POLICY_JSON: '{}' } });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { code: 'NOT_READY', message: 'Esta função está em preparação. Nenhuma chamada à IA foi iniciada.', quotaReserved: false });
    assert.equal(await calls(), 0);
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM usage_reservations WHERE operation='generation'").first()).n, 0);
  });
  await scenario('lista vazia continua 502 com reserva, sem corrigir o canal de recusa', async () => {
    const cookie = await session();
    const response = await send('/generate', { cookie,
      body: { mode: 'cook', meal: 'jantar', people: 1, time_minutes: 15, ingredient_policy: 'suggest', ingredients: [], equipment: [], max_dishes: 0 },
      headers: { 'X-Test-Provider': 'empty' } });
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { code: 'INVALID_OUTPUT', message: 'A IA não devolveu uma resposta válida para este pedido.', quotaReserved: true });
    assert.equal(await calls(), 1);
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM usage_reservations WHERE operation='generation'").first()).n, 1);
  });
  const sendProviderError = async (path, cookie, error, key = crypto.randomUUID()) => {
    const headers = { 'X-Test-Provider': error };
    if (path === '/generate') return send(path, { cookie, key, headers,
      body: { mode: 'cook', meal: 'lanche', people: 1, time_minutes: 15, ingredient_policy: 'suggest', ingredients: [] } });
    const form = new FormData();
    form.append('image', new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')], { type: 'image/png' }), 'test.png');
    const multipart = new Request('https://local.test', { method: 'POST', body: form });
    return send(path, { cookie, key, headers: { ...headers, 'Content-Type': multipart.headers.get('Content-Type') },
      body: new Uint8Array(await multipart.arrayBuffer()) });
  };
  for (const [path, operation] of [['/generate', 'generation'], ['/vision', 'vision']]) {
    await scenario('rejeição de esquema retorna 502 sanitizado com reserva preservada em ' + operation, async () => {
      const cookie = await session();
      const response = await sendProviderError(path, cookie, 'schema-400');
      assert.equal(response.status, 502);
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
      assert.deepEqual(await response.json(), { code: 'PROVIDER_SCHEMA_REJECTED',
        message: 'O provedor rejeitou o formato da resposta gerada pela IA.', quotaReserved: true });
      assert.equal(await calls(), 1);
      assert.equal((await db.prepare('SELECT status FROM usage_reservations WHERE operation=?1').bind(operation).first()).status, 'failed');
      // Uso ausente não reduz a reserva. O recibo não contém consumo real medido.
      const counter = await db.prepare('SELECT requests, reserved_tokens FROM usage_buckets WHERE bucket_key=?1')
        .bind(operation + ':Day:all').first();
      assert.deepEqual(counter, { requests: 1, reserved_tokens: policy[operation].reserveTokens });
    });
    await scenario('400 genérico, 413, 415 e 422 retornam mensagem neutra em ' + operation, async () => {
      for (const status of [400, 413, 415, 422]) {
        await clean();
        const cookie = await session();
        const response = await sendProviderError(path, cookie, 'rejected-' + status);
        assert.equal(response.status, 422);
        assert.deepEqual(await response.json(), { code: 'PROVIDER_REJECTED_REQUEST',
          message: 'O provedor não aceitou esta solicitação.', quotaReserved: true });
        assert.equal(await calls(), 1);
      }
    });
  }
  await scenario('rejeição de esquema não repete, não estorna e não libera quarta tentativa', async () => {
    const cookie = await session(), key = crypto.randomUUID();
    for (let i = 0; i < 3; i++) {
      const response = await sendProviderError('/generate', cookie, 'schema-400', i === 0 ? key : crypto.randomUUID());
      assert.equal((await response.json()).code, 'PROVIDER_SCHEMA_REJECTED');
    }
    const duplicate = await sendProviderError('/generate', cookie, 'schema-400', key);
    assert.equal(duplicate.status, 409);
    assert.equal((await duplicate.json()).code, 'DUPLICATE_REQUEST');
    const fourth = await sendProviderError('/generate', cookie, 'schema-400');
    assert.equal(fourth.status, 429);
    assert.equal((await fourth.json()).code, 'LIMIT_REACHED');
    assert.equal(await calls(), 3);
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM usage_reservations WHERE operation='generation' AND status='failed'").first()).n, 3);
    assert.equal((await db.prepare("SELECT reserved_tokens FROM usage_buckets WHERE bucket_key='generation:Day:all'").first()).reserved_tokens, 3 * policy.generation.reserveTokens);
    // Cortesia ainda não implementada: isto testa a franquia atual, não resgate futuro.
  });
  await scenario('imagem passa pelo upload e adaptador, com cota separada', async () => {
    const cookie = await session();
    const form = new FormData();
    form.append('image', new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')], { type: 'image/png' }), 'test.png');
    const multipart = new Request('https://local.test', { method: 'POST', body: form });
    const r = await send('/vision', { cookie, body: new Uint8Array(await multipart.arrayBuffer()), headers: { 'Content-Type': multipart.headers.get('Content-Type') } });
    assert.equal(r.status, 200, JSON.stringify(await r.clone().json()));
    assert.deepEqual((await r.json()).data.ingredients, ['arroz']);
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM usage_reservations WHERE operation='generation'").first()).n, 0);
    assert.equal((await send('/vision', { cookie, overrides: { VISION_ENABLED: 'false' } })).status, 503);
  });
  await scenario('erros do Groq não devolvem cota nem repetem chamadas', async () => {
    const cookie = await session();
    for (const [error, status] of [['429', 429], ['500', 503], ['invalid', 502]]) {
      const r = await send('/generate', { cookie, headers: { 'X-Test-Provider': error } });
      assert.equal(r.status, status);
      const data = await r.json(); assert.equal(data.quotaReserved, true); assert.ok(!JSON.stringify(data).includes('PRIVATE'));
    }
    assert.equal((await send('/generate', { cookie })).status, 429); assert.equal(await calls(), 3);
  });
  await scenario('uso acima da reserva aumenta os contadores globais', async () => {
    const cookie = await session();
    assert.equal((await send('/generate', { cookie, headers: { 'X-Test-Provider': 'overage' } })).status, 200);
    assert.equal((await db.prepare("SELECT reserved_tokens FROM usage_buckets WHERE bucket_key='generation:Day:all'").first()).reserved_tokens, 12000);
  });
  await scenario('rollback de falha no incremento: nenhuma reserva parcial ou IA', async () => {
    const cookie = await session();
    await db.prepare("CREATE TRIGGER test_abort BEFORE INSERT ON usage_buckets WHEN NEW.bucket_key LIKE 'generation:Day:%' BEGIN SELECT RAISE(ABORT, 'forced rollback'); END").run();
    assert.equal((await send('/generate', { cookie })).status, 503);
    assert.equal(await calls(), 0);
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM usage_buckets WHERE bucket_key LIKE 'generation:%'").first()).n, 0);
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM usage_reservations WHERE operation='generation'").first()).n, 0);
    await db.prepare('DROP TRIGGER test_abort').run();
  });
  await scenario('janela por minuto, virada UTC e idempotência entre dias', async () => {
    const visitor = crypto.randomUUID(), key = crypto.randomUUID();
    const overrides = altered({ generation: { ...policy.generation, globalMinute: 1 } });
    const reserve = (at, k = crypto.randomUUID()) => send('/reserve', { key: k, overrides, headers: { 'X-Test-Visitor': visitor, 'X-Test-Now': String(Date.parse(at)) } });
    assert.equal((await reserve('2026-09-11T23:59:00Z', key)).status, 200);
    assert.equal((await (await reserve('2026-09-11T23:59:30Z')).json()).code, 'LIMIT_REACHED');
    assert.equal((await reserve('2026-09-12T00:00:00Z')).status, 200);
    assert.equal((await (await reserve('2026-09-12T00:01:00Z', key)).json()).code, 'DUPLICATE_REQUEST');
  });
  await scenario('limpeza remove só registros expirados, sem liberar quota ativa', async () => {
    const cookie = await session(); await send('/generate', { cookie });
    const before = (await db.prepare('SELECT COUNT(*) AS n FROM usage_buckets').first()).n;
    await db.prepare("INSERT INTO usage_buckets VALUES ('global','expired','2000-01-01',1,0,'2000-01-02T00:00:00.000Z')").run();
    assert.equal((await send('/prune')).status, 200);
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM usage_buckets').first()).n, before);
  });
  await scenario('histórico: plano já existe ao receber 200 e replay preserva pedido/resultado sem nova cota de IA', async () => {
    const cookie = await session(), key = crypto.randomUUID();
    const first = await send('/generate', { cookie, key });
    assert.equal(first.status, 200);
    const original = await first.json();
    const row = await db.prepare('SELECT * FROM plans').first();
    assert.deepEqual(JSON.parse(row.data_json).request, ready);
    assert.deepEqual(JSON.parse(row.data_json).output, original.data);
    const before = await db.prepare("SELECT * FROM usage_buckets WHERE bucket_key LIKE 'generation:%' ORDER BY scope, bucket_key").all();
    const repeat = await send('/generate', { cookie, key, headers: { 'X-Test-Provider': 'invalid' } });
    assert.equal(repeat.status, 409); assert.equal(repeat.headers.get('Cache-Control'), 'no-store');
    const body = await repeat.json();
    assert.equal(body.quotaReserved, false); assert.equal(body.replay.available, true);
    assert.equal(body.replay.plan.id, row.id); assert.equal(body.replay.plan.status, 'draft');
    assert.deepEqual(body.replay.plan.data, original.data); assert.deepEqual(body.replay.plan.metadata, original.metadata);
    assert.deepEqual((await db.prepare("SELECT * FROM usage_buckets WHERE bucket_key LIKE 'generation:%' ORDER BY scope, bucket_key").all()).results, before.results);
    assert.equal((await db.prepare("SELECT requests FROM usage_buckets WHERE bucket_key='ingress:Day:all'").first()).requests, 2);
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM meal_logs').first()).n, 0);
    assert.equal(await calls(), 1);
  });
  await scenario('diário: confirmação de opção recém-gerada aceita o corpo do cliente', async () => {
    const cookie = await session();
    const generated = await send('/generate', { cookie, body: {
      mode: 'cook', meal: 'jantar', people: 2, time_minutes: 20, ingredient_policy: 'suggest', ingredients: [],
    } });
    assert.equal(generated.status, 200);
    const plan = await db.prepare('SELECT id FROM plans LIMIT 1').first();
    const response = await send('/meal-logs', { cookie, overrides: { DIARY_ENABLED: 'true' }, body: {
      version: 1, source: 'plan_suggestion', plan_id: plan.id, side: 'cook', suggestion_index: 0,
      confirmed_consumed: true,
    } });
    // Criação de recurso devolve 201; 200 no enunciado seria um falso negativo deste arnês.
    assert.equal(response.status, 201, JSON.stringify(await response.clone().json()));
    const created = (await response.json()).data;
    assert.equal(created.meal.id, created.id); assert.equal(created.meal.plan_id, plan.id);
    assert.deepEqual(created.plan_meal_log, { id: created.id, side: 'cook', suggestion_index: 0, rating: null });
  });
  await scenario('abertura: um bootstrap entrega quatro estados com uma única reserva de ingresso', async () => {
    const cookie = await session();
    const before = (await db.prepare("SELECT COUNT(*) n FROM usage_reservations WHERE operation = 'ingress'").first()).n;
    const response = await send('/bootstrap', { method: 'GET', cookie,
      overrides: { DIARY_ENABLED: 'true', PANTRY_ENABLED: 'true', PERSONALIZATION_ENABLED: 'true' } });
    assert.equal(response.status, 200);
    const data = (await response.json()).data;
    assert.deepEqual(Object.keys(data).sort(), ['meals', 'pantry', 'plans', 'preferences']);
    const after = (await db.prepare("SELECT COUNT(*) n FROM usage_reservations WHERE operation = 'ingress'").first()).n;
    assert.equal(after - before, 1);
  });
  await scenario('abertura: bootstrap exige sessão e mesma origem', async () => {
    assert.equal((await send('/bootstrap', { method: 'GET' })).status, 401);
    const cookie = await session();
    assert.equal((await send('/bootstrap', { method: 'GET', cookie, headers: { Origin: 'https://evil.example' } })).status, 403);
    assert.equal((await send('/bootstrap', { method: 'GET', cookie, headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  });
  await scenario('abertura: bootstrap respeita flags e equivale às quatro leituras separadas', async () => {
    const cookie = await session();
    const enabled = { DIARY_ENABLED: 'true', PANTRY_ENABLED: 'true', PERSONALIZATION_ENABLED: 'true' };
    assert.equal((await send('/meal-logs', { cookie, overrides: enabled, body: {
      version: 1, source: 'manual', description: 'Almoço do diário', confirmed_consumed: true,
    } })).status, 201);
    assert.equal((await send('/pantry', { cookie, overrides: enabled, body: {
      version: 1, name: 'Arroz', quantity: 500, unit: 'g',
    } })).status, 201);
    assert.equal((await send('/preferences', { method: 'PUT', cookie, overrides: enabled, body: {
      version: 1, use_history: true, use_pantry: true, defaults: {},
    } })).status, 200);
    assert.equal((await send('/generate', { cookie, body: {
      mode: 'cook', meal: 'jantar', people: 2, time_minutes: 20, ingredient_policy: 'suggest', ingredients: [],
    } })).status, 200);

    const separate = {};
    for (const [key, path] of [['meals', '/meal-logs?limit=50'], ['pantry', '/pantry'], ['preferences', '/preferences'], ['plans', '/plans']]) {
      const response = await send(path, { method: 'GET', cookie, overrides: enabled });
      assert.equal(response.status, 200); separate[key] = (await response.json()).data;
    }
    const aggregate = await send('/bootstrap', { method: 'GET', cookie, overrides: enabled });
    assert.equal(aggregate.status, 200);
    assert.deepEqual((await aggregate.json()).data, separate);

    const disabled = await send('/bootstrap', { method: 'GET', cookie, overrides: {
      DIARY_ENABLED: 'false', PANTRY_ENABLED: 'false', PERSONALIZATION_ENABLED: 'false',
    } });
    assert.equal(disabled.status, 200);
    const hidden = (await disabled.json()).data;
    assert.deepEqual(hidden.meals, []); assert.deepEqual(hidden.pantry, []);
    assert.deepEqual(hidden.preferences, { version: 1, use_history: false, use_pantry: false, defaults: {} });
    assert.equal(hidden.plans.length, 1); assert.equal(Object.hasOwn(hidden.plans[0], 'meal_logs'), false);
  });
  await scenario('diário manual: horário omitido usa servidor e não depende do relógio do cliente', async () => {
    const cookie = await session(), before = Date.now();
    const response = await send('/meal-logs', { cookie, overrides: { DIARY_ENABLED: 'true' }, body: {
      version: 1, source: 'manual', description: 'Relógio divergente', confirmed_consumed: true,
    } });
    const after = Date.now(); assert.equal(response.status, 201, await response.clone().text());
    const created = (await response.json()).data;
    assert.ok(Date.parse(created.meal.eaten_at) >= before && Date.parse(created.meal.eaten_at) <= after);
  });
  await scenario('diário: data manual futura mantém resposta pública genérica', async () => {
    const cookie = await session();
    const generated = await send('/generate', { cookie, body: {
      mode: 'cook', meal: 'jantar', people: 2, time_minutes: 20, ingredient_policy: 'suggest', ingredients: [],
    } });
    assert.equal(generated.status, 200);
    const plan = await db.prepare('SELECT id FROM plans LIMIT 1').first();
    const response = await send('/meal-logs', { cookie, overrides: { DIARY_ENABLED: 'true' }, body: {
      version: 1, source: 'manual', description: 'Jantar', eaten_at: new Date(Date.now() + 60_000).toISOString(), confirmed_consumed: true,
    } });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { code: 'INVALID_INPUT', message: 'Não foi possível processar este pedido agora. Tente novamente.', quotaReserved: false });
  });
  await scenario('histórico: compare recalcula a partir do pedido salvo, inclusive hora zero e campos opcionais', async () => {
    const cookie = await session(), key = crypto.randomUUID();
    const body = { mode: 'compare', meal: 'jantar', people: 1, time_minutes: 15,
      ingredient_policy: 'suggest', ingredients: [], equipment: [], avoid_equipment: ['forno'], max_dishes: 0,
      hourly_rate_brl: 0, preferences: 'Pouco sal', budget_brl: 30 };
    const first = await send('/generate', { cookie, key, body }); assert.equal(first.status, 200);
    const original = await first.json();
    const stored = JSON.parse((await db.prepare('SELECT data_json FROM plans').first()).data_json);
    assert.equal(Object.hasOwn(stored, 'comparison'), false); assert.deepEqual(stored.request, body);
    const repeat = await send('/generate', { cookie, key, body: { ...body, hourly_rate_brl: 50 } });
    assert.equal(repeat.status, 409);
    const plan = (await repeat.json()).replay.plan;
    assert.deepEqual(plan.request, body); assert.deepEqual(plan.comparison, original.comparison);
    assert.equal(await calls(), 1);
  });
  await scenario('histórico: replay de compare com um ou ambos os lados recusados', async () => {
    const cookie = await session();
    const body = { mode: 'compare', meal: 'jantar', people: 1, time_minutes: 15, ingredient_policy: 'suggest', ingredients: [] };
    for (const kind of ['compare-cook-none', 'compare-ready-none', 'compare-both-none']) {
      const key = crypto.randomUUID();
      const first = await send('/generate', { cookie, key, body, headers: { 'X-Test-Provider': kind } });
      assert.equal(first.status, 200); const original = await first.json();
      const repeat = await send('/generate', { cookie, key, body }); assert.equal(repeat.status, 409);
      const plan = (await repeat.json()).replay.plan;
      assert.deepEqual(plan.data, original.data); assert.deepEqual(plan.comparison, original.comparison);
    }
    assert.equal(await calls(), 3);
  });
  await scenario('histórico: falha de geração não tem plano para replay e não devolve cota', async () => {
    const cookie = await session();
    for (const kind of ['invalid', 'schema-400', 'empty']) {
      const key = crypto.randomUUID();
      assert.equal((await send('/generate', { cookie, key, headers: { 'X-Test-Provider': kind } })).status, 502);
      const repeat = await send('/generate', { cookie, key }); assert.equal(repeat.status, 409);
      const value = await repeat.json(); assert.equal(value.replay.available, false); assert.equal(value.replay.plan, null);
    }
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM plans').first()).n, 0);
    assert.equal(await calls(), 3);
    assert.equal((await send('/generate', { cookie })).status, 429);
  });
  await scenario('histórico: falha de gravação D1 não anuncia sucesso nem tenta novamente', async () => {
    const cookie = await session(), key = crypto.randomUUID();
    await db.prepare("CREATE TRIGGER test_plan_abort BEFORE INSERT ON plans BEGIN SELECT RAISE(ABORT, 'SQL_PRIVADO'); END").run();
    try {
      const response = await send('/generate', { cookie, key }); assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { code: 'SERVICE_UNAVAILABLE', message: 'O serviço está temporariamente indisponível.', quotaReserved: true });
      assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM plans').first()).n, 0);
    } finally { await db.prepare('DROP TRIGGER test_plan_abort').run(); }
    const repeat = await send('/generate', { cookie, key }); assert.equal(repeat.status, 409);
    assert.equal((await repeat.json()).replay.available, false); assert.equal(await calls(), 1);
    assert.equal((await db.prepare("SELECT reserved_tokens FROM usage_buckets WHERE bucket_key='generation:Day:all'").first()).reserved_tokens, policy.generation.reserveTokens);
  });
  await scenario('histórico: mesma chave entre dois visitantes gera dois planos isolados', async () => {
    const a = await session(), b = await session(), key = crypto.randomUUID();
    assert.equal((await send('/generate', { cookie: a, key })).status, 200);
    const first = await db.prepare('SELECT id, visitor_id FROM plans').first();
    assert.equal((await send('/generate', { cookie: b, key, body: { ...ready, visitor_id: first.visitor_id } })).status, 400);
    assert.equal((await send('/generate', { cookie: b, key })).status, 200);
    const replayA = await send('/generate', { cookie: a, key }), replayB = await send('/generate', { cookie: b, key });
    assert.equal(replayA.status, 409); assert.equal(replayB.status, 409);
    const planA = (await replayA.json()).replay.plan, planB = (await replayB.json()).replay.plan;
    assert.equal(planA.id, first.id); assert.notEqual(planA.id, planB.id);
    assert.equal((await db.prepare('SELECT COUNT(DISTINCT visitor_id) AS n FROM plans').first()).n, 2);
    assert.equal(await calls(), 2);
  });
  await scenario('histórico: recibo limpo não apaga replay; expiração da sessão bloqueia acesso', async () => {
    const cookie = await session(), key = crypto.randomUUID();
    assert.equal((await send('/generate', { cookie, key })).status, 200);
    await db.prepare("UPDATE usage_reservations SET expires_at='2000-01-01T00:00:00.000Z' WHERE operation='generation'").run();
    const repeat = await send('/generate', { cookie, key }); assert.equal(repeat.status, 409);
    assert.equal((await repeat.json()).replay.available, true); assert.equal(await calls(), 1);
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM usage_reservations WHERE operation='generation'").first()).n, 0);
    await db.prepare("UPDATE visitors SET created_at='2000-01-01 00:00:00'").run();
    assert.equal((await send('/generate', { cookie, key })).status, 401); assert.equal(await calls(), 1);
    // Expiração de acesso não equivale à remoção física; limpeza de produto ainda pendente.
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM plans').first()).n, 1);
  });
  const personalized = { PERSONALIZATION_ENABLED: 'true' };
  const prefs = (cookie, use_history, defaults = {}) => send('/preferences', { cookie, method: 'PUT', overrides: personalized,
    body: { version: 1, use_history, defaults } });
  const seedMeal = async (visitorId, description, eatenAt = new Date().toISOString(), planId = null) => {
    const id = crypto.randomUUID();
    await db.prepare('INSERT INTO meal_logs (id, visitor_id, plan_id, eaten_at, data_json) VALUES (?1, ?2, ?3, ?4, ?5)')
      .bind(id, visitorId, planId, eatenAt, JSON.stringify({ version: 1, description, source: 'manual', steps: ['PASSO_NAO_ENVIAR'] })).run();
    return id;
  };
  const lastSent = async () => JSON.parse((await db.prepare('SELECT body_json FROM test_provider_requests ORDER BY rowid DESC LIMIT 1').first()).body_json);
  await scenario('preferências: padrão desligado, salva/reabre, não chama IA e respeita flags', async () => {
    const cookie = await session();
    assert.equal((await send('/preferences', { cookie, method: 'GET' })).status, 503);
    const initial = await send('/preferences', { cookie, method: 'GET', overrides: personalized });
    assert.deepEqual(await initial.json(), { data: { version: 1, use_history: false, defaults: {} } });
    assert.equal((await prefs(cookie, true, { people: 2 })).status, 200);
    const read = await send('/preferences', { cookie, method: 'GET', overrides: { ...personalized, AI_ENABLED: 'false', GROQ_API_KEY: null } });
    assert.equal(read.status, 200); assert.equal(read.headers.get('Cache-Control'), 'no-store');
    assert.deepEqual(await read.json(), { data: { version: 1, use_history: true, defaults: { people: 2 } } });
    assert.equal(await calls(), 0);
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM usage_reservations WHERE operation IN ('generation','vision')").first()).n, 0);
    assert.equal((await send('/preferences', { method: 'GET', overrides: personalized })).status, 401);
  });
  await scenario('preferências: dois visitantes isolados e corpo não autoriza outro dono', async () => {
    const a = await session(); const owner = (await db.prepare('SELECT id FROM visitors').first()).id; const b = await session();
    await prefs(a, true, { people: 2 }); await prefs(b, false, { people: 4 });
    const attack = await send('/preferences', { cookie: b, method: 'PUT', overrides: personalized,
      body: { version: 1, use_history: false, defaults: {}, visitor_id: owner } });
    assert.equal(attack.status, 400);
    const original = await send('/preferences', { cookie: a, method: 'GET', overrides: personalized });
    assert.equal((await original.json()).data.use_history, true);
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM preferences').first()).n, 2);
  });
  for (const mode of ['cook', 'ready']) {
    await scenario(`personalização ${mode}: ligar/desligar/reativar só afeta novos envios, sem apagar diário`, async () => {
      const cookie = await session(), visitor = (await db.prepare('SELECT id FROM visitors').first()).id;
      await seedMeal(visitor, 'Arroz com feijão');
      const body = mode === 'ready' ? ready : { ...ready, mode, time_minutes: 30, ingredient_policy: 'suggest', ingredients: [] };
      for (const active of [true, false, true]) {
        assert.equal((await prefs(cookie, active, { people: 20 })).status, 200);
        assert.equal((await send('/generate', { cookie, body, overrides: personalized })).status, 200);
        const sent = await lastSent();
        assert.equal(sent.messages.length, active ? 3 : 2);
        assert.deepEqual(JSON.parse(sent.messages[1].content), body);
        if (active) assert.equal(JSON.parse(sent.messages[2].content).meals[0].description, 'Arroz com feijão');
      }
      assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM meal_logs').first()).n, 1);
      assert.equal(await calls(), 3);
    });
  }
  await scenario('personalização: compare ativo não consulta preferência/diário e não envia recorte', async () => {
    const cookie = await session(), visitor = (await db.prepare('SELECT id FROM visitors').first()).id;
    await prefs(cookie, true); await seedMeal(visitor, 'HISTORICO_NAO_ENVIAR');
    const response = await send('/generate', { cookie, overrides: personalized, headers: { 'X-Test-No-History-Reads': 'true' },
      body: { ...ready, mode: 'compare', time_minutes: 30, ingredient_policy: 'suggest', ingredients: [] } });
    assert.equal(response.status, 200); assert.equal((await lastSent()).messages.length, 2);
    assert.equal(JSON.stringify(await lastSent()).includes('HISTORICO_NAO_ENVIAR'), false);
  });
  await scenario('personalização: janela, limites de caracteres e dono aplicados em D1 antes do envio', async () => {
    const a = await session(), owner = (await db.prepare('SELECT id FROM visitors').first()).id;
    const b = await session(), foreign = (await db.prepare('SELECT id FROM visitors WHERE id != ?1').bind(owner).first()).id;
    await prefs(a, true); await prefs(b, true);
    for (let i = 0; i < 8; i++) await seedMeal(owner, 'Refeição própria '.repeat(20), new Date(Date.now() - 1000 - i * 1000).toISOString());
    await seedMeal(owner, 'ANTIGA_NAO_ENVIAR', new Date(Date.now() - 8 * 86400000).toISOString());
    await seedMeal(foreign, 'ALHEIA_NAO_ENVIAR');
    assert.equal((await send('/generate', { cookie: a, overrides: personalized })).status, 200);
    const content = (await lastSent()).messages[2].content;
    assert.ok([...content].length <= 1200); assert.ok(JSON.parse(content).meals.length <= 4);
    for (const meal of JSON.parse(content).meals) {
      assert.ok([...meal.description].length <= 120); assert.ok([...JSON.stringify(meal)].length <= 300);
    }
    for (const forbidden of ['PASSO_NAO_ENVIAR', 'ANTIGA_NAO_ENVIAR', 'ALHEIA_NAO_ENVIAR']) assert.equal(content.includes(forbidden), false);
  });
  await scenario('personalização: exclusão no banco reflete no envio seguinte; não implementa rota de diário', async () => {
    const cookie = await session(), owner = (await db.prepare('SELECT id FROM visitors').first()).id;
    await prefs(cookie, true); const id = await seedMeal(owner, 'Excluir do contexto');
    await send('/generate', { cookie, overrides: personalized }); assert.equal((await lastSent()).messages.length, 3);
    await db.prepare('DELETE FROM meal_logs WHERE visitor_id = ?1 AND id = ?2').bind(owner, id).run();
    await send('/generate', { cookie, overrides: personalized }); assert.equal((await lastSent()).messages.length, 2);
  });
  await scenario('preferências: erro de escrita não confirma desligamento; permissão inválida não envia histórico', async () => {
    const cookie = await session(), owner = (await db.prepare('SELECT id FROM visitors').first()).id;
    await prefs(cookie, true); await seedMeal(owner, 'Minha refeição');
    await db.prepare("CREATE TRIGGER prefs_abort BEFORE UPDATE ON preferences BEGIN SELECT RAISE(ABORT, 'SQL_PRIVADO'); END").run();
    try {
      const failed = await prefs(cookie, false); assert.equal(failed.status, 503);
      assert.equal((await failed.json()).code, 'SERVICE_UNAVAILABLE');
    } finally { await db.prepare('DROP TRIGGER prefs_abort').run(); }
    assert.equal(JSON.parse((await db.prepare('SELECT data_json FROM preferences WHERE visitor_id = ?1').bind(owner).first()).data_json).use_history, true);
    await db.prepare('UPDATE preferences SET data_json = ?1 WHERE visitor_id = ?2')
      .bind(JSON.stringify({ version: 1, use_history: 'true', defaults: {} }), owner).run();
    assert.equal((await send('/generate', { cookie, overrides: personalized })).status, 200);
    assert.equal((await lastSent()).messages.length, 2);
  });
  await checkDiaryRuntime({ db, send, session, scenario, calls, policy });
  await checkPantryRuntime({ db, send, session, scenario, calls, policy });
  await checkPriorityRuntime({ db, send, session, scenario, calls, policy });
  await checkDeletionRuntime({ db, send, session, scenario, calls, policy });
  await checkVideoRuntime({ db, send, session, scenario, calls, policy });
  console.log(`Backend: ${checks} cenários de integração aprovados. Todas as chamadas Groq foram simuladas.`);
} finally { await mf.dispose(); }
