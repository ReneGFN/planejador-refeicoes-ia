import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { historyDb } from './helpers/history-db.js';
import { createApiHandlers } from '../src/http/api.js';
import { resolveVisitorSession } from '../src/security/session.js';
import { deleteHistory, validateHistoryDeletion } from '../src/history/delete.js';
import { captureHistoryRevision } from '../src/history/revision.js';
import { savePlan } from '../src/history/plans.js';
import { readPreferences, writePreferences } from '../src/history/preferences.js';
import { mutateMeal } from '../src/history/meal-logs.js';
import { mutatePantry } from '../src/history/pantry.js';
import { applyPantryDeduction, previewPantryDeduction } from '../src/history/pantry-deduction.js';
import { selectGenerationContext } from '../src/history/generation-context.js';
import { onRequestDelete } from '../functions/api/history.js';

const confirmation = { version: 1, confirmed: true };
const cook = { mode: 'cook', meal: 'jantar', people: 1, time_minutes: 30, ingredient_policy: 'suggest', ingredients: [] };
const preferences = { version: 1, use_history: true, use_pantry: true, defaults: { people: 2 } };
const pantry = { version: 1, name: 'Arroz', quantity: 500, unit: 'g' };
const manual = () => ({ version: 1, source: 'manual', description: 'Arroz', eaten_at: new Date(Date.now() - 1000).toISOString(), confirmed_consumed: true });
const recipe = { title: 'Arroz', servings: 1, total_minutes: 30, ingredients: [{ name: 'Arroz', quantity: 100, unit: 'g' }], steps: ['Prepare o arroz.'] };
const result = { data: { version: 1, mode: 'cook', suggestions: [recipe] }, metadata: {
  model: 'openai/gpt-oss-20b', elapsed_ms: 1, usage: { prompt_tokens: 1000, completion_tokens: 100, total_tokens: 1100, reasoning_tokens: null } } };
const product = ['plans', 'preferences', 'meal_logs', 'pantry_items'];
const technical = ['usage_buckets', 'usage_reservations', 'meal_log_mutations', 'pantry_mutations'];
const latch = () => {
  let release, enter;
  return { gate: new Promise(resolve => { release = resolve; }), arrived: new Promise(resolve => { enter = resolve; }),
    release: () => release(), enter: () => enter() };
};

async function setup(t) {
  const DB = historyDb(); t.after(() => DB.sqlite.close());
  const base = { visitorDay: 1000, visitorMinute: 1000, networkDay: 1000, networkMinute: 1000,
    globalDay: 1000, globalMinute: 1000, reserveTokens: 0, dayTokens: 0, minuteTokens: 0 };
  const policy = { ingress: base, session: base,
    generation: { ...base, visitorDay: 3, reserveTokens: 4096, dayTokens: 1000000, minuteTokens: 1000000 } };
  const env = { DB, SESSIONS_ENABLED: 'true', AI_ENABLED: 'true', HISTORY_DELETION_ENABLED: 'true',
    PERSONALIZATION_ENABLED: 'true', PANTRY_ENABLED: 'true', DIARY_ENABLED: 'true',
    SESSION_SECRET: 'fake-deletion-session-secret-not-production',
    IP_HASH_SECRET: 'fake-deletion-network-secret-not-production', GROQ_API_KEY: 'fake-no-network-key',
    QUOTA_POLICY_JSON: JSON.stringify(policy) };
  const state = { sent: [], pause: null };
  const handlers = createApiHandlers({ fetchImpl: async (_, init) => {
    const body = JSON.parse(init.body); state.sent.push(body);
    if (state.pause) { state.pause.enter(); await state.pause.gate; }
    return Response.json({ model: body.model, usage: result.metadata.usage,
      choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(result.data) } }] });
  } });
  const request = ({ cookie = '', body = confirmation, method = 'DELETE', key = crypto.randomUUID(), headers = {}, query = '' } = {}) =>
    new Request('https://delete.test/api/history' + query, { method,
      headers: { Origin: 'https://delete.test', 'Content-Type': 'application/json', Cookie: cookie,
        'CF-Connecting-IP': '192.0.2.1', 'Idempotency-Key': key, ...headers },
      ...(method === 'GET' ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) });
  const session = async () => {
    const r = await handlers.session({ env, request: request({ method: 'POST', body: {} }) }); assert.equal(r.status, 201);
    const cookie = r.headers.get('Set-Cookie').split(';')[0];
    return { cookie, visitor: await resolveVisitorSession(request({ cookie }), env) };
  };
  const a = await session(), b = await session();
  const erase = (options = {}) => handlers.history({ env, request: request({ cookie: a.cookie, ...options }) });
  const generate = (key = crypto.randomUUID(), cookie = a.cookie) => handlers.generate({ env, request: request({ cookie, method: 'POST', body: cook, key }) });
  const count = (table, owner) => DB.sqlite.prepare('SELECT COUNT(*) AS n FROM ' + table + (owner ? ' WHERE visitor_id=?' : '')).get(...(owner ? [owner.visitorId] : [])).n;
  const rows = table => DB.sqlite.prepare('SELECT * FROM ' + table + ' ORDER BY rowid').all().map(x => ({ ...x }));
  const seed = async (owner = a.visitor) => {
    await writePreferences(env, owner, preferences);
    const plan = await savePlan(env, owner, 'a'.repeat(64), cook, result);
    const mealKey = crypto.randomUUID(), pantryKey = crypto.randomUUID();
    const item = await mutatePantry(env, owner, 'create', null, pantry, pantryKey);
    const mealBody = { ...manual(), source: 'plan_suggestion', plan_id: plan, side: 'cook', suggestion_index: 0, servings_consumed: 1 };
    delete mealBody.description;
    const meal = await mutateMeal(env, owner, 'create', null, mealBody, mealKey);
    return { plan, meal: meal.data.id, item: item.data.id, mealKey, pantryKey, mealBody };
  };
  return { DB, env, state, handlers, request, session, a, b, erase, generate, count, rows, seed, policy };
}

