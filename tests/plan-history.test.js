import test from 'node:test';
import assert from 'node:assert/strict';
import { historyDb } from './helpers/history-db.js';
import { createApiHandlers } from '../src/http/api.js';
import { planDocument, restorePlan, savePlan, findPlan } from '../src/history/plans.js';
import { resolveVisitorSession } from '../src/security/session.js';
import { usageReservationId } from '../src/security/quota.js';
import { ProviderError } from '../src/providers/groq-client.js';
import { calculateComparison } from '../src/comparison/calculate.js';

const ready = { mode: 'ready', meal: 'jantar', people: 2 };
const cook = { mode: 'cook', meal: 'jantar', people: 2, time_minutes: 30,
  ingredient_policy: 'can_buy_missing', ingredients: ['arroz'], equipment: [],
  avoid_equipment: ['forno'], max_dishes: 0, budget_brl: 19.99, preferences: 'Pouco sal' };
const compare = { ...cook, mode: 'compare', hourly_rate_brl: 0 };
const recipe = { title: 'Arroz', servings: 2, total_minutes: 20,
  ingredients: [{ name: 'arroz', quantity: 100, unit: 'g' }], steps: ['Prepare o arroz.'] };
const delivery = { title: 'Arroz pronto', servings: 2, description: 'Uma opção para buscar.', search_term: 'arroz pronto' };
const noOption = { status: 'not_suggested', reason: 'Não foi encontrada opção compatível.' };
const output = mode => mode === 'compare'
  ? { version: 1, mode, cook: { status: 'suggested', suggestions: [structuredClone(recipe)] },
    ready: { status: 'suggested', suggestions: [{ ...delivery, estimated_price_brl: { value: 19.99, origin: 'estimado' } }] } }
  : { version: 1, mode, suggestions: [structuredClone(mode === 'cook' ? recipe : delivery)] };
const metadata = { model: 'openai/gpt-oss-20b',
  usage: { prompt_tokens: 2100, completion_tokens: 1100, total_tokens: 3200, reasoning_tokens: null }, elapsed_ms: 1 };
const result = mode => ({ data: output(mode), metadata: structuredClone(metadata) });

async function setup(t) {
  const DB = historyDb(); t.after(() => DB.sqlite.close());
  const base = { visitorDay: 1000, visitorMinute: 1000, networkDay: 1000, networkMinute: 1000,
    globalDay: 1000, globalMinute: 1000, dayTokens: 0, minuteTokens: 0, reserveTokens: 0 };
  const policy = { ingress: base, session: base,
    generation: { ...base, visitorDay: 3, reserveTokens: 4096, dayTokens: 1000000, minuteTokens: 1000000 } };
  const env = { DB, SESSIONS_ENABLED: 'true', AI_ENABLED: 'true',
    SESSION_SECRET: 'fake-history-session-secret-not-production', IP_HASH_SECRET: 'fake-history-network-secret-not-production',
    GROQ_API_KEY: 'fake-no-network-key', QUOTA_POLICY_JSON: JSON.stringify(policy) };
  const state = { calls: 0, error: null, data: null };
  const handlers = createApiHandlers({ fetchImpl: async (_, init) => {
    state.calls++;
    if (state.error === 'TIMEOUT') throw new ProviderError('TIMEOUT');
    if (state.error === 'PROVIDER_SCHEMA_REJECTED') return Response.json({ error: { code: 'json_validate_failed' } }, { status: 400 });
    const request = JSON.parse(init.body);
    const input = JSON.parse(request.messages[1].content);
    const data = state.error === 'INVALID_OUTPUT' ? {} : state.data ?? output(input.mode);
    return Response.json({ model: request.model, usage: metadata.usage,
      choices: [{ finish_reason: state.error === 'TRUNCATED' ? 'length' : 'stop', message: { content: JSON.stringify(data) } }] });
  } });
  const request = ({ cookie = '', key = crypto.randomUUID(), body = ready, headers = {} } = {}) => new Request('https://history.test/api/generate', {
    method: 'POST', headers: { Origin: 'https://history.test', 'Content-Type': 'application/json',
      'CF-Connecting-IP': '192.0.2.1', 'Idempotency-Key': key, Cookie: cookie, ...headers }, body: JSON.stringify(body),
  });
  const session = async () => {
    const response = await handlers.session({ env, request: request({ body: {} }) });
    assert.equal(response.status, 201);
    return response.headers.get('Set-Cookie').split(';')[0];
  };
  const send = options => handlers.generate({ env, request: request(options) });
  const cookie = await session();
  const visitor = await resolveVisitorSession(request({ cookie }), env);
  const rows = () => DB.sqlite.prepare('SELECT * FROM plans').all().map(row => ({ ...row }));
  const quota = () => DB.sqlite.prepare("SELECT * FROM usage_buckets WHERE bucket_key LIKE 'generation:%' ORDER BY scope, bucket_key, day_utc").all();
  return { DB, env, policy, state, handlers, request, send, session, cookie, visitor, rows, quota };
}

