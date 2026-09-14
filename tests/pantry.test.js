import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { historyDb } from './helpers/history-db.js';
import { createApiHandlers } from '../src/http/api.js';
import { resolveVisitorSession } from '../src/security/session.js';
import { savePlan } from '../src/history/plans.js';
import { mutateMeal } from '../src/history/meal-logs.js';
import { UNIT_CHOICES, LIMITS } from '../src/contracts/generation.js';
import { PANTRY_LIMITS, validatePantryItem, validatePantryItems, normalizePantryName, quantityMillis } from '../src/contracts/pantry.js';
import { listPantry, getPantryItem, mutatePantry } from '../src/history/pantry.js';
import { previewPantryDeduction, applyPantryDeduction } from '../src/history/pantry-deduction.js';
import { planPantryDeduction } from '../src/pantry/deduction.js';
import * as collection from '../functions/api/pantry.js';
import * as record from '../functions/api/pantry/[id].js';
import * as deduction from '../functions/api/meal-logs/[id]/pantry-deduction.js';

test('baixa parcial: desconta somente elegíveis, relata ignorados e não reabre lote já aplicado', async t => {
  const h = await setup(t), id = await h.create(), meal = await h.meal({ ingredients: [ingredient(), ingredient('Feijão')] });
  const result = await h.apply(meal);
  const data = (await result.json()).data;
  assert.equal(data.applied_count, 1); assert.deepEqual(data.items.map(value => value.status), ['deducted', 'skipped']);
  assert.equal(data.items[1].reason, 'not_found');
  await h.create(item({ name: 'Feijão' }));
  const p = await h.preview(meal); assert.equal(p.status, 'already_applied');
  assert.equal((await getPantryItem(h.env, h.visitor, id)).quantity, 400);
});
test('baixa: exclusão do consumo entre leitura e transação não permite descontar estoque', async t => {
  const h = await setup(t), id = await h.create(), meal = await h.meal(), p = await h.preview(meal);
  h.DB.before = sql => {
    if (sql.includes('INSERT INTO pantry_mutations')) {
      h.DB.before = null; h.DB.sqlite.prepare('DELETE FROM meal_logs WHERE id=?').run(meal);
    }
  };
  assert.equal((await h.deduct(meal, { body: { version: 1, preview_id: p.preview_id, confirmed_snapshot: true } })).status, 400);
  assert.equal((await getPantryItem(h.env, h.visitor, id)).quantity, 500);
  assert.equal(h.DB.sqlite.prepare("SELECT COUNT(*) AS n FROM pantry_mutations WHERE operation='deduct'").get().n, 0);
});
test('despensa: erro de leitura/recibo e linha inconsistente são sanitizados sem chamar IA', async t => {
  const h = await setup(t), id = await h.create();
  h.DB.before = sql => { if (sql.includes('FROM pantry_items')) throw Error('PRIVADO'); };
  assert.equal((await h.send({ method: 'GET' })).status, 503);
  h.DB.before = sql => { if (sql.includes('FROM pantry_mutations')) throw Error('PRIVADO'); };
  assert.equal((await h.send({ body: item({ name: 'Feijão' }) })).status, 503);
  h.DB.before = null;
  h.DB.sqlite.prepare('UPDATE pantry_items SET normalized_name=? WHERE id=?').run('inconsistente', id);
  const response = await h.send({ method: 'GET' });
  assert.equal(response.status, 503); assert.equal((await response.text()).includes('inconsistente'), false);
  assert.equal(h.calls(), 0);
});

const item = (patch = {}) => ({ version: 1, name: 'Arroz', quantity: 500, unit: 'g', ...patch });
const ingredient = (name = 'Arroz', quantity = 200, unit = 'g') => ({ name, quantity, unit });
const mealInput = { mode: 'cook', meal: 'jantar', people: 2, time_minutes: 30, ingredient_policy: 'suggest', ingredients: [] };
const pureMeal = (patch = {}) => ({ source: 'plan_suggestion', side: 'cook', description: 'Arroz', servings_consumed: 1,
  snapshot: { side: 'cook', title: 'Arroz', servings: 2, ingredients: [ingredient()] }, ...patch });