test('exclusão: confirmação explícita, corpo fechado e habilitação somente em preview', async () => {
  assert.deepEqual(validateHistoryDeletion(confirmation), confirmation);
  for (const body of [null, [], {}, { version: 2, confirmed: true }, { version: 1, confirmed: 'true' },
    { ...confirmation, visitor_id: 'outro' }, { ...confirmation, history_revision: 0 }]) assert.throws(() => validateHistoryDeletion(body));
  assert.equal((await onRequestDelete({ env: {} })).status, 503);
  const config = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.equal((config.match(/"HISTORY_DELETION_ENABLED": "false"/gu) ?? []).length, 2);
  assert.equal((config.match(/"HISTORY_DELETION_ENABLED": "true"/gu) ?? []).length, 1);
});

test('exclusão pura: remove quatro produtos, preserva todos os recibos/cotas e outro dono byte a byte', async t => {
  const h = await setup(t); await h.seed(); await h.seed(h.b.visitor);
  await h.generate();
  const before = Object.fromEntries(technical.map(table => [table, h.rows(table)]));
  const foreign = Object.fromEntries(product.map(table => [table, h.rows(table).filter(row => row.visitor_id === h.b.visitor.visitorId)]));
  const sessions = h.rows('visitors');
  assert.deepEqual(await deleteHistory(h.env, h.a.visitor, confirmation, crypto.randomUUID()), { version: 1, deleted: true });
  for (const table of product) {
    assert.equal(h.count(table, h.a.visitor), 0);
    assert.deepEqual(h.rows(table), foreign[table]);
  }
  for (const table of technical) assert.deepEqual(h.rows(table), before[table]);
  assert.equal(h.count('visitors'), 2);
  assert.equal(await captureHistoryRevision(h.env, h.a.visitor), 1);
  const expected = sessions.map(row => row.id === h.a.visitor.visitorId ? { ...row, history_revision: 1 } : row);
  assert.deepEqual(h.rows('visitors'), expected);
  assert.equal(h.state.sent.length, 1);
});

test('exclusão HTTP: sem chave/IA/config das fontes, mantém sessão e preferências voltam desligadas', async t => {
  const h = await setup(t); await h.seed();
  Object.assign(h.env, { AI_ENABLED: 'false', GROQ_API_KEY: '', DIARY_ENABLED: 'false', PANTRY_ENABLED: 'false', PERSONALIZATION_ENABLED: 'false' });
  const r = await h.erase(); assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { data: { version: 1, deleted: true } });
  assert.equal(r.headers.get('Cache-Control'), 'no-store'); assert.equal(r.headers.get('Set-Cookie'), null);
  assert.deepEqual(await resolveVisitorSession(h.request({ cookie: h.a.cookie }), h.env), h.a.visitor);
  assert.deepEqual(await readPreferences(h.env, h.a.visitor), { version: 1, use_history: false, defaults: {} });
  assert.equal(h.state.sent.length, 0);
  assert.equal(h.rows('usage_reservations').some(row => ['generation', 'vision'].includes(row.operation)), false);
});