test('diagnóstico técnico permanece no log e HTTP conserva resposta exata', async t => {
  const h = await setup(t);
  const logs = [];
  t.mock.method(console, 'log', line => logs.push(JSON.parse(line)));
  const handlers = createApiHandlers({ fetchImpl: async () => {
    throw new TypeError('SECRET https://private', { cause: { code: 'ENOTFOUND' } });
  } });
  const response = await handlers.generate({ env: h.env, request: h.request({ cookie: h.cookie }) });
  assert.equal(response.status, 503);
  assert.equal(await response.text(), JSON.stringify({ code: 'SERVICE_UNAVAILABLE', message: 'O serviço está temporariamente indisponível.', quotaReserved: true }));
  assert.equal(logs.at(-1).diagnostic.category, 'DNS');
  assert.doesNotMatch(JSON.stringify(logs), /SECRET|private/);
});

test('histórico HTTP: lista e exclui somente planos da sessão', async t => {
  const h = await setup(t); await h.send({ cookie: h.cookie, body: cook });
  const headers = { Origin: 'https://history.test', Cookie: h.cookie, 'CF-Connecting-IP': '192.0.2.1' };
  const listed = await h.handlers.plans({ env: h.env, request: new Request('https://history.test/api/plans', { headers }) });
  assert.equal(listed.status, 200); const plans = (await listed.json()).data;
  assert.equal(plans.length, 1); assert.equal(plans[0].data.suggestions[0].title, 'Arroz');
  const removed = await h.handlers.plans({ env: h.env, params: { id: plans[0].id }, request: new Request(`https://history.test/api/plans/${plans[0].id}`, { method: 'DELETE', headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() } }) });
  assert.equal(removed.status, 200); assert.equal(h.rows().length, 0);
});

for (const input of [cook, ready, compare]) {
  test(`histórico ${input.mode}: pedido e saída persistidos antes do 200; replay não chama provedor nem reserva IA`, async t => {
    const h = await setup(t), key = crypto.randomUUID();
    const first = await h.send({ cookie: h.cookie, key, body: input });
    assert.equal(first.status, 200);
    const firstBody = await first.json(), rows = h.rows();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].visitor_id, h.visitor.visitorId);
    assert.equal(rows[0].expires_at, h.visitor.expiresAt);
    const saved = JSON.parse(rows[0].data_json);
    assert.deepEqual(saved.request, input); assert.deepEqual(saved.output, firstBody.data);
    assert.deepEqual(saved.metadata, firstBody.metadata);
    assert.equal(Object.hasOwn(saved, 'comparison'), false);
    assert.deepEqual(Object.keys(firstBody).sort(), ['data', 'metadata', 'plan_id', 'quota', ...(input.mode === 'compare' ? ['comparison'] : [])].sort());
    assert.equal(firstBody.plan_id, rows[0].id);
    assert.equal(rows[0].generation_key, await usageReservationId('generation', h.visitor.visitorId, key));
    const before = h.quota(), traceStart = h.DB.trace.length;
    h.state.error = 'INVALID_OUTPUT'; // Se o replay tocar o modelo, falhará.
    const second = await h.send({ cookie: h.cookie, key: key.toUpperCase(), body: input });
    assert.equal(second.status, 409); assert.equal(second.headers.get('Cache-Control'), 'no-store');
    const replay = await second.json();
    assert.equal(replay.code, 'DUPLICATE_REQUEST'); assert.equal(replay.quotaReserved, false);
    assert.equal(replay.replay.available, true); assert.equal(replay.replay.plan.status, 'draft');
    assert.equal(replay.replay.plan.id, rows[0].id);
    assert.deepEqual(replay.replay.plan.request, input);
    assert.deepEqual(replay.replay.plan.data, firstBody.data);
    assert.deepEqual(replay.replay.plan.metadata, firstBody.metadata);
    assert.deepEqual(replay.replay.plan.comparison, firstBody.comparison);
    assert.deepEqual(h.quota(), before); assert.equal(h.state.calls, 1); assert.equal(h.rows().length, 1);
    assert.equal(h.DB.trace.slice(traceStart).filter(sql => sql.includes('INSERT INTO usage_reservations')).length, 1); // Só ingress.
    assert.equal(h.DB.sqlite.prepare("SELECT requests FROM usage_buckets WHERE bucket_key='ingress:Day:all'").get().requests, 2);
    assert.equal(h.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM meal_logs').get().n, 0);
  });
}

