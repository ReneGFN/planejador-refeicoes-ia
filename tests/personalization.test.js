import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { historyDb } from './helpers/history-db.js';
import { createApiHandlers } from '../src/http/api.js';
import { onRequestGet, onRequestPut } from '../functions/api/preferences.js';
import { resolveVisitorSession } from '../src/security/session.js';
import { validatePreferences, emptyPreferences } from '../src/contracts/preferences.js';
import { readPreferences, writePreferences } from '../src/history/preferences.js';
import { buildHistoryContext, selectHistoryContext, HISTORY_LIMITS, characterCount } from '../src/history/context.js';
import { savePlan } from '../src/history/plans.js';
import { generateWithGroq } from '../src/providers/groq.js';
import { generationSystem } from '../src/providers/generation-prompts.js';

const ready = { mode: 'ready', meal: 'jantar', people: 2 };
const cook = { ...ready, mode: 'cook', time_minutes: 30, ingredient_policy: 'only_available', ingredients: ['banana'] };
const preference = (use_history, defaults = {}) => ({ version: 1, use_history, defaults });
const recipe = people => ({ title: 'Banana', servings: people, total_minutes: 1,
  ingredients: [{ name: 'banana', quantity: 2, unit: 'unit' }], steps: ['PASSO_NAO_E_FONTE_DE_HISTORICO'] });
const dish = people => ({ title: 'Arroz pronto', description: 'Uma opção para buscar.', search_term: 'arroz pronto', servings: people });
const output = input => input.mode === 'compare'
  ? { version: 1, mode: 'compare', cook: { status: 'suggested', reason: null, suggestions: [recipe(input.people)] },
    ready: { status: 'suggested', reason: null, suggestions: [{ ...dish(input.people), estimated_price_brl: null }] } }
  : { version: 1, mode: input.mode, suggestions: [input.mode === 'cook' ? recipe(input.people) : dish(input.people)] };
const fakeResult = () => ({ data: output(cook), metadata: { model: 'openai/gpt-oss-20b', elapsed_ms: 1,
  usage: { prompt_tokens: 1000, completion_tokens: 100, total_tokens: 1100, reasoning_tokens: null } } });

async function setup(t) {
  const DB = historyDb(); t.after(() => DB.sqlite.close());
  const base = { visitorDay: 1000, visitorMinute: 1000, networkDay: 1000, networkMinute: 1000,
    globalDay: 1000, globalMinute: 1000, dayTokens: 0, minuteTokens: 0, reserveTokens: 0 };
  const policy = { ingress: base, session: base,
    generation: { ...base, visitorDay: 3, reserveTokens: 4096, dayTokens: 1000000, minuteTokens: 1000000 } };
  const env = { DB, PERSONALIZATION_ENABLED: 'true', SESSIONS_ENABLED: 'true', AI_ENABLED: 'true',
    SESSION_SECRET: 'fake-prefs-session-secret-not-production', IP_HASH_SECRET: 'fake-prefs-network-secret-not-production',
    GROQ_API_KEY: 'fake-no-network-key', QUOTA_POLICY_JSON: JSON.stringify(policy) };
  const state = { sent: [] };
  const handlers = createApiHandlers({ fetchImpl: async (_, init) => {
    const body = JSON.parse(init.body); state.sent.push(body);
    const input = JSON.parse(body.messages[1].content);
    return Response.json({ model: body.model, usage: { prompt_tokens: 1000, completion_tokens: 100, total_tokens: 1100 },
      choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(output(input)) } }] });
  } });
  const request = ({ method = 'POST', cookie = '', body = ready, key = crypto.randomUUID(), headers = {}, url = 'https://prefs.test/api/generate' } = {}) => new Request(url, {
    method, headers: { Origin: 'https://prefs.test', 'Content-Type': 'application/json', Cookie: cookie,
      'CF-Connecting-IP': '192.0.2.1', 'Idempotency-Key': key, ...headers },
    ...(method === 'GET' ? {} : { body: JSON.stringify(body) }),
  });
  const session = async () => {
    const response = await handlers.session({ env, request: request({ body: {} }) });
    assert.equal(response.status, 201);
    const cookie = response.headers.get('Set-Cookie').split(';')[0];
    return { cookie, visitor: await resolveVisitorSession(request({ cookie }), env) };
  };
  const a = await session();
  const prefs = ({ method = 'GET', cookie = a.cookie, ...options } = {}) => handlers.preferences({ env, request: request({ method, cookie, ...options }) });
  const generate = ({ cookie = a.cookie, ...options } = {}) => handlers.generate({ env, request: request({ cookie, ...options }) });
  const seed = (visitor = a.visitor, description = 'Arroz com feijão', { id = crypto.randomUUID(), eaten_at = new Date().toISOString(), plan_id = null, data = {} } = {}) => {
    DB.sqlite.prepare('INSERT INTO meal_logs(id, visitor_id, eaten_at, plan_id, data_json) VALUES (?, ?, ?, ?, ?)')
      .run(id, visitor.visitorId, eaten_at, plan_id, JSON.stringify({ version: 1, description, source: 'manual', ...data }));
    return id;
  };
  return { ...a, DB, env, policy, state, request, session, prefs, generate, seed };
}