test('exclusão: mesma chave não apaga novos dados; chave nova exclui novo conteúdo', async t => {
  const h = await setup(t), key = crypto.randomUUID(); await h.seed();
  assert.equal((await h.erase({ key })).status, 200);
  await writePreferences(h.env, h.a.visitor, preferences);
  assert.equal((await h.erase({ key })).status, 200);
  assert.equal(h.count('preferences', h.a.visitor), 1);
  assert.equal(await captureHistoryRevision(h.env, h.a.visitor), 1);
  assert.equal(h.count('history_deletions', h.a.visitor), 1);
  assert.equal((await h.erase()).status, 200);
  assert.equal(h.count('preferences', h.a.visitor), 0);
  assert.equal(await captureHistoryRevision(h.env, h.a.visitor), 2);
});

test('exclusão: vazio funciona, mesma chave é independente entre visitantes', async t => {
  const h = await setup(t), key = crypto.randomUUID(); await h.seed(h.b.visitor);
  assert.equal((await h.erase({ key })).status, 200);
  assert.equal(h.count('pantry_items', h.b.visitor), 1);
  assert.equal((await h.erase({ key, cookie: h.b.cookie })).status, 200);
  assert.equal(h.count('pantry_items'), 0); assert.equal(h.count('history_deletions'), 2);
});