test('histórico: aguarda a gravação terminar antes de resolver a resposta HTTP', async t => {
  const h = await setup(t);
  let enter, release, finished = false;
  const entered = new Promise(resolve => { enter = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  h.DB.before = async sql => { if (sql.includes('INSERT INTO plans')) { enter(); await gate; } };
  const pending = h.send({ cookie: h.cookie }).then(response => { finished = true; return response; });
  await entered;
  assert.equal(finished, false); assert.equal(h.rows().length, 0);
  release(); assert.equal((await pending).status, 200); assert.equal(h.rows().length, 1);
});

for (const sides of [['cook'], ['ready'], ['cook', 'ready']]) {
  test(`histórico compare: replay de recusa em ${sides.join(' e ')}`, async t => {
    const h = await setup(t), key = crypto.randomUUID();
    h.state.data = output('compare');
    for (const side of sides) h.state.data[side] = structuredClone(noOption);
    const first = await h.send({ cookie: h.cookie, key, body: compare });
    assert.equal(first.status, 200);
    const original = await first.json();
    const response = await h.send({ cookie: h.cookie, key, body: compare });
    assert.equal(response.status, 409);
    const { replay } = await response.json();
    assert.deepEqual(replay.plan.data, original.data);
    assert.deepEqual(replay.plan.comparison, original.comparison);
    for (const side of sides) assert.deepEqual(replay.plan.data[side], noOption);
    assert.equal(h.state.calls, 1);
  });
}

for (const code of ['INVALID_OUTPUT', 'TRUNCATED', 'TIMEOUT', 'PROVIDER_SCHEMA_REJECTED']) {
  test(`histórico: ${code} não grava plano e reenvio declara ausência sem retry/estorno`, async t => {
    const h = await setup(t), key = crypto.randomUUID(); h.state.error = code;
    const failed = await h.send({ cookie: h.cookie, key });
    assert.equal(failed.status, code === 'TIMEOUT' ? 504 : 502);
    assert.equal((await failed.json()).code, code); assert.equal(h.rows().length, 0);
    const before = h.quota();
    const repeated = await h.send({ cookie: h.cookie, key });
    assert.equal(repeated.status, 409);
    const body = await repeated.json();
    assert.deepEqual(body.replay, { available: false, plan: null,
      message: 'Não há plano salvo disponível para este pedido. Nenhuma nova geração foi iniciada.' });
    assert.equal(body.quotaReserved, false); assert.deepEqual(h.quota(), before); assert.equal(h.state.calls, 1);
  });
}

test('histórico: falha SQL ao gravar retorna 503 sem plano, sem detalhes internos ou estorno', async t => {
  const h = await setup(t), key = crypto.randomUUID();
  h.DB.sqlite.exec("CREATE TRIGGER test_plan_fail BEFORE INSERT ON plans BEGIN SELECT RAISE(ABORT, 'SQL_PRIVADO'); END;");
  const response = await h.send({ cookie: h.cookie, key });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { code: 'SERVICE_UNAVAILABLE', message: 'O serviço está temporariamente indisponível.', quotaReserved: true });
  assert.equal(h.rows().length, 0);
  assert.equal(h.quota().find(row => row.bucket_key === 'generation:Day:all').reserved_tokens, 4096);
  h.DB.sqlite.exec('DROP TRIGGER test_plan_fail');
  const replay = await h.send({ cookie: h.cookie, key });
  assert.equal(replay.status, 409); assert.equal((await replay.json()).replay.available, false);
  assert.equal(h.state.calls, 1);
});

test('histórico: recibo em andamento responde 409 sem plano até a gravação concluir', async t => {
  const h = await setup(t), key = crypto.randomUUID();
  let enter, release;
  const entered = new Promise(resolve => { enter = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  h.DB.before = async sql => { if (sql.includes('INSERT INTO plans')) { enter(); await gate; } };
  const first = h.send({ cookie: h.cookie, key }); await entered;
  const during = await h.send({ cookie: h.cookie, key });
  assert.equal(during.status, 409); assert.equal((await during.json()).replay.available, false);
  release(); assert.equal((await first).status, 200);
  const after = await h.send({ cookie: h.cookie, key });
  assert.equal((await after.json()).replay.available, true); assert.equal(h.state.calls, 1);
});

test('histórico: chave idêntica entre visitantes nunca recupera plano alheio; corpo não impõe dono', async t => {
  const h = await setup(t), key = crypto.randomUUID(), otherCookie = await h.session();
  await h.send({ cookie: h.cookie, key });
  const firstId = h.rows()[0].id;
  const other = await resolveVisitorSession(h.request({ cookie: otherCookie }), h.env);
  const derived = await usageReservationId('generation', h.visitor.visitorId, key);
  assert.equal(await findPlan(h.env, other, derived), null);
  for (const body of [{ ...ready, visitor_id: h.visitor.visitorId }, { ...ready, visitorId: h.visitor.visitorId }]) {
    assert.equal((await h.send({ cookie: otherCookie, key, body })).status, 400);
  }
  assert.equal((await h.send({ key })).status, 401);
  assert.equal((await h.send({ cookie: otherCookie, key })).status, 200);
  const repeated = await h.send({ cookie: otherCookie, key });
  const plan = (await repeated.json()).replay.plan;
  assert.notEqual(plan.id, firstId); assert.equal(h.rows().length, 2); assert.equal(h.state.calls, 2);
  assert.equal(h.rows().find(row => row.id === plan.id).visitor_id, other.visitorId);
});

test('histórico: mesma entrada com chaves novas permite planos distintos; chave repetida mantém pedido original', async t => {
  const h = await setup(t), key = crypto.randomUUID();
  await h.send({ cookie: h.cookie, key });
  h.state.data = output('ready'); h.state.data.suggestions[0].title = 'Outra opção';
  assert.equal((await h.send({ cookie: h.cookie })).status, 200);
  assert.equal(h.rows().length, 2);
  const replay = await h.send({ cookie: h.cookie, key, body: { ...ready, meal: 'outro pedido' } });
  assert.equal(replay.status, 409);
  const plan = (await replay.json()).replay.plan;
  assert.equal(plan.request.meal, 'jantar'); assert.equal(plan.data.suggestions[0].title, 'Arroz pronto');
  assert.equal(h.state.calls, 2);
});

test('histórico: replay sobrevive ao recibo limpo, não exige saldo de IA, mas respeita ingress', async t => {
  const h = await setup(t), key = crypto.randomUUID();
  await h.send({ cookie: h.cookie, key });
  await h.send({ cookie: h.cookie }); await h.send({ cookie: h.cookie });
  h.DB.sqlite.exec("UPDATE usage_reservations SET expires_at='2000-01-01T00:00:00.000Z' WHERE operation='generation'");
  const before = h.quota();
  const replay = await h.send({ cookie: h.cookie, key });
  assert.equal(replay.status, 409); assert.equal((await replay.json()).replay.available, true);
  assert.deepEqual(h.quota(), before); assert.equal(h.state.calls, 3);
  assert.equal((await h.send({ cookie: h.cookie })).status, 429);
  h.env.QUOTA_POLICY_JSON = JSON.stringify({ ...h.policy, ingress: { ...h.policy.ingress, globalDay: 1 } });
  assert.equal((await h.send({ cookie: h.cookie, key })).status, 429); assert.equal(h.state.calls, 3);
});

test('histórico: expiração absoluta, sem renovar planos; consulta ignora expirado e sessão expirada não recupera', async t => {
  const h = await setup(t), now = Date.now(), generationKey = 'a'.repeat(64);
  const visitor = { ...h.visitor, expiresAt: new Date(now + 86400000).toISOString() };
  await savePlan(h.env, visitor, generationKey, ready, result('ready'), { now });
  assert.equal((await findPlan(h.env, visitor, generationKey, { now: now + 86399999 })).expires_at, visitor.expiresAt);
  assert.equal(await findPlan(h.env, visitor, generationKey, { now: now + 86400000 }), null);
  await assert.rejects(savePlan(h.env, visitor, 'b'.repeat(64), ready, result('ready'), { now: now + 86400000 }));
  h.DB.sqlite.exec("UPDATE visitors SET created_at='2000-01-01 00:00:00'");
  assert.equal((await h.send({ cookie: h.cookie })).status, 401); assert.equal(h.state.calls, 0);
});

test('histórico: falha de leitura/versão desconhecida não provoca IA nem replay inventado', async t => {
  const h = await setup(t), key = crypto.randomUUID();
  await h.send({ cookie: h.cookie, key });
  h.DB.sqlite.exec("UPDATE plans SET data_json=json_set(data_json, '$.calculation_version', 2)");
  assert.equal((await h.send({ cookie: h.cookie, key })).status, 503);
  h.DB.before = sql => { if (sql.includes('FROM plans')) throw Error('SQL_PRIVADO'); };
  assert.equal((await h.send({ cookie: h.cookie })).status, 503); assert.equal(h.state.calls, 1);
});

test('histórico: recusa legada continua INVALID_OUTPUT, sem plano', async t => {
  const h = await setup(t); h.state.data = { version: 1, mode: 'ready', suggestions: [] };
  const response = await h.send({ cookie: h.cookie });
  assert.equal(response.status, 502); assert.equal((await response.json()).code, 'INVALID_OUTPUT');
  assert.equal(h.rows().length, 0);
});

test('histórico: round-trip JSON reproduz comparison inteiro, ausências, zero, estimativas e ordem de duas alternativas', () => {
  for (const rate of [undefined, 0, 19.99]) {
    for (const missing of [[], ['cook'], ['ready'], ['cook', 'ready']]) {
      const input = { ...compare }; if (rate === undefined) delete input.hourly_rate_brl; else input.hourly_rate_brl = rate;
      const value = result('compare');
      value.data.cook.suggestions.push({ ...structuredClone(recipe), total_minutes: 30 });
      value.data.ready.suggestions.push({ ...delivery }); // Preço ausente, não zero.
      for (const side of missing) value.data[side] = noOption;
      const document = planDocument(input, value);
      const plan = restorePlan({ id: crypto.randomUUID(), model: metadata.model, data_json: JSON.stringify(document),
        created_at: '2026-09-12T00:00:00.000Z', expires_at: '2026-10-12T00:00:00.000Z' });
      assert.deepEqual(plan.request, input);
      assert.deepEqual(plan.comparison, calculateComparison(input, value.data));
      assert.deepEqual(plan.data, value.data);
    }
  }
});

test('histórico: documento limita metadados e preserva ausência de opcionais', () => {
  const value = result('ready'); value.metadata.extra = 'Não persistir'; value.extra = 'Não persistir';
  assert.deepEqual(planDocument(ready, value).request, ready);
  assert.equal(JSON.stringify(planDocument(ready, value)).includes('Não persistir'), false);
  const doc = planDocument(cook, result('cook'));
  assert.deepEqual(doc.request.equipment, []); assert.equal(doc.request.max_dishes, 0);
  for (const field of ['version', 'contract_version', 'calculation_version']) {
    assert.throws(() => restorePlan({ data_json: JSON.stringify({ ...doc, [field]: 99 }) }));
  }
});