const stock = (patch = {}) => ({ id: '00000000-0000-4000-8000-000000000001', revision: 1, ...item(), ...patch });
async function setup(t) {
  const DB = historyDb(); t.after(() => DB.sqlite.close());
  const common = { visitorDay: 1000, visitorMinute: 1000, networkDay: 1000, networkMinute: 1000,
    globalDay: 1000, globalMinute: 1000, reserveTokens: 0, dayTokens: 0, minuteTokens: 0 };
  const policy = { ingress: common, session: common };
  const env = { DB, PANTRY_ENABLED: 'true', DIARY_ENABLED: 'true', SESSIONS_ENABLED: 'true', AI_ENABLED: 'false',
    SESSION_SECRET: 'fake-pantry-session-secret-not-production', IP_HASH_SECRET: 'fake-pantry-network-secret-not-production',
    QUOTA_POLICY_JSON: JSON.stringify(policy) };
  let calls = 0;
  const handlers = createApiHandlers({ fetchImpl: async () => { calls++; throw Error('Despensa não chama IA.'); } });
  const request = ({ method = 'POST', cookie = '', body = {}, key = crypto.randomUUID(), headers = {}, query = '' } = {}) =>
    new Request('https://pantry.test/api/pantry' + query, { method, headers: { Origin: 'https://pantry.test',
      'Content-Type': 'application/json', Cookie: cookie, 'CF-Connecting-IP': '192.0.2.1', 'Idempotency-Key': key, ...headers },
      ...(method === 'GET' ? {} : { body: JSON.stringify(body) }) });
  const session = async () => {
    const response = await handlers.session({ env, request: request() }); assert.equal(response.status, 201);
    const cookie = response.headers.get('Set-Cookie').split(';')[0];
    return { cookie, visitor: await resolveVisitorSession(request({ cookie }), env) };
  };
  const a = await session();
  const send = (options = {}) => handlers.pantry({ env, request: request({ cookie: a.cookie, ...options }),
    params: options.id === undefined ? {} : { id: options.id } });
  const deduct = (id, options = {}) => handlers.pantryDeduction({ env, request: request({ cookie: a.cookie, ...options }), params: { id } });
  const create = async (body = item(), options = {}) => {
    const response = await send({ body, ...options }); assert.equal(response.status, 201, await response.clone().text());
    return (await response.json()).data.id;
  };
  const meal = async ({ mode = 'cook', ingredients = [ingredient()], title = 'Arroz', servings_consumed = 1, owner = a.visitor } = {}) => {
    const recipe = { title, servings: 2, total_minutes: 20, ingredients, steps: ['Use SAL_PASSO_APENAS sem cadastrá-lo.'] };
    const dish = { title, servings: 2, description: 'Opção pronta', search_term: 'arroz pronto' };
    const input = mode === 'ready' ? { mode, meal: 'jantar', people: 2 } : { ...mealInput, mode };
    const data = mode === 'compare' ? { version: 1, mode, cook: { status: 'suggested', suggestions: [recipe] },
      ready: { status: 'suggested', suggestions: [dish] } } : { version: 1, mode, suggestions: [mode === 'ready' ? dish : recipe] };
    const plan = await savePlan(env, owner, crypto.randomUUID().replaceAll('-', '').repeat(2), input, { data,
      metadata: { model: 'openai/gpt-oss-20b', elapsed_ms: 1, usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2, reasoning_tokens: null } } });
    const raw = { version: 1, source: 'plan_suggestion', plan_id: plan, side: mode === 'ready' ? 'ready' : 'cook',
      suggestion_index: 0, confirmed_consumed: true, eaten_at: new Date(Date.now() - 1000).toISOString(),
      ...(servings_consumed === null ? {} : { servings_consumed }) };
    return (await mutateMeal(env, owner, 'create', null, raw, crypto.randomUUID())).data.id;
  };
  const preview = async (id, options = {}) => {
    const response = await deduct(id, { method: 'GET', ...options }); assert.equal(response.status, 200);
    return (await response.json()).data;
  };
  const apply = async (id, options = {}) => {
    const p = await preview(id);
    return deduct(id, { body: { version: 1, confirmed_snapshot: true, preview_id: p.preview_id }, ...options });
  };
  return { ...a, DB, env, policy, request, handlers, session, send, deduct, create, meal, preview, apply,
    calls: () => calls, count: table => DB.sqlite.prepare('SELECT COUNT(*) AS n FROM ' + table).get().n };
}
test('despensa contrato: limites reaproveitados, opcionais independentes e enum único', () => {
  assert.equal(PANTRY_LIMITS.items, LIMITS.ingredients); assert.equal(PANTRY_LIMITS.nameCharacters, LIMITS.ingredientCharacters);
  assert.deepEqual(validatePantryItem({ version: 1, name: ' Arroz ' }), { version: 1, name: 'Arroz' });
  assert.equal(validatePantryItem(item({ quantity: 0 })).quantity, 0);
  for (const unit of UNIT_CHOICES) assert.equal(validatePantryItem(item({ unit })).unit, unit);
  assert.deepEqual(validatePantryItem({ version: 1, name: 'Arroz', unit: 'g' }), { version: 1, name: 'Arroz', unit: 'g' });
  assert.equal(validatePantryItem(item({ name: '😀'.repeat(80), quantity: 100000 })).quantity, 100000);
  for (const raw of [null, {}, item({ name: '' }), item({ name: 'a'.repeat(81) }), item({ quantity: -1 }),
    item({ quantity: 100001 }), item({ quantity: 0.0001 }), item({ quantity: null }), item({ quantity: '1' }),
    item({ unit: 'gramas' }), item({ unit: null }), item({ photo: 'foto' }), item({ visitor_id: crypto.randomUUID() }),
    item({ ingredients: [] }), item({ added_at: '2026-01-01' }), item({ revision: 1 }), item({ version: 2 })]) {
    assert.throws(() => validatePantryItem(raw));
  }
  assert.throws(() => validatePantryItem(item(), { update: true }));
});
test('despensa normalização: trim, NFC e pt-BR, sem apagar acentos ou adivinhar sinônimos', () => {
  assert.equal(normalizePantryName(' CAFE\u0301 '), 'café');
  assert.notEqual(normalizePantryName('café'), normalizePantryName('cafe'));
  assert.notEqual(normalizePantryName('arroz'), normalizePantryName('arroz integral'));
  assert.throws(() => validatePantryItems([item({ name: 'CAFÉ' }), item({ name: 'cafe\u0301' })]));
  assert.throws(() => validatePantryItems(Array.from({ length: 41 }, (_, i) => item({ name: 'Item ' + i }))));
});
test('despensa validade: data informada, opcional, calendário real; não estima nem classifica alimento', () => {
  for (const expires_at of ['2024-02-29', '2020-01-01', '2099-12-31']) assert.equal(validatePantryItem(item({ expires_at })).expires_at, expires_at);
  for (const expires_at of ['2026-02-30', '2025-02-29', '', null, '2026-01-01T00:00:00Z']) {
    assert.throws(() => validatePantryItem(item({ expires_at })));
  }
  assert.equal(Object.hasOwn(validatePantryItem(item()), 'expires_at'), false);
});
test('despensa funções: criar, recuperar, editar por revisão, excluir e reabrir sem renovar sessão', async t => {
  const h = await setup(t), key = crypto.randomUUID();
  const created = await mutatePantry(h.env, h.visitor, 'create', null, item({ expires_at: '2020-01-01' }), key);
  const id = created.data.id, first = await getPantryItem(h.env, h.visitor, id);
  assert.equal(first.revision, 1); assert.equal(first.expires_at, '2020-01-01'); // Não filtrar alimento por data.
  await mutatePantry(h.env, h.visitor, 'update', id, { version: 1, name: 'Arroz novo', revision: 1 }, crypto.randomUUID());
  const second = await getPantryItem(h.env, h.visitor, id);
  assert.equal(second.revision, 2); assert.equal(second.added_at, first.added_at);
  for (const field of ['quantity', 'unit', 'expires_at']) assert.equal(Object.hasOwn(second, field), false);
  const reopened = await createApiHandlers().pantry({ env: h.env, request: h.request({ method: 'GET', cookie: h.cookie }) });
  assert.equal((await reopened.json()).data[0].name, 'Arroz novo');
  await mutatePantry(h.env, h.visitor, 'delete', id, { version: 1, revision: 2 }, crypto.randomUUID());
  assert.deepEqual(await listPantry(h.env, h.visitor), []); assert.equal(h.count('pantry_mutations'), 3);
});
test('despensa HTTP: duplicata normalizada não soma quantidade nem cria recibo de sucesso', async t => {
  const h = await setup(t), id = await h.create(item({ name: 'CAFÉ', quantity: 100 }));
  assert.equal((await h.send({ body: item({ name: 'cafe\u0301' }) })).status, 400);
  assert.equal(h.count('pantry_items'), 1); assert.equal(h.count('pantry_mutations'), 1);
  assert.equal((await getPantryItem(h.env, h.visitor, id)).quantity, 100);
  const other = await h.create(item({ name: 'Feijão' }));
  assert.equal((await h.send({ method: 'PUT', id: other, body: item({ name: 'café', revision: 1 }) })).status, 400);
  assert.equal((await getPantryItem(h.env, h.visitor, other)).name, 'Feijão');
});
test('despensa HTTP: teto de 40 itens, exclusão libera espaço mas não libera chave antiga', async t => {
  const h = await setup(t); let first;
  for (let i = 0; i < 40; i++) { const id = await h.create(item({ name: 'Item ' + i })); if (!first) first = id; }
  assert.equal((await h.send({ body: item({ name: 'Excedente' }) })).status, 400);
  assert.equal((await listPantry(h.env, h.visitor)).length, 40);
  await h.send({ method: 'DELETE', id: first, body: { version: 1, revision: 1 } });
  await h.create(item({ name: 'Novo item' })); assert.equal(h.count('pantry_items'), 40);
});
test('despensa: reenvio não reaplica criação/edição/exclusão e revisão velha não sobrescreve estoque', async t => {
  const h = await setup(t), key = crypto.randomUUID(), id = await h.create(item(), { key });
  assert.equal((await h.send({ key, body: item({ quantity: 999 }) })).status, 409);
  const editKey = crypto.randomUUID(), body = item({ quantity: 300, revision: 1 });
  assert.equal((await h.send({ method: 'PUT', id, key: editKey, body })).status, 200);
  assert.equal((await h.send({ method: 'PUT', id, key: editKey, body })).status, 409);
  assert.equal((await h.send({ method: 'PUT', id, body })).status, 400);
  const deleteKey = crypto.randomUUID();
  assert.equal((await h.send({ method: 'DELETE', id, body: { version: 1, revision: 1 } })).status, 400);
  assert.equal((await h.send({ method: 'DELETE', id, key: deleteKey, body: { version: 1, revision: 2 } })).status, 200);
  assert.equal((await h.send({ method: 'DELETE', id, key: deleteKey, body: { version: 1, revision: 2 } })).status, 409);
  assert.equal((await h.send({ key, body: item() })).status, 409); assert.equal(h.count('pantry_items'), 0);
});
test('despensa: isolamento de lista/leitura/escrita/exclusão e mesma chave entre dois visitantes', async t => {
  const h = await setup(t), b = await h.session(), key = crypto.randomUUID(), id = await h.create(item(), { key });
  assert.deepEqual((await (await h.send({ method: 'GET', cookie: b.cookie })).json()).data, []);
  for (const method of ['GET', 'PUT', 'DELETE']) {
    const body = method === 'PUT' ? item({ revision: 1 }) : { version: 1, revision: 1 };
    const foreign = await h.send({ method, id, cookie: b.cookie, body });
    const absent = await h.send({ method, id: crypto.randomUUID(), cookie: b.cookie, body });
    assert.equal(foreign.status, 400); assert.deepEqual(await foreign.json(), await absent.json());
  }
  assert.equal((await h.send({ cookie: b.cookie, body: item({ visitor_id: h.visitor.visitorId }) })).status, 400);
  await h.create(item(), { cookie: b.cookie, key }); assert.equal(h.count('pantry_items'), 2);
});
test('despensa: flags publicáveis desligadas, sessão/origem/chave/corpo obrigatórios, nenhuma cota de IA', async t => {
  const h = await setup(t);
  assert.equal((await h.send({ body: item(), cookie: '' })).status, 401);
  assert.equal((await h.send({ body: item(), key: '' })).status, 400);
  assert.equal((await h.send({ method: 'GET', headers: { Origin: 'https://outro.test' } })).status, 403);
  assert.equal((await h.send({ body: item(), headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  assert.equal((await h.send({ body: item(), headers: { 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await h.send({ body: item({ name: 'a'.repeat(20000) }) })).status, 413);
  assert.equal((await h.send({ method: 'GET', query: '?visitor_id=outro' })).status, 400);
  await h.create(); h.env.PANTRY_ENABLED = 'false';
  assert.equal((await h.send({ method: 'GET' })).status, 503);
  h.env.PANTRY_ENABLED = 'true'; h.env.SESSIONS_ENABLED = 'false'; assert.equal((await h.send({ method: 'GET' })).status, 503);
  for (const fn of [...Object.values(collection), ...Object.values(record), ...Object.values(deduction)]) {
    assert.equal((await fn({ env: {} })).status, 503);
  }
  const config = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.equal((config.match(/"PANTRY_ENABLED": "false"/gu) ?? []).length, 2);
  assert.equal((config.match(/"PANTRY_ENABLED": "true"/gu) ?? []).length, 1);
  assert.equal(h.calls(), 0); assert.equal(h.count('preferences'), 0);
  assert.equal(h.DB.sqlite.prepare("SELECT COUNT(*) AS n FROM usage_reservations WHERE operation IN ('generation','vision')").get().n, 0);
});
test('despensa ingress: leituras, escritas e baixa continuam limitadas sem exigir chave Groq', async t => {
  const h = await setup(t);
  h.env.QUOTA_POLICY_JSON = JSON.stringify({ ...h.policy, ingress: { ...h.policy.ingress, globalMinute: 1 } });
  assert.equal((await h.send({ method: 'GET' })).status, 200);
  assert.equal((await h.send({ body: item() })).status, 429);
  assert.equal((await h.deduct(crypto.randomUUID(), { method: 'GET' })).status, 429);
  assert.equal(h.calls(), 0);
});
test('despensa: falha SQL em criar/editar/excluir desfaz recibo e conteúdo', async t => {
  const h = await setup(t);
  for (const [operation, method] of [['INSERT', 'POST'], ['UPDATE', 'PUT'], ['DELETE', 'DELETE']]) {
    const id = operation === 'INSERT' ? undefined : await h.create(item({ name: operation }));
    const before = h.count('pantry_mutations');
    h.DB.sqlite.exec('CREATE TRIGGER pantry_fail BEFORE ' + operation + " ON pantry_items BEGIN SELECT RAISE(ABORT, 'PRIVADO'); END;");
    const response = await h.send({ method, id, body: method === 'DELETE' ? { version: 1, revision: 1 } : item({ ...(method === 'PUT' ? { revision: 1 } : {}) }) });
    assert.equal(response.status, 503); assert.equal((await response.text()).includes('PRIVADO'), false);
    assert.equal(h.count('pantry_mutations'), before);
    h.DB.sqlite.exec('DROP TRIGGER pantry_fail');
  }
});
test('baixa pura: nome exato, NFC, quantidade proporcional declarada, sem arredondar saldo nem remover item', () => {
  const original = pureMeal(), pantry = [stock()];
  const before = structuredClone({ original, pantry });
  const result = planPantryDeduction(original, pantry);
  assert.equal(result.items[0].quantity, 100); assert.equal(result.items[0].quantity_after, 400);
  assert.equal(result.items[0].origin, 'calculado'); assert.equal(result.items[0].based_on_estimates, true);
  assert.ok(result.items[0].sources.includes('snapshot.ingredients.0.quantity'));
  assert.deepEqual({ original, pantry }, before);
  assert.equal(quantityMillis(1.001), 1001); assert.equal(quantityMillis(0.0001), null);
  const exact = planPantryDeduction(original, [stock({ quantity: 100 })]); assert.equal(exact.items[0].quantity_after, 0);
  const nfc = pureMeal({ snapshot: { ...original.snapshot, ingredients: [ingredient('CAFE\u0301')] } });
  assert.equal(planPantryDeduction(nfc, [stock({ name: 'Café' })]).items[0].status, 'eligible');
});
test('baixa pura: ambiguidade, correspondência parcial, unidade diferente e falta de quantidade não alteram nada', () => {
  const base = pureMeal();
  for (const [pantry, reason] of [[[stock(), stock() ], 'ambiguous_name'], [[stock({ name: 'Arroz integral' })], 'not_found'],
    [[stock({ unit: 'kg' })], 'unit_mismatch'], [[stock({ quantity: undefined })], 'quantity_unknown'],
    [[stock({ unit: undefined })], 'quantity_unknown'], [[stock({ quantity: 99 })], 'insufficient_quantity'], [[], 'not_found']]) {
    assert.equal(planPantryDeduction(base, pantry).items[0].reason, reason);
  }
  const repeated = pureMeal({ snapshot: { ...base.snapshot, ingredients: [ingredient(), ingredient('ARROZ')] } });
  assert.ok(planPantryDeduction(repeated, [stock()]).items.every(value => value.reason === 'ambiguous_name'));
});
test('baixa pura: sem receita estruturada, porções ausentes/excessivas, descrição alterada e precisão insuficiente', () => {
  for (const value of [pureMeal({ source: 'manual' }), pureMeal({ side: 'ready' })]) {
    assert.equal(planPantryDeduction(value, [stock()]).reason, 'no_structured_recipe');
  }
  for (const portion of [undefined, 0, 3]) assert.equal(planPantryDeduction(pureMeal({ servings_consumed: portion }), [stock()]).reason, 'servings_unconfirmed');
  assert.equal(planPantryDeduction(pureMeal({ description: 'Outro prato' }), [stock()]).reason, 'meal_changed');
  const fractional = pureMeal({ servings_consumed: 0.3333333 });
  assert.equal(planPantryDeduction(fractional, [stock()]).items[0].reason, 'precision_unsupported');
});
test('baixa HTTP: prévia só lê, confirmação desconta ingrediente estruturado; passo não vira fonte', async t => {
  const h = await setup(t), id = await h.create(), salt = await h.create(item({ name: 'SAL_PASSO_APENAS' })), meal = await h.meal();
  assert.equal((await getPantryItem(h.env, h.visitor, id)).quantity, 500); // Registrar diário não baixa.
  const preview = await h.preview(meal);
  assert.equal(preview.status, 'review_required'); assert.equal(preview.items.length, 1);
  assert.equal((await getPantryItem(h.env, h.visitor, id)).quantity, 500);
  const response = await h.deduct(meal, { body: { version: 1, preview_id: preview.preview_id, confirmed_snapshot: true } });
  assert.equal(response.status, 200); assert.equal((await response.json()).data.items[0].status, 'deducted');
  assert.equal((await getPantryItem(h.env, h.visitor, id)).quantity, 400);
  assert.equal((await getPantryItem(h.env, h.visitor, salt)).quantity, 500);
  assert.equal(h.calls(), 0); assert.equal(h.count('preferences'), 0);
});
test('baixa: saldo zero fica cadastrado, sem remoção automática nem decisão pela validade', async t => {
  const h = await setup(t), id = await h.create(item({ quantity: 100, expires_at: '2020-01-01' })), meal = await h.meal();
  assert.equal((await h.apply(meal)).status, 200);
  const current = await getPantryItem(h.env, h.visitor, id);
  assert.equal(current.quantity, 0); assert.equal(current.revision, 2);
  assert.equal(current.expires_at, '2020-01-01'); assert.equal(h.count('pantry_items'), 1);
});
test('baixa: compare só lado cozinhar, ready e porção desconhecida não descontam; sem recusa transformada em comida', async t => {
  const h = await setup(t), id = await h.create();
  const compare = await h.meal({ mode: 'compare' }); assert.equal((await h.apply(compare)).status, 200);
  for (const mode of ['ready', 'cook']) {
    const meal = await h.meal({ mode, servings_consumed: null }), p = await h.preview(meal);
    assert.equal(p.status, 'not_applicable'); assert.equal((await h.apply(meal)).status, 200);
  }
  assert.equal((await getPantryItem(h.env, h.visitor, id)).quantity, 400);
});
test('baixa: registro manual/delivery confirmado não permite inferir ingredientes do texto', async t => {
  const h = await setup(t), id = await h.create();
  const meal = (await mutateMeal(h.env, h.visitor, 'create', null, { version: 1, source: 'manual', confirmed_consumed: true,
    description: 'Comi 100 g de arroz', eaten_at: new Date(Date.now() - 1000).toISOString() }, crypto.randomUUID())).data.id;
  assert.equal((await h.preview(meal)).reason, 'no_structured_recipe');
  assert.equal((await h.apply(meal)).status, 200);
  assert.equal((await getPantryItem(h.env, h.visitor, id)).quantity, 500);
  assert.equal(h.DB.sqlite.prepare("SELECT COUNT(*) AS n FROM pantry_mutations WHERE operation='deduct'").get().n, 0);
});
test('baixa: motivos de ignorar são explícitos e item inexistente ou ambíguo não some', async t => {
  const h = await setup(t), id = await h.create();
  const meal = await h.meal({ ingredients: [ingredient('Arroz'), ingredient('ARROZ'), ingredient('Feijão')] });
  const p = await h.preview(meal);
  assert.deepEqual(p.items.map(value => value.reason), ['ambiguous_name', 'ambiguous_name', 'not_found']);
  const result = await h.apply(meal); assert.equal((await result.json()).data.applied, false);
  assert.equal((await getPantryItem(h.env, h.visitor, id)).quantity, 500);
});
test('baixa: confirmação obrigatória, prévia adulterada/corpo alheio rejeitados e flags respeitadas', async t => {
  const h = await setup(t); await h.create(); const meal = await h.meal(), p = await h.preview(meal);
  const base = { version: 1, preview_id: p.preview_id, confirmed_snapshot: true };
  for (const body of [{ ...base, confirmed_snapshot: false }, { ...base, preview_id: 'a'.repeat(64) },
    { ...base, ingredients: [] }, { ...base, visitor_id: h.visitor.visitorId }]) {
    assert.equal((await h.deduct(meal, { body })).status, 400);
  }
  h.env.DIARY_ENABLED = 'false'; assert.equal((await h.deduct(meal, { method: 'GET' })).status, 503);
  assert.equal(h.count('pantry_items'), 1);
});
test('baixa: reenvio com mesma ou nova chave não desconta duas vezes, mesmo após excluir diário', async t => {
  const h = await setup(t), id = await h.create(), meal = await h.meal(), p = await h.preview(meal), key = crypto.randomUUID();
  const body = { version: 1, preview_id: p.preview_id, confirmed_snapshot: true };
  assert.equal((await h.deduct(meal, { body, key })).status, 200);
  for (const sameKey of [key, crypto.randomUUID()]) assert.equal((await h.deduct(meal, { body, key: sameKey })).status, 409);
  assert.equal((await h.preview(meal)).status, 'already_applied');
  await mutateMeal(h.env, h.visitor, 'delete', meal, { version: 1 }, crypto.randomUUID());
  assert.equal((await h.deduct(meal, { body, key })).status, 409);
  assert.equal((await getPantryItem(h.env, h.visitor, id)).quantity, 400);
  const receipt = h.DB.sqlite.prepare("SELECT * FROM pantry_mutations WHERE operation='deduct'").get();
  assert.equal(JSON.stringify(receipt).includes('Arroz'), false); assert.equal(receipt.expires_at, h.visitor.expiresAt);
});
test('baixa: alteração de estoque/diário invalida prévia; edição manual antiga não repõe estoque', async t => {
  const h = await setup(t), id = await h.create(), meal = await h.meal(), p = await h.preview(meal);
  await h.send({ method: 'PUT', id, body: item({ revision: 1, quantity: 450 }) });
  assert.equal((await h.deduct(meal, { body: { version: 1, preview_id: p.preview_id, confirmed_snapshot: true } })).status, 400);
  await h.apply(meal);
  assert.equal((await h.send({ method: 'PUT', id, body: item({ revision: 2 }) })).status, 400);
  assert.equal((await getPantryItem(h.env, h.visitor, id)).quantity, 350);
  const other = await h.meal(), q = await h.preview(other);
  await mutateMeal(h.env, h.visitor, 'update', other, { version: 1, description: 'Outra refeição',
    eaten_at: new Date(Date.now() - 1000).toISOString(), servings_consumed: 1 }, crypto.randomUUID());
  assert.equal((await h.deduct(other, { body: { version: 1, preview_id: q.preview_id, confirmed_snapshot: true } })).status, 400);
  assert.equal((await h.preview(other)).reason, 'meal_changed');
});
test('baixa: concorrência entre prévia e transação rejeita tudo sem baixa parcial nem recibo falso', async t => {
  const h = await setup(t), rice = await h.create(), beans = await h.create(item({ name: 'Feijão' }));
  const meal = await h.meal({ ingredients: [ingredient(), ingredient('Feijão')] }), p = await h.preview(meal);
  h.DB.before = sql => {
    if (sql.includes('INSERT INTO pantry_mutations')) {
      h.DB.before = null;
      h.DB.sqlite.prepare('UPDATE pantry_items SET quantity=499, revision=revision+1 WHERE id=?').run(beans);
    }
  };
  assert.equal((await h.deduct(meal, { body: { version: 1, preview_id: p.preview_id, confirmed_snapshot: true } })).status, 400);
  assert.equal((await getPantryItem(h.env, h.visitor, rice)).quantity, 500);
  assert.equal((await getPantryItem(h.env, h.visitor, beans)).quantity, 499);
  assert.equal(h.DB.sqlite.prepare("SELECT COUNT(*) AS n FROM pantry_mutations WHERE operation='deduct'").get().n, 0);
});
test('baixa: falha no segundo desconto desfaz primeiro e recibo; erro sanitizado', async t => {
  const h = await setup(t), rice = await h.create(), beans = await h.create(item({ name: 'Feijão' }));
  const meal = await h.meal({ ingredients: [ingredient(), ingredient('Feijão')] }), p = await h.preview(meal), key = crypto.randomUUID();
  h.DB.sqlite.exec("CREATE TRIGGER deduction_fail BEFORE UPDATE ON pantry_items WHEN OLD.name='Feijão' BEGIN SELECT RAISE(ABORT, 'PRIVADO'); END;");
  const body = { version: 1, preview_id: p.preview_id, confirmed_snapshot: true };
  const response = await h.deduct(meal, { body, key });
  assert.equal(response.status, 503); assert.equal((await response.text()).includes('PRIVADO'), false);
  for (const id of [rice, beans]) assert.equal((await getPantryItem(h.env, h.visitor, id)).quantity, 500);
  h.DB.sqlite.exec('DROP TRIGGER deduction_fail');
  assert.equal((await h.deduct(meal, { body, key })).status, 200);
});
test('baixa isolamento: não lê refeição/estoque/recibo de outro visitante; mesmo nome permanece separado', async t => {
  const h = await setup(t), b = await h.session(), rice = await h.create(), meal = await h.meal();
  assert.equal((await h.deduct(meal, { method: 'GET', cookie: b.cookie })).status, 400);
  const otherMeal = await h.meal({ owner: b.visitor }), p = await h.preview(otherMeal, { cookie: b.cookie });
  assert.equal(p.items[0].reason, 'not_found'); // Estoque de A não participa.
  await h.apply(meal);
  assert.equal((await h.deduct(meal, { method: 'GET', cookie: b.cookie })).status, 400);
  assert.equal((await getPantryItem(h.env, h.visitor, rice)).quantity, 400);
});
test('baixa por função e retenção: sessão expirada bloqueia; validade do alimento não é retenção', async t => {
  const h = await setup(t); await h.create(); const meal = await h.meal();
  const p = await previewPantryDeduction(h.env, h.visitor, meal);
  const result = await applyPantryDeduction(h.env, h.visitor, meal, { version: 1, preview_id: p.preview_id, confirmed_snapshot: true }, crypto.randomUUID());
  assert.equal(result.data.applied, true);
  h.DB.sqlite.exec("UPDATE visitors SET created_at='2000-01-01 00:00:00'");
  assert.equal((await h.send({ method: 'GET' })).status, 401);
  assert.equal((await h.deduct(meal, { method: 'GET' })).status, 401);
  assert.equal(h.count('pantry_items'), 1);
});