test('exclusão HTTP: flags, sessão, origem, método, query e corpo não permitem apagar dados', async t => {
  const h = await setup(t); await h.seed();
  assert.equal((await h.erase({ cookie: '' })).status, 401);
  for (const options of [
    { body: { ...confirmation, visitor_id: h.b.visitor.visitorId } }, { body: {} }, { key: '' }, { query: '?visitor_id=outro' }, { method: 'POST' },
  ]) assert.equal((await h.erase(options)).status, 400);
  assert.equal((await h.erase({ headers: { Origin: 'https://outro.test' } })).status, 403);
  assert.equal((await h.erase({ headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  assert.equal((await h.erase({ body: 'x'.repeat(257) })).status, 413);
  assert.equal((await h.erase({ headers: { 'Content-Type': 'text/plain' } })).status, 415);
  h.env.HISTORY_DELETION_ENABLED = 'false'; assert.equal((await h.erase()).status, 503);
  h.env.HISTORY_DELETION_ENABLED = 'true'; h.env.SESSIONS_ENABLED = 'false'; assert.equal((await h.erase()).status, 503);
  assert.equal(h.count('pantry_items', h.a.visitor), 1); assert.equal(h.count('history_deletions'), 0);
});

test('exclusão: expiração absoluta não autoriza acesso e não renova sessão', async t => {
  const h = await setup(t); await h.seed();
  h.DB.sqlite.prepare("UPDATE visitors SET created_at='2000-01-01 00:00:00' WHERE id=?").run(h.a.visitor.visitorId);
  assert.equal((await h.erase()).status, 401);
  assert.equal(h.count('plans', h.a.visitor), 1);
  await assert.rejects(deleteHistory(h.env, { ...h.a.visitor, expiresAt: '2000-01-01T00:00:00Z' }, confirmation, crypto.randomUUID()));
});

test('exclusão: ingress limita, mas nenhuma cota de geração/visão é consumida ou restituída', async t => {
  const h = await setup(t); await h.seed();
  h.env.QUOTA_POLICY_JSON = JSON.stringify({ ...h.policy, ingress: { ...h.policy.ingress, globalMinute: 1 } });
  assert.equal((await h.erase()).status, 200);
  assert.equal((await h.erase()).status, 429);
  assert.equal(h.count('history_deletions'), 1); assert.equal(h.state.sent.length, 0);
});

for (const table of product) test('exclusão: falha em ' + table + ' desfaz versão, recibo e todas as remoções', async t => {
  const h = await setup(t); await h.seed();
  h.DB.sqlite.exec("CREATE TRIGGER abort_delete BEFORE DELETE ON " + table + " BEGIN SELECT RAISE(ABORT,'SQL_PRIVADO'); END;");
  const key = crypto.randomUUID(), r = await h.erase({ key });
  assert.equal(r.status, 503); assert.equal((await r.text()).includes('SQL_PRIVADO'), false);
  for (const name of product) assert.equal(h.count(name, h.a.visitor), 1);
  assert.equal(await captureHistoryRevision(h.env, h.a.visitor), 0); assert.equal(h.count('history_deletions'), 0);
  h.DB.sqlite.exec('DROP TRIGGER abort_delete');
  assert.equal((await h.erase({ key })).status, 200);
});

test('exclusão: recibos técnicos expirados também não são podados pela rota', async t => {
  const h = await setup(t); await h.seed(); await h.generate();
  h.DB.sqlite.exec("UPDATE usage_reservations SET expires_at='2000-01-01T00:00:00Z'");
  const ids = h.rows('usage_reservations').map(row => row.id);
  assert.equal((await h.erase()).status, 200);
  assert.ok(ids.every(id => h.rows('usage_reservations').some(row => row.id === id)));
});

test('exclusão: replay sem plano não chama IA; quarta geração segue bloqueada', async t => {
  const h = await setup(t), key = crypto.randomUUID();
  for (const current of [key, crypto.randomUUID(), crypto.randomUUID()]) assert.equal((await h.generate(current)).status, 200);
  const bucket = h.rows('usage_buckets').filter(row => row.bucket_key.startsWith('generation:'));
  assert.equal((await h.erase()).status, 200);
  const replay = await h.generate(key); assert.equal(replay.status, 409);
  assert.equal((await replay.json()).replay.available, false);
  assert.equal((await h.generate()).status, 429);
  assert.equal(h.state.sent.length, 3);
  assert.deepEqual(h.rows('usage_buckets').filter(row => row.bucket_key.startsWith('generation:')), bucket);
});

test('exclusão: reenvios de consumo e estoque não ressuscitam dados apagados', async t => {
  const h = await setup(t), seeded = await h.seed();
  assert.equal((await h.erase()).status, 200);
  assert.equal((await mutateMeal(h.env, h.a.visitor, 'create', null, seeded.mealBody, seeded.mealKey)).duplicate, true);
  assert.equal((await mutatePantry(h.env, h.a.visitor, 'create', null, pantry, seeded.pantryKey)).duplicate, true);
  assert.equal(h.count('meal_logs'), 0); assert.equal(h.count('pantry_items'), 0);
  assert.equal(await selectGenerationContext(h.env, h.a.visitor, cook), null);
});

test('exclusão concorrente: geração em andamento não repõe plano, sem retry/estorno', async t => {
  const h = await setup(t), pause = latch(), key = crypto.randomUUID();
  h.state.pause = pause;
  const pending = h.generate(key);
  await pause.arrived;
  assert.equal((await h.erase()).status, 200);
  pause.release();
  const r = await pending; assert.equal(r.status, 503);
  assert.equal((await r.json()).quotaReserved, true);
  assert.equal(h.count('plans'), 0); assert.equal(h.state.sent.length, 1);
  assert.equal((await h.generate(key)).status, 409);
  h.state.pause = null;
  assert.equal((await h.generate()).status, 200); // Ação nova é permitida na mesma sessão/cota.
  assert.equal(h.count('plans'), 1);
});

test('exclusão concorrente: preferência iniciada antes não reativa consentimento depois', async t => {
  const h = await setup(t), pause = latch();
  h.DB.before = async sql => { if (sql.includes('INSERT INTO preferences')) { h.DB.before = null; pause.enter(); await pause.gate; } };
  const pending = writePreferences(h.env, h.a.visitor, preferences);
  const rejected = assert.rejects(pending); await pause.arrived;
  assert.equal((await h.erase()).status, 200); pause.release(); await rejected;
  assert.equal(h.count('preferences'), 0);
});

for (const kind of ['diário', 'despensa', 'baixa']) test('exclusão concorrente: ' + kind + ' não grava depois da troca de versão', async t => {
  const h = await setup(t), seeded = await h.seed(), pause = latch();
  const preview = kind === 'baixa' ? await previewPantryDeduction(h.env, h.a.visitor, seeded.meal) : null;
  const batch = h.DB.batch.bind(h.DB);
  let first = true;
  h.DB.batch = async statements => { if (first) { first = false; pause.enter(); await pause.gate; } return batch(statements); };
  const pending = kind === 'diário' ? mutateMeal(h.env, h.a.visitor, 'create', null, manual(), crypto.randomUUID())
    : kind === 'despensa' ? mutatePantry(h.env, h.a.visitor, 'create', null, { ...pantry, name: 'Feijão' }, crypto.randomUUID())
      : applyPantryDeduction(h.env, h.a.visitor, seeded.meal, { version: 1, preview_id: preview.preview_id, confirmed_snapshot: true }, crypto.randomUUID());
  const rejected = assert.rejects(pending); await pause.arrived;
  assert.equal((await h.erase()).status, 200); pause.release(); await rejected;
  for (const table of product) assert.equal(h.count(table), 0);
  assert.equal(h.count('meal_log_mutations'), 1); assert.equal(h.count('pantry_mutations'), 1);
});

test('exclusão: vínculo inconsistente de outro dono aborta sem SET NULL em dados alheios', async t => {
  const h = await setup(t), a = await h.seed(), b = await h.seed(h.b.visitor);
  h.DB.sqlite.prepare('UPDATE meal_logs SET plan_id=? WHERE id=?').run(a.plan, b.meal);
  const foreign = h.rows('meal_logs').find(row => row.id === b.meal);
  assert.equal((await h.erase()).status, 503);
  assert.deepEqual(h.rows('meal_logs').find(row => row.id === b.meal), foreign);
  assert.equal(h.count('plans', h.a.visitor), 1); assert.equal(h.count('history_deletions'), 0);
});
