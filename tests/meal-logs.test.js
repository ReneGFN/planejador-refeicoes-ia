import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { historyDb } from './helpers/history-db.js';
import { createApiHandlers } from '../src/http/api.js';
import { resolveVisitorSession } from '../src/security/session.js';
import { savePlan } from '../src/history/plans.js';
import { getMeal, listMeals, mutateMeal } from '../src/history/meal-logs.js';
import { validateMealCreate, validateMealUpdate, validateMealRatingUpdate, validateMealQuery, mealDate } from '../src/contracts/meal-log.js';
import { readPreferences, writePreferences } from '../src/history/preferences.js';
import { selectHistoryContext } from '../src/history/context.js';
import * as collectionRoute from '../functions/api/meal-logs.js';
import * as recordRoute from '../functions/api/meal-logs/[id].js';

test('diário seleção: segunda opção de compare e terceira legada mantêm índice e título corretos', async t => {
  const h = await setup(t);
  const plan = await h.plan('compare', { cook: { status: 'suggested', suggestions: [recipe, { ...recipe, title: 'Segunda opção' }] } });
  const second = await h.create(h.selected(plan, 'cook', { suggestion_index: 1 }));
  assert.equal((await getMeal(h.env, h.visitor, second)).description, 'Segunda opção');
  assert.equal((await h.send({ body: h.selected(plan, 'cook', { suggestion_index: 2 }) })).status, 400);
  const legacy = await h.plan();
  h.DB.sqlite.prepare("UPDATE plans SET data_json=json_set(data_json, '$.output.suggestions', json(?)) WHERE id=?")
    .run(JSON.stringify([recipe, recipe, { ...recipe, title: 'Terceira opção' }]), legacy);
  const third = await h.create(h.selected(legacy, 'cook', { suggestion_index: 2 }));
  assert.equal((await getMeal(h.env, h.visitor, third)).description, 'Terceira opção');
});
test('diário corrida: plano ou registro apagado antes da transação não gera recibo falso nem recriação', async t => {
  const h = await setup(t), plan = await h.plan();
  h.DB.before = sql => {
    if (sql.includes('INSERT INTO meal_log_mutations')) {
      h.DB.before = null;
      h.DB.sqlite.prepare('DELETE FROM plans WHERE id=?').run(plan);
    }
  };
  assert.equal((await h.send({ body: h.selected(plan) })).status, 400);
  assert.equal(h.count('meal_log_mutations'), 0); assert.equal(h.count('meal_logs'), 0);
  const id = await h.create(), before = h.count('meal_log_mutations');
  h.DB.before = sql => {
    if (sql.includes('INSERT INTO meal_log_mutations')) {
      h.DB.before = null;
      h.DB.sqlite.prepare('DELETE FROM meal_logs WHERE id=?').run(id);
    }
  };
  assert.equal((await h.send({ method: 'PUT', id, body: edited() })).status, 400);
  assert.equal(h.count('meal_log_mutations'), before); assert.equal(h.count('meal_logs'), 0);
});
test('diário retenção técnica: reenvio após oito dias e exclusão ainda não repete a confirmação', async t => {
  const h = await setup(t), now = Date.now(), key = crypto.randomUUID();
  const created = await mutateMeal(h.env, h.visitor, 'create', null, manual(), key, { now: now - 8 * 86400000 });
  const id = created.data.id;
  await mutateMeal(h.env, h.visitor, 'delete', id, { version: 1 }, crypto.randomUUID(), { now });
  const replay = await mutateMeal(h.env, h.visitor, 'create', null, manual(), key, { now });
  assert.equal(replay.duplicate, true); assert.equal(h.count('meal_logs'), 0);
  assert.equal(h.count('meal_log_mutations'), 2);
});

const manual = (patch = {}) => ({ version: 1, source: 'manual', description: 'Delivery de arroz com feijão',
  eaten_at: '2026-01-10T19:00:00-03:00', confirmed_consumed: true, ...patch });