test('preferências: padrão false, campos reutilizáveis e limites atuais sem aceitar formulário inteiro', () => {
  assert.deepEqual(emptyPreferences(), preference(false));
  const defaults = { people: 20, time_minutes: 240, equipment: [], avoid_equipment: ['forno'], max_dishes: 0,
    budget_brl: 19.99, preferences: 'Pouco sal' };
  assert.deepEqual(validatePreferences(preference(true, defaults)), preference(true, defaults));
  for (const raw of [null, {}, preference('true'), { ...preference(true), version: 2 }, { ...preference(true), visitor_id: 'externo' },
    preference(true, { ingredients: ['banana'] }), preference(true, { meal: 'jantar' }), preference(true, { history: [] }),
    preference(true, { people: 21 }), preference(true, { time_minutes: 0 }), preference(true, { equipment: ['FORNO'] }),
    preference(true, { budget_brl: 1.001 }), preference(true, { max_dishes: 21 }), preference(true, { preferences: 'a'.repeat(401) }),
    preference(true, { equipment: ['forno'], avoid_equipment: ['forno'] })]) assert.throws(() => validatePreferences(raw));
});

test('preferências HTTP: criar/ler/substituir/reabrir sessão válida, sem IA nem reserva de geração', async t => {
  const h = await setup(t);
  assert.deepEqual(await (await h.prefs()).json(), { data: preference(false) });
  const value = preference(true, { people: 3, time_minutes: 15, equipment: [], max_dishes: 0 });
  for (let i = 0; i < 2; i++) {
    const response = await h.prefs({ method: 'PUT', body: value }); assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { data: value });
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
  }
  const reopened = createApiHandlers();
  const response = await reopened.preferences({ env: h.env, request: h.request({ cookie: h.cookie, method: 'GET' }) });
  assert.deepEqual(await response.json(), { data: value });
  assert.deepEqual(await readPreferences(h.env, h.visitor), value);
  assert.equal(h.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM preferences').get().n, 1);
  assert.equal(h.state.sent.length, 0);
  assert.equal(h.DB.sqlite.prepare("SELECT COUNT(*) AS n FROM usage_reservations WHERE operation IN ('generation','vision')").get().n, 0);
});

test('preferências: isolamento em leitura e escrita; corpo não define visitante', async t => {
  const h = await setup(t), b = await h.session();
  await writePreferences(h.env, h.visitor, preference(true, { people: 2 }));
  assert.deepEqual(await readPreferences(h.env, b.visitor), preference(false));
  assert.deepEqual(await (await h.prefs({ cookie: b.cookie })).json(), { data: preference(false) });
  assert.equal((await h.prefs({ method: 'PUT', cookie: b.cookie, body: { ...preference(true), visitor_id: h.visitor.visitorId } })).status, 400);
  assert.equal((await h.prefs({ method: 'PUT', cookie: b.cookie, body: preference(false, { people: 4 }) })).status, 200);
  assert.equal((await readPreferences(h.env, h.visitor)).use_history, true);
  assert.equal((await readPreferences(h.env, b.visitor)).defaults.people, 4);
});