const edited = (patch = {}) => ({ version: 1, description: 'Arroz com legumes', eaten_at: '2026-01-11T12:00:00Z', ...patch });
const cook = { mode: 'cook', meal: 'jantar', people: 2, time_minutes: 30, ingredient_policy: 'suggest', ingredients: [] };
const recipe = { title: 'Arroz', servings: 2, total_minutes: 20, ingredients: [{ name: 'arroz', quantity: 200, unit: 'g' }], steps: ['PASSO_NAO_COPIAR'] };
const dish = { title: 'Arroz pronto', servings: 2, description: 'Opção para buscar', search_term: 'arroz pronto' };
const refusal = { status: 'not_suggested', reason: 'Não há opção compatível.' };
async function setup(t) {
  const DB = historyDb(); t.after(() => DB.sqlite.close());
  const common = { visitorDay: 1000, visitorMinute: 1000, networkDay: 1000, networkMinute: 1000,
    globalDay: 1000, globalMinute: 1000, reserveTokens: 0, dayTokens: 0, minuteTokens: 0 };
  const policy = { ingress: common, session: common };
  const env = { DB, DIARY_ENABLED: 'true', PERSONALIZATION_ENABLED: 'true', SESSIONS_ENABLED: 'true', AI_ENABLED: 'false',
    SESSION_SECRET: 'fake-diary-session-secret-not-production', IP_HASH_SECRET: 'fake-diary-network-secret-not-production',
    QUOTA_POLICY_JSON: JSON.stringify(policy) };
  let calls = 0;
  const handlers = createApiHandlers({ fetchImpl: async () => { calls++; throw Error('Diário não pode chamar IA.'); } });
  const request = ({ method = 'POST', cookie = '', body = {}, key = crypto.randomUUID(), headers = {}, query = '', id } = {}) => new Request(
    'https://diary.test/api/meal-logs' + (id ? '/' + id : '') + query,
    { method, headers: { Origin: 'https://diary.test', 'Content-Type': 'application/json', Cookie: cookie,
      'CF-Connecting-IP': '192.0.2.1', 'Idempotency-Key': key, ...headers },
    ...(method === 'GET' ? {} : { body: JSON.stringify(body) }) });
  const session = async () => {
    const response = await handlers.session({ env, request: request() }); assert.equal(response.status, 201);
    const cookie = response.headers.get('Set-Cookie').split(';')[0];
    return { cookie, visitor: await resolveVisitorSession(request({ cookie }), env) };
  };
  const a = await session();
  const send = (options = {}) => handlers.mealLogs({ env, request: request({ cookie: a.cookie, ...options }), params: options.id ? { id: options.id } : {} });
  const create = async (body = manual(), options = {}) => {
    const response = await send({ body, ...options }); assert.equal(response.status, 201, JSON.stringify(await response.clone().json()));
    return (await response.json()).data.id;
  };
  const plan = async (mode = 'cook', sides = {}, visitor = a.visitor) => {
    const input = mode === 'ready' ? { mode, meal: 'jantar', people: 2 } : { ...cook, mode };
    const data = mode === 'compare' ? { version: 1, mode, cook: { status: 'suggested', suggestions: [recipe] },
      ready: { status: 'suggested', suggestions: [dish] }, ...sides } : { version: 1, mode, suggestions: [mode === 'cook' ? recipe : dish] };
    return savePlan(env, visitor, crypto.randomUUID().replaceAll('-', '').repeat(2), input, { data, metadata: {
      model: 'openai/gpt-oss-20b', elapsed_ms: 1, usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2, reasoning_tokens: null } } });
  };
  const selected = (plan_id, side = 'cook', patch = {}) => ({ version: 1, source: 'plan_suggestion', plan_id,
    side, suggestion_index: 0, confirmed_consumed: true, ...patch });
  return { ...a, DB, env, policy, handlers, request, session, send, create, plan, selected, calls: () => calls,
    count: table => DB.sqlite.prepare('SELECT COUNT(*) AS n FROM ' + table).get().n };
}

test('diário contrato: confirmação explícita, campos fechados e limites sem dados inventados', () => {
  assert.equal(validateMealCreate(manual()).description, manual().description);
  assert.equal(validateMealCreate(manual({ description: '😀'.repeat(400), servings_consumed: 0.5 })).servings_consumed, 0.5);
  assert.equal(Object.hasOwn(validateMealCreate(manual()), 'servings_consumed'), false);
  const serverNow = Date.parse('2026-09-12T12:00:00Z');
  const selected = { version: 1, source: 'plan_suggestion', plan_id: crypto.randomUUID(), side: 'cook', suggestion_index: 0, confirmed_consumed: true };
  assert.equal(validateMealCreate(selected, { now: serverNow }).eaten_at, '2026-09-12T12:00:00.000Z');
  assert.throws(() => validateMealCreate({ ...selected, eaten_at: '2099-01-01T00:00:00Z' }, { now: serverNow }));
  const manualNow = { version: 1, source: 'manual', description: 'Almoço', confirmed_consumed: true };
  assert.equal(validateMealCreate(manualNow, { now: serverNow }).eaten_at, '2026-09-12T12:00:00.000Z');
  assert.throws(() => validateMealCreate({ ...manualNow, eaten_at: '2099-01-01T00:00:00Z' }, { now: serverNow }));
  for (const value of [null, {}, manual({ confirmed_consumed: false }), manual({ confirmed_consumed: 'true' }),
    manual({ description: '' }), manual({ description: 'a'.repeat(401) }), manual({ visitor_id: crypto.randomUUID() }),
    manual({ photo: 'foto' }), manual({ steps: [] }), manual({ use_history: true }), manual({ version: 2 }),
    manual({ servings_consumed: 0 }), manual({ servings_consumed: 21 }), manual({ servings_consumed: null }),
    manual({ source: 'delivery' }), manual({ plan_id: crypto.randomUUID() })]) assert.throws(() => validateMealCreate(value));
  assert.throws(() => validateMealUpdate({ ...edited(), source: 'manual' }));
  assert.throws(() => validateMealUpdate({ ...edited(), snapshot: recipe }));
});
test('diário datas: passado permitido, UTC, bissexto, calendário e fuso obrigatórios', () => {
  const options = { now: Date.parse('2026-09-12T12:00:00Z') };
  assert.equal(mealDate('2026-09-12T09:00:00-03:00', options), '2026-09-12T12:00:00.000Z');
  assert.equal(mealDate('2024-02-29T00:00:00Z', options), '2024-02-29T00:00:00.000Z');
  for (const value of ['2026-09-12T12:00:00.001Z', '2026-02-30T00:00:00Z', '2025-02-29T00:00:00Z',
    '2026-01-01', '2026-01-01T00:00:00', '2026-01-01T24:00:00Z', '2026-13-01T00:00:00Z',
    '2026-00-01T00:00:00Z', '2026-01-00T00:00:00Z', '2026-01-01T00:60:00Z',
    '2026-01-01T00:00:60Z', '2026-01-01T00:00:00+24:00', '2026-01-01T00:00:00+00:60']) {
    assert.throws(() => mealDate(value, options), undefined, value);
  }
});
test('diário HTTP: consumo manual/delivery retroativo, leitura/reabertura e nenhum consentimento automático', async t => {
  const h = await setup(t), id = await h.create();
  const response = await h.send({ method: 'GET', id }); assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const { data } = await response.json();
  assert.equal(data.eaten_at, '2026-01-10T22:00:00.000Z'); assert.equal(data.source, 'manual');
  assert.equal(data.plan_id, null); assert.equal(Object.hasOwn(data, 'servings_consumed'), false);
  assert.equal(data.expires_at, h.visitor.expiresAt);
  const reopened = await createApiHandlers().mealLogs({ env: h.env, request: h.request({ method: 'GET', cookie: h.cookie }) });
  assert.equal((await reopened.json()).data[0].id, id);
  assert.deepEqual(await readPreferences(h.env, h.visitor), { version: 1, use_history: false, defaults: {} });
  assert.equal(h.count('preferences'), 0); assert.equal(h.calls(), 0);
  assert.equal(h.DB.sqlite.prepare("SELECT COUNT(*) AS n FROM usage_reservations WHERE operation IN ('generation','vision')").get().n, 0);
  assert.ok(h.DB.sqlite.prepare("SELECT COUNT(*) AS n FROM usage_reservations WHERE operation='ingress'").get().n > 0);
});
for (const mode of ['cook', 'ready', 'compare']) {
  test('diário: confirmar sugestão de ' + mode + ' grava só a escolha e não todas as porções', async t => {
    const h = await setup(t), planId = await h.plan(mode);
    assert.equal(h.count('meal_logs'), 0);
    const side = mode === 'ready' ? 'ready' : 'cook';
    const id = await h.create(h.selected(planId, side));
    const value = await getMeal(h.env, h.visitor, id);
    assert.equal(h.count('meal_logs'), 1); assert.equal(value.plan_id, planId);
    assert.equal(value.side, side); assert.equal(value.suggestion_index, 0);
    assert.equal(value.snapshot.servings, 2); assert.equal(Object.hasOwn(value, 'servings_consumed'), false);
    assert.equal(JSON.stringify(value).includes('PASSO_NAO_COPIAR'), false);
    assert.equal(Object.hasOwn(value.snapshot, 'steps'), false);
    if (mode === 'compare') assert.equal(JSON.stringify(value).includes('Arroz pronto'), false);
    assert.equal(h.calls(), 0);
  });
}
test('diário compare: recusa de um lado não impede consumir o outro; recusa nunca vira consumo', async t => {
  const h = await setup(t);
  for (const sides of [{ cook: refusal }, { cook: refusal, ready: refusal }]) {
    const plan = await h.plan('compare', sides);
    assert.equal((await h.send({ body: h.selected(plan) })).status, 400);
    if (!sides.ready) assert.equal((await h.send({ body: h.selected(plan, 'ready') })).status, 201);
    else assert.equal((await h.send({ body: h.selected(plan, 'ready') })).status, 400);
  }
  assert.equal(h.count('meal_logs'), 1); assert.equal(h.count('meal_log_mutations'), 1);
});
test('diário seleção: índice, lado, plano ausente/expirado e versão inválida', async t => {
  const h = await setup(t), plan = await h.plan();
  for (const body of [h.selected(plan, 'ready'), h.selected(plan, 'cook', { suggestion_index: 1 }),
    h.selected(plan, 'cook', { suggestion_index: -1 }), h.selected(plan, 'cook', { suggestion_index: 0.5 }),
    h.selected(plan, 'cook', { suggestion_index: 3 }), h.selected(plan, 'compare'),
    h.selected(crypto.randomUUID()), h.selected(plan, 'cook', { description: 'Não impor receita' })]) {
    assert.equal((await h.send({ body })).status, 400);
  }
  h.DB.sqlite.prepare("UPDATE plans SET data_json=json_set(data_json, '$.version', 2) WHERE id=?").run(plan);
  assert.equal((await h.send({ body: h.selected(plan) })).status, 503);
  h.DB.sqlite.prepare("UPDATE plans SET expires_at='2000-01-01T00:00:00Z' WHERE id=?").run(plan);
  assert.equal((await h.send({ body: h.selected(plan) })).status, 400);
  assert.equal(h.count('meal_logs'), 0); assert.equal(h.count('meal_log_mutations'), 0);
});
test('diário HTTP: entrada inválida usa mensagem honesta sem revelar o campo interno', async t => {
  const h = await setup(t), response = await h.send({ body: { version: 1 } });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { code: 'INVALID_INPUT',
    message: 'Não foi possível processar este pedido agora. Tente novamente.', quotaReserved: false });
});
test('diário idempotência: reenvio 409, conteúdo diferente não altera ação anterior, duas ações iguais são permitidas', async t => {
  const h = await setup(t), key = crypto.randomUUID(), id = await h.create(manual(), { key });
  const response = await h.send({ body: manual({ description: 'Outro texto' }), key });
  assert.equal(response.status, 409);
  const result = await response.json(); assert.equal(result.quotaReserved, false);
  assert.deepEqual(result.receipt, { operation: 'create', meal_log_id: id });
  assert.equal((await getMeal(h.env, h.visitor, id)).description, manual().description);
  await h.create(manual({ eaten_at: '2026-01-11T19:00:00-03:00' }));
  await h.create(manual());
  assert.equal(h.count('meal_logs'), 3); // Conteúdo igual não é chave de idempotência.
  const stored = h.DB.sqlite.prepare('SELECT action_key FROM meal_log_mutations LIMIT 1').get().action_key;
  assert.match(stored, /^[0-9a-f]{64}$/u); assert.equal(stored.includes(key), false);
});
test('diário seleção: servidor fixa data e chave; relógio do cliente não muda a virada UTC', async t => {
  const h = await setup(t), plan = await h.plan();
  const midnight = (Math.floor(Date.now() / 86400000) + 1) * 86400000;
  const beforeMidnight = midnight - 1000, afterMidnight = midnight + 1;
  const selected = h.selected(plan);
  assert.equal(Object.hasOwn(selected, 'eaten_at'), false);
  // Mesmo que o relógio do cliente esteja horas ou dias errado, ele não viaja no corpo.
  const first = await mutateMeal(h.env, h.visitor, 'create', null, selected, crypto.randomUUID(), { now: beforeMidnight });
  const firstValue = await getMeal(h.env, h.visitor, first.data.id, { now: afterMidnight });
  assert.equal(firstValue.eaten_at, new Date(beforeMidnight).toISOString());
  const repeated = await mutateMeal(h.env, h.visitor, 'create', null, selected, crypto.randomUUID(), { now: beforeMidnight + 500 });
  assert.equal(repeated.duplicate, true); assert.equal(repeated.alreadyRegistered, true);
  assert.equal(h.count('meal_logs'), 1);
  const anotherDay = await mutateMeal(h.env, h.visitor, 'create', null, selected, crypto.randomUUID(), { now: afterMidnight });
  assert.equal(anotherDay.duplicate, false); assert.equal(h.count('meal_logs'), 2);
});
test('diário edição: substitui campos editáveis, preserva origem/instantâneo e reenvio não desfaz edição posterior', async t => {
  const h = await setup(t), plan = await h.plan(), id = await h.create(h.selected(plan, 'cook', { servings_consumed: 0.5 }));
  const before = await getMeal(h.env, h.visitor, id), key = crypto.randomUUID();
  assert.equal((await h.send({ method: 'PUT', id, key, body: edited({ servings_consumed: 1 }) })).status, 200);
  let value = await getMeal(h.env, h.visitor, id);
  assert.equal(value.description, edited().description); assert.equal(value.servings_consumed, 1);
  assert.deepEqual(value.snapshot, before.snapshot); assert.equal(value.plan_id, plan); assert.equal(value.source, 'plan_suggestion');
  assert.equal((await h.send({ method: 'PUT', id, body: edited({ description: 'Correção mais recente' }) })).status, 200);
  assert.equal((await h.send({ method: 'PUT', id, key, body: edited({ servings_consumed: 1 }) })).status, 409);
  value = await getMeal(h.env, h.visitor, id);
  assert.equal(value.description, 'Correção mais recente'); assert.equal(Object.hasOwn(value, 'servings_consumed'), false);
});
test('diário nota: inteiro de 1 a 5, remoção, idempotência e recibo sem conteúdo alimentar', async t => {
  const h = await setup(t), id = await h.create(), key = crypto.randomUUID();
  for (const value of [0, 6, 2.5]) {
    assert.throws(() => h.DB.sqlite.prepare('UPDATE meal_logs SET rating=? WHERE id=?').run(value, id));
  }
  h.DB.sqlite.prepare('UPDATE meal_logs SET rating=NULL WHERE id=?').run(id);
  assert.deepEqual(validateMealRatingUpdate({ version: 1, rating: 5 }), { version: 1, rating: 5 });
  assert.deepEqual(validateMealRatingUpdate({ version: 1, rating: null }), { version: 1, rating: null });
  for (const value of [undefined, 0, 6, -1, 2.5, '5', false]) {
    const body = value === undefined ? { version: 1 } : { version: 1, rating: value };
    assert.throws(() => validateMealRatingUpdate(body));
    assert.equal((await h.send({ method: 'PUT', id, body })).status, 400);
  }
  assert.equal((await h.send({ method: 'PUT', id, key, body: { version: 1, rating: 5 } })).status, 200);
  assert.equal((await getMeal(h.env, h.visitor, id)).rating, 5);
  assert.equal((await h.send({ method: 'PUT', id, key, body: { version: 1, rating: 1 } })).status, 409);
  assert.equal((await getMeal(h.env, h.visitor, id)).rating, 5);
  assert.equal((await h.send({ method: 'PUT', id, body: { version: 1, rating: null } })).status, 200);
  assert.equal((await getMeal(h.env, h.visitor, id)).rating, null);
  const receipt = h.DB.sqlite.prepare("SELECT * FROM meal_log_mutations WHERE operation='update' ORDER BY rowid LIMIT 1").get();
  assert.equal(JSON.stringify(receipt).includes('rating'), false);
});
test('diário nota: dono isolado e projeção de planos não correlaciona listas no cliente', async t => {
  const h = await setup(t), b = await h.session(), plan = await h.plan(), id = await h.create(h.selected(plan));
  assert.equal((await h.send({ method: 'PUT', id, body: { version: 1, rating: 4 } })).status, 200);
  const foreign = await h.send({ method: 'PUT', id, cookie: b.cookie, body: { version: 1, rating: 1 } });
  assert.equal(foreign.status, 400); assert.equal((await getMeal(h.env, h.visitor, id)).rating, 4);
  const headers = { Origin: 'https://diary.test', Cookie: h.cookie, 'CF-Connecting-IP': '192.0.2.1' };
  const listed = await h.handlers.plans({ env: h.env, request: new Request('https://diary.test/api/plans', { headers }) });
  const data = (await listed.json()).data;
  assert.deepEqual(data.find(item => item.id === plan).meal_logs, [{ id, side: 'cook', suggestion_index: 0, rating: 4 }]);
  const other = await h.handlers.plans({ env: h.env, request: new Request('https://diary.test/api/plans', { headers: { ...headers, Cookie: b.cookie } }) });
  assert.deepEqual((await other.json()).data, []);
  h.env.DIARY_ENABLED = 'false';
  const disabled = await h.handlers.plans({ env: h.env, request: new Request('https://diary.test/api/plans', { headers }) });
  assert.equal(Object.hasOwn((await disabled.json()).data[0], 'meal_logs'), false);
});
test('diário exclusão: preserva recibos, não ressuscita registro por POST ou PUT repetido e não zera cotas', async t => {
  const h = await setup(t), createKey = crypto.randomUUID(), id = await h.create(manual(), { key: createKey });
  const editKey = crypto.randomUUID(), deleteKey = crypto.randomUUID();
  await h.send({ method: 'PUT', id, key: editKey, body: edited() });
  const before = h.count('usage_reservations');
  assert.equal((await h.send({ method: 'DELETE', id, key: deleteKey, body: { version: 1 } })).status, 200);
  assert.equal(h.count('meal_logs'), 0); assert.equal(h.count('meal_log_mutations'), 3);
  assert.equal((await h.send({ method: 'POST', key: createKey, body: manual() })).status, 409);
  assert.equal((await h.send({ method: 'PUT', id, key: editKey, body: edited() })).status, 409);
  assert.equal((await h.send({ method: 'DELETE', id, key: deleteKey, body: { version: 1 } })).status, 409);
  assert.equal((await h.send({ method: 'DELETE', id, body: { version: 1 } })).status, 400);
  assert.equal((await h.send({ method: 'GET', id })).status, 400);
  assert.equal(h.count('meal_logs'), 0); assert.ok(h.count('usage_reservations') > before);
});
test('diário: chave é única entre create/update/delete, mas isolada por visitante', async t => {
  const h = await setup(t), b = await h.session(), key = crypto.randomUUID(), id = await h.create(manual(), { key });
  assert.equal((await h.send({ method: 'DELETE', id, key, body: { version: 1 } })).status, 409);
  assert.equal((await h.send({ cookie: b.cookie, body: manual(), key })).status, 201);
  assert.equal(h.count('meal_logs'), 2);
});
test('diário isolamento: listar, ler, editar, excluir e consumir plano alheio sem expor existência', async t => {
  const h = await setup(t), b = await h.session(), id = await h.create(), plan = await h.plan();
  assert.deepEqual((await (await h.send({ cookie: b.cookie, method: 'GET' })).json()).data, []);
  for (const method of ['GET', 'PUT', 'DELETE']) {
    const body = method === 'PUT' ? edited() : { version: 1 };
    const foreign = await h.send({ method, id, cookie: b.cookie, body });
    const absent = await h.send({ method, id: crypto.randomUUID(), cookie: b.cookie, body });
    assert.equal(foreign.status, 400); assert.deepEqual(await foreign.json(), await absent.json());
  }
  assert.equal((await h.send({ cookie: b.cookie, body: h.selected(plan) })).status, 400);
  assert.equal((await h.send({ cookie: b.cookie, body: manual({ visitor_id: h.visitor.visitorId }) })).status, 400);
  assert.equal((await h.send({ id, method: 'DELETE', body: { version: 1, visitor_id: h.visitor.visitorId } })).status, 400);
  assert.equal(h.count('meal_logs'), 1); assert.equal(h.count('meal_log_mutations'), 1);
});
test('diário isolamento defensivo: vínculo inconsistente de plano alheio não vaza', async t => {
  const h = await setup(t), b = await h.session(), id = await h.create(), plan = await h.plan('cook', {}, b.visitor);
  h.DB.sqlite.prepare('UPDATE meal_logs SET plan_id=? WHERE id=?').run(plan, id);
  assert.equal((await getMeal(h.env, h.visitor, id)).plan_id, null);
  assert.equal((await listMeals(h.env, h.visitor, { limit: 20 })).data[0].plan_id, null);
});
test('diário HTTP: sem sessão, origem, métodos, corpo, chave e flags; não requer chave de IA', async t => {
  const h = await setup(t);
  assert.equal((await h.send({ body: manual(), cookie: '' })).status, 401);
  for (const method of ['GET', 'POST']) {
    assert.equal((await h.send({ method, body: manual(), headers: { Origin: 'https://outro.test' } })).status, 403);
    assert.equal((await h.send({ method, body: manual(), headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  }
  assert.equal((await h.send({ method: 'PATCH', body: manual() })).status, 400);
  assert.equal((await h.send({ body: manual(), key: '' })).status, 400);
  assert.equal((await h.send({ body: manual(), headers: { 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await h.send({ body: manual({ description: 'a'.repeat(20000) }) })).status, 413);
  assert.equal((await h.send({ body: manual(), query: '?visitor_id=outro' })).status, 400);
  await h.create();
  h.env.DIARY_ENABLED = 'false'; assert.equal((await h.send({ method: 'GET' })).status, 503);
  h.env.DIARY_ENABLED = 'true'; h.env.SESSIONS_ENABLED = 'false';
  assert.equal((await h.send({ method: 'GET' })).status, 503);
  for (const fn of [...Object.values(collectionRoute), ...Object.values(recordRoute)]) assert.equal((await fn({ env: {} })).status, 503);
  const config = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.equal((config.match(/"DIARY_ENABLED": "false"/gu) ?? []).length, 1);
  assert.equal((config.match(/"DIARY_ENABLED": "true"/gu) ?? []).length, 2);
  assert.equal(h.calls(), 0);
});
test('diário paginação: limite 20/50, cursor fechado, empates estáveis, isolamento e sem lista ilimitada', async t => {
  const h = await setup(t);
  const ids = [await h.create(), await h.create(), await h.create()]; ids.sort();
  const first = await (await h.send({ method: 'GET', query: '?limit=2' })).json();
  assert.deepEqual(first.data.map(value => value.id), ids.slice(0, 2));
  const query = '?' + new URLSearchParams({ limit: '2', ...first.next_cursor });
  const second = await (await h.send({ method: 'GET', query })).json();
  assert.deepEqual(second.data.map(value => value.id), ids.slice(2)); assert.equal(second.next_cursor, null);
  for (const query of ['?limit=0', '?limit=51', '?limit=1.5', '?limit=2&limit=3', '?visitor_id=x', '?before_id=' + ids[0],
    '?before=2026-01-01', '?before=2026-01-01T00:00:00Z&before_id=errado']) {
    assert.equal((await h.send({ method: 'GET', query })).status, 400);
  }
  assert.deepEqual(validateMealQuery(new URLSearchParams()), { limit: 20 });
});
test('diário ingress: limite também bloqueia leitura e reenvio sem consumir geração/visão', async t => {
  const h = await setup(t), key = crypto.randomUUID(); await h.create(manual(), { key });
  h.env.QUOTA_POLICY_JSON = JSON.stringify({ ...h.policy, ingress: { ...h.policy.ingress, globalMinute: 1 } });
  assert.equal((await h.send({ method: 'GET' })).status, 429);
  assert.equal((await h.send({ body: manual(), key })).status, 429); assert.equal(h.count('meal_logs'), 1);
});
test('diário atomicidade: falha no INSERT, UPDATE ou DELETE desfaz também recibo, sem detalhe privado', async t => {
  const h = await setup(t);
  for (const [operation, method] of [['INSERT', 'POST'], ['UPDATE', 'PUT'], ['DELETE', 'DELETE']]) {
    const id = operation === 'INSERT' ? null : await h.create(), before = h.count('meal_log_mutations');
    h.DB.sqlite.exec('CREATE TRIGGER diary_abort BEFORE ' + operation + " ON meal_logs BEGIN SELECT RAISE(ABORT, 'SQL_PRIVADO'); END;");
    const key = crypto.randomUUID(), body = method === 'POST' ? manual() : method === 'PUT' ? edited() : { version: 1 };
    const response = await h.send({ method, id, body, key });
    assert.equal(response.status, 503); assert.equal((await response.text()).includes('SQL_PRIVADO'), false);
    assert.equal(h.count('meal_log_mutations'), before);
    h.DB.sqlite.exec('DROP TRIGGER diary_abort');
    assert.equal((await h.send({ method, id, body, key })).status, method === 'POST' ? 201 : 200);
  }
});
test('diário: falha de leitura ou recibo não confirma escrita', async t => {
  const h = await setup(t);
  h.DB.before = sql => { if (sql.includes('meal_log_mutations')) throw Error('PRIVADO'); };
  assert.equal((await h.send({ body: manual() })).status, 503); assert.equal(h.count('meal_logs'), 0);
  h.DB.before = sql => { if (sql.includes('FROM meal_logs')) throw Error('PRIVADO'); };
  assert.equal((await h.send({ method: 'GET' })).status, 503);
});
test('diário função: escrita aguardada, recibo técnico sem conteúdo, registro desconhecido não confirmado', async t => {
  const h = await setup(t);
  let saved = false;
  h.DB.before = async sql => { if (sql.includes('INSERT INTO meal_logs')) { await Promise.resolve(); saved = true; } };
  const result = await mutateMeal(h.env, h.visitor, 'create', null, manual(), crypto.randomUUID());
  assert.equal(saved, true); assert.equal(result.data.applied, true);
  const row = h.DB.sqlite.prepare('SELECT * FROM meal_log_mutations').get();
  assert.equal(JSON.stringify(row).includes(manual().description), false);
  assert.equal(JSON.stringify(row).includes('rating'), false);
  assert.equal(row.expires_at, h.visitor.expiresAt);
  await assert.rejects(mutateMeal(h.env, h.visitor, 'update', crypto.randomUUID(), edited(), crypto.randomUUID()));
});
test('diário retenção: registro expirado inacessível, sessão não renova e data retroativa não encurta prazo', async t => {
  const h = await setup(t), id = await h.create();
  const visitorBefore = h.DB.sqlite.prepare('SELECT created_at, last_seen_at FROM visitors').get();
  await h.send({ method: 'GET' }); await h.send({ method: 'PUT', id, body: edited() });
  assert.deepEqual(h.DB.sqlite.prepare('SELECT created_at, last_seen_at FROM visitors').get(), visitorBefore);
  h.DB.sqlite.prepare("UPDATE meal_logs SET expires_at='2000-01-01T00:00:00Z' WHERE id=?").run(id);
  assert.equal((await h.send({ method: 'GET', id })).status, 400);
  assert.equal((await (await h.send({ method: 'GET' })).json()).data.length, 0);
  h.DB.sqlite.exec("UPDATE visitors SET created_at='2000-01-01 00:00:00'");
  assert.equal((await h.send({ body: manual() })).status, 401);
  assert.equal(h.count('meal_logs'), 1); // Sem limpeza física automática inventada.
});
test('diário contexto: registro, edição e exclusão pelas rotas refletem o próximo recorte, sem ligar opt-in', async t => {
  const h = await setup(t), eaten_at = new Date(Date.now() - 1000).toISOString(), id = await h.create(manual({ eaten_at }));
  assert.equal(await selectHistoryContext(h.env, h.visitor, 'cook'), null);
  await writePreferences(h.env, h.visitor, { version: 1, use_history: true, defaults: {} });
  assert.equal(JSON.parse(await selectHistoryContext(h.env, h.visitor, 'cook')).meals[0].description, manual().description);
  await h.send({ method: 'PUT', id, body: edited({ eaten_at }) });
  assert.equal(JSON.parse(await selectHistoryContext(h.env, h.visitor, 'ready')).meals[0].description, edited().description);
  await h.send({ method: 'DELETE', id, body: { version: 1 } });
  assert.equal(await selectHistoryContext(h.env, h.visitor, 'cook'), null);
  assert.equal((await readPreferences(h.env, h.visitor)).use_history, true);
  assert.equal(h.calls(), 0);
});
test('diário migração: linha anterior sem datas não recebe confirmação ou prazo inventados', async t => {
  const h = await setup(t);
  h.DB.sqlite.prepare('INSERT INTO meal_logs(id, visitor_id, eaten_at, data_json) VALUES (?, ?, ?, ?)').run(
    crypto.randomUUID(), h.visitor.visitorId, '2026-01-01T00:00:00Z', JSON.stringify({ version: 1, source: 'manual', description: 'Antigo' }));
  assert.deepEqual((await listMeals(h.env, h.visitor, { limit: 20 })).data, []);
});