test('preferências: sem sessão, origem divergente, método não aceito e sessão expirada', async t => {
  const h = await setup(t);
  assert.equal((await h.prefs({ cookie: '' })).status, 401);
  for (const method of ['GET', 'PUT']) {
    assert.equal((await h.prefs({ method, body: preference(true), headers: { Origin: 'https://outro.test' } })).status, 403);
    assert.equal((await h.prefs({ method, body: preference(true), headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  }
  assert.equal((await h.prefs({ method: 'POST', body: preference(true) })).status, 403);
  h.DB.sqlite.exec("UPDATE visitors SET created_at='2000-01-01 00:00:00'");
  assert.equal((await h.prefs({ method: 'PUT', body: preference(true) })).status, 401);
});

test('preferências: flags desligadas bloqueiam; operação não depende de chave ou disponibilidade de IA', async t => {
  const h = await setup(t); h.env.AI_ENABLED = 'false'; delete h.env.GROQ_API_KEY;
  assert.equal((await h.prefs({ method: 'PUT', body: preference(true) })).status, 200);
  h.env.PERSONALIZATION_ENABLED = 'false'; assert.equal((await h.prefs()).status, 503);
  assert.equal((await onRequestGet({ env: {} })).status, 503);
  assert.equal((await onRequestPut({ env: {} })).status, 503);
  const config = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.equal((config.match(/"PERSONALIZATION_ENABLED": "false"/gu) ?? []).length, 2);
  assert.equal((config.match(/"PERSONALIZATION_ENABLED": "true"/gu) ?? []).length, 1);
  assert.equal(h.state.sent.length, 0);
});

test('preferências: ingress limita operações, sem exigir reserva de IA', async t => {
  const h = await setup(t);
  h.env.QUOTA_POLICY_JSON = JSON.stringify({ ...h.policy, ingress: { ...h.policy.ingress, globalMinute: 1 } });
  assert.equal((await h.prefs()).status, 200);
  assert.equal((await h.prefs({ method: 'PUT', body: preference(true) })).status, 429);
  assert.deepEqual(await readPreferences(h.env, h.visitor), preference(false));
});

test('preferências: falha ao desligar não confirma gravação nem apaga diário ou preferência anterior', async t => {
  const h = await setup(t); h.seed(); await writePreferences(h.env, h.visitor, preference(true));
  h.DB.sqlite.exec("CREATE TRIGGER prefs_abort BEFORE UPDATE ON preferences BEGIN SELECT RAISE(ABORT,'SQL_PRIVADO'); END;");
  const response = await h.prefs({ method: 'PUT', body: preference(false) });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { code: 'SERVICE_UNAVAILABLE', message: 'O serviço está temporariamente indisponível.', quotaReserved: false });
  assert.equal((await readPreferences(h.env, h.visitor)).use_history, true);
  assert.equal(h.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM meal_logs').get().n, 1);
});

for (const input of [cook, ready]) {
  test(`histórico ${input.mode}: liga, desliga e reativa; pedido atual preservado e sem gravar consumo`, async t => {
    const h = await setup(t); h.seed();
    assert.equal(await selectHistoryContext(h.env, h.visitor, input.mode), null); // Registrar não autoriza.
    for (const use of [true, false, true]) {
      assert.equal((await h.prefs({ method: 'PUT', body: preference(use, { people: 20, preferences: 'Outro padrão' }) })).status, 200);
      assert.equal((await h.generate({ body: input })).status, 200);
      const sent = h.state.sent.at(-1);
      assert.deepEqual(JSON.parse(sent.messages[1].content), input); // Defaults/histórico não substituem a ação atual.
      assert.equal(sent.messages.length, use ? 3 : 2);
      if (use) assert.equal(JSON.parse(sent.messages[2].content).meals[0].description, 'Arroz com feijão');
      assert.equal(sent.messages[0].content, generationSystem(input.mode));
      assert.equal(sent.max_completion_tokens, 4096);
    }
    assert.equal(h.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM meal_logs').get().n, 1);
    assert.equal(h.DB.sqlite.prepare("SELECT reserved_tokens FROM usage_buckets WHERE bucket_key='generation:Day:all'").get().reserved_tokens, 3 * 4096);
  });
}

test('histórico: compare com permissão ativa não consulta nem monta contexto; adaptador também bloqueia', async t => {
  const h = await setup(t); h.seed(); await writePreferences(h.env, h.visitor, preference(true));
  h.DB.before = sql => { if (/FROM preferences|FROM meal_logs/u.test(sql)) throw new Error('Consulta proibida para compare'); };
  const start = h.DB.trace.length;
  const input = { ...cook, mode: 'compare', hourly_rate_brl: 0 };
  assert.equal((await h.generate({ body: input })).status, 200);
  assert.equal(h.DB.trace.slice(start).some(sql => /FROM preferences|FROM meal_logs/u.test(sql)), false);
  assert.equal(h.state.sent[0].messages.length, 2);
  const forbiddenEnv = { PERSONALIZATION_ENABLED: 'true', get DB() { throw new Error('Não consultar'); } };
  assert.equal(await selectHistoryContext(forbiddenEnv, h.visitor, 'compare'), null);
  let direct;
  await generateWithGroq(input, { apiKey: 'fake-no-network-key', historyContext: 'HISTORICO_PROIBIDO', fetchImpl: async (_, init) => {
    direct = JSON.parse(init.body);
    return Response.json({ model: direct.model, choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(output(input)) } }] });
  } });
  assert.equal(direct.messages.length, 2); assert.equal(JSON.stringify(direct).includes('HISTORICO_PROIBIDO'), false);
  assert.equal(direct.messages[0].content, generationSystem('compare'));
});

test('histórico: ausência, permissão inválida e falha de leitura resultam em envio sem contexto', async t => {
  const h = await setup(t); h.seed();
  for (const data of [preference('true'), { ...preference(true), version: 2 }]) {
    h.DB.sqlite.prepare('INSERT OR REPLACE INTO preferences VALUES (?, ?, ?)').run(h.visitor.visitorId, JSON.stringify(data), new Date().toISOString());
    assert.equal((await h.prefs()).status, 503);
    assert.equal((await h.generate()).status, 200); assert.equal(h.state.sent.at(-1).messages.length, 2);
  }
  h.DB.before = sql => { if (sql.includes('FROM preferences')) throw Error('SQL_PRIVADO'); };
  assert.equal((await h.generate()).status, 200); assert.equal(h.state.sent.at(-1).messages.length, 2);
});

test('histórico: flag desligada, diário vazio e falha no diário não enviam contexto', async t => {
  const h = await setup(t); await writePreferences(h.env, h.visitor, preference(true));
  assert.equal((await h.generate()).status, 200); assert.equal(h.state.sent.at(-1).messages.length, 2);
  h.seed(); h.env.PERSONALIZATION_ENABLED = 'false';
  assert.equal((await h.generate()).status, 200); assert.equal(h.state.sent.at(-1).messages.length, 2);
  h.env.PERSONALIZATION_ENABLED = 'true';
  h.DB.before = sql => { if (sql.includes('FROM meal_logs')) throw Error('SQL_PRIVADO'); };
  assert.equal((await h.generate()).status, 200); assert.equal(h.state.sent.at(-1).messages.length, 2);
});

test('histórico: só projeção estruturada própria, sem passos/fotos, sem vínculo de plano alheio', async t => {
  const h = await setup(t), b = await h.session();
  await writePreferences(h.env, h.visitor, preference(true));
  const ownPlan = await savePlan(h.env, h.visitor, 'a'.repeat(64), cook, fakeResult());
  const foreignPlan = await savePlan(h.env, b.visitor, 'b'.repeat(64), cook, fakeResult());
  h.seed(h.visitor, 'Minha refeição', { plan_id: ownPlan, data: { steps: ['SEGREDO_PASSOS'], photo: 'SEGREDO_FOTO' } });
  h.seed(b.visitor, 'REFEICAO_ALHEIA');
  h.seed(h.visitor, 'Vínculo inválido', { plan_id: foreignPlan });
  h.seed(h.visitor, 'IGNORAR_SEM_VERSAO', { data: { version: 2 } });
  const context = await selectHistoryContext(h.env, h.visitor, 'cook');
  for (const forbidden of ['REFEICAO_ALHEIA', 'SEGREDO_', 'PASSO_NAO_', foreignPlan, 'IGNORAR_SEM_VERSAO']) assert.equal(context.includes(forbidden), false);
  const meals = JSON.parse(context).meals;
  assert.equal(meals.length, 2);
  assert.equal(meals.find(meal => meal.description === 'Minha refeição').plan_id, ownPlan);
  assert.equal(Object.hasOwn(meals.find(meal => meal.description === 'Vínculo inválido'), 'plan_id'), false);
  const sql = h.DB.trace.find(query => query.includes('FROM meal_logs'));
  assert.equal(sql.includes('m.visitor_id = ?1'), true); assert.equal(sql.includes('p.visitor_id = ?1'), true);
  assert.equal(sql.includes('steps'), false); assert.equal(sql.includes('SELECT *'), false);
});

test('histórico: exclusão/correção refletidas na próxima geração sem cache do diário', async t => {
  const h = await setup(t); const id = h.seed(); await writePreferences(h.env, h.visitor, preference(true));
  await h.generate(); assert.equal(h.state.sent[0].messages.length, 3);
  // Mutação só do banco de teste: endpoints do diário/exclusão continuam no Item 3/6.
  h.DB.sqlite.prepare("UPDATE meal_logs SET data_json=json_set(data_json, '$.description', ?) WHERE visitor_id=? AND id=?")
    .run('Refeição corrigida', h.visitor.visitorId, id);
  await h.generate(); assert.equal(JSON.parse(h.state.sent[1].messages[2].content).meals[0].description, 'Refeição corrigida');
  h.DB.sqlite.prepare('DELETE FROM meal_logs WHERE visitor_id=? AND id=?').run(h.visitor.visitorId, id);
  await h.generate(); assert.equal(h.state.sent[2].messages.length, 2);
});

test('histórico: replay não consulta consentimento/diário nem reenvia conteúdo antigo à IA', async t => {
  const h = await setup(t), key = crypto.randomUUID(); h.seed(); await writePreferences(h.env, h.visitor, preference(true));
  await h.generate({ key }); await writePreferences(h.env, h.visitor, preference(false));
  h.DB.before = sql => { if (/FROM preferences|FROM meal_logs/u.test(sql)) throw Error('Não reler no replay'); };
  assert.equal((await h.generate({ key })).status, 409); assert.equal(h.state.sent.length, 1);
  const saved = h.DB.sqlite.prepare('SELECT data_json FROM plans').get().data_json;
  assert.equal(saved.includes('meal_history'), false); assert.equal(saved.includes('Arroz com feijão'), false);
});

test('recorte: sete dias corridos em UTC, inclui borda, ignora futuro/data inválida e ordena empates por ID', () => {
  const now = Date.parse('2026-09-12T12:00:00.000Z');
  const row = (id, eaten_at, description = id) => ({ id, eaten_at, description });
  const rows = [row('old', '2026-09-05T11:59:59.999Z'), row('edge', '2026-09-05T12:00:00Z'),
    row('b', '2026-09-12T09:00:00-03:00'), row('a', '2026-09-12T12:00:00Z'),
    row('future', '2026-09-12T12:00:00.001Z'), row('invalid', 'inválida')];
  const before = structuredClone(rows);
  assert.deepEqual(JSON.parse(buildHistoryContext(rows, { now })).meals.map(meal => meal.description), ['a', 'b', 'edge']);
  assert.deepEqual(rows, before);
});

test('recorte SQL: janela, empate e campos inválidos concordam com seleção pura', async t => {
  const h = await setup(t), now = Date.parse('2026-09-12T12:00:00Z');
  await writePreferences(h.env, h.visitor, preference(true));
  h.seed(h.visitor, 'Antiga', { eaten_at: '2026-09-05T11:59:59.999Z' });
  h.seed(h.visitor, 'Borda', { eaten_at: '2026-09-05T12:00:00Z' });
  h.seed(h.visitor, 'Futura', { eaten_at: '2026-09-12T12:00:00.001Z' });
  h.seed(h.visitor, 'Inválida', { eaten_at: 'não é data' });
  h.seed(h.visitor, ['Não é descrição'], { eaten_at: '2026-09-12T12:00:00Z' });
  const value = await selectHistoryContext(h.env, h.visitor, 'ready', { now });
  assert.deepEqual(JSON.parse(value).meals.map(meal => meal.description), ['Borda']);
});

test('recorte: tetos reais de registros/caracteres, inclusive Unicode, aspas e escapes; não conta tokens', () => {
  const now = Date.parse('2026-09-12T12:00:00Z');
  for (const description of ['Arroz com feijão', '😀'.repeat(200), '"\\\n'.repeat(200), '\u0001'.repeat(200), '']) {
    const rows = Array.from({ length: 50 }, (_, i) => ({ id: String(i).padStart(2, '0'), description,
      eaten_at: new Date(now - i * 1000).toISOString(), plan_id: '00000000-0000-4000-8000-000000000001' }));
    const content = buildHistoryContext(rows, { now });
    if (!content) continue;
    assert.ok(characterCount(content) <= 1200);
    const parsed = JSON.parse(content); assert.ok(parsed.meals.length <= 4);
    for (const meal of parsed.meals) {
      assert.ok(characterCount(meal.description) <= 120);
      assert.ok(characterCount(JSON.stringify(meal)) <= 300);
      assert.deepEqual(Object.keys(meal), ['description', 'eaten_at', 'plan_id']);
    }
    assert.equal(Object.hasOwn(parsed, 'tokens'), false);
  }
  assert.equal(HISTORY_LIMITS.totalCharacters, 1200);
  assert.equal(characterCount('😀'), 1);
});

test('personalização: SYSTEM legado medido e compare permanecem exatamente nas versões congeladas', () => {
  const hash = text => 'sha256:' + createHash('sha256').update(text).digest('hex');
  assert.equal(generationSystem('cook'), generationSystem('ready'));
  assert.equal(hash(generationSystem('cook')), 'sha256:7bdf39794469a46a044e75a0fbddf71a89a2df2f70a730a0938d3cbdb3315d3b');
  assert.equal(hash(generationSystem('compare')), 'sha256:63d74e6ac173d2c970e9c80cb332d56c22788e5084442046b9e3c9a823a560d4');
});
