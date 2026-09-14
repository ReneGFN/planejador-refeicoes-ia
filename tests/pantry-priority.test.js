import test from 'node:test';
import assert from 'node:assert/strict';
import { historyDb } from './helpers/history-db.js';
import { prioritizePantry, PANTRY_CONTEXT_LIMITS } from '../src/pantry/priority.js';
import { buildGenerationContext, selectGenerationContext } from '../src/history/generation-context.js';
import { buildHistoryContext, characterCount } from '../src/history/context.js';
import { writePreferences, readPreferences } from '../src/history/preferences.js';
import { validatePreferences } from '../src/contracts/preferences.js';
import { mutatePantry } from '../src/history/pantry.js';

async function httpSetup(t) {
  const { createApiHandlers } = await import('../src/http/api.js');
  const { resolveVisitorSession } = await import('../src/security/session.js');
  const h = setup(t), sent = [];
  const base = { visitorDay: 1000, visitorMinute: 1000, networkDay: 1000, networkMinute: 1000,
    globalDay: 1000, globalMinute: 1000, dayTokens: 0, minuteTokens: 0, reserveTokens: 0 };
  Object.assign(h.env, { SESSIONS_ENABLED: 'true', AI_ENABLED: 'true',
    SESSION_SECRET: 'fake-priority-session-secret-not-production',
    IP_HASH_SECRET: 'fake-priority-network-secret-not-production', GROQ_API_KEY: 'fake-no-network-key',
    QUOTA_POLICY_JSON: JSON.stringify({ ingress: base, session: base,
      generation: { ...base, visitorDay: 3, reserveTokens: 4096, dayTokens: 1000000, minuteTokens: 1000000 } }) });
  const handlers = createApiHandlers({ fetchImpl: async (_, init) => {
    const body = JSON.parse(init.body); sent.push(body);
    return Response.json({ model: body.model, usage: { prompt_tokens: 1000, completion_tokens: 100, total_tokens: 1100 },
      choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ version: 1, mode: 'cook',
        suggestions: [{ title: 'Arroz', servings: 2, total_minutes: 20,
          ingredients: [{ name: 'Arroz', quantity: 100, unit: 'g' }], steps: ['Cozinhe o arroz.'] }] }) } }] });
  } });
  const request = (cookie = '', body = cook, key = crypto.randomUUID()) => new Request('https://priority.test/api/generate', {
    method: 'POST', headers: { Origin: 'https://priority.test', 'Content-Type': 'application/json', Cookie: cookie,
      'CF-Connecting-IP': '192.0.2.1', 'Idempotency-Key': key }, body: JSON.stringify(body) });
  const session = async () => {
    const r = await handlers.session({ env: h.env, request: request('', {}) });
    assert.equal(r.status, 201);
    const cookie = r.headers.get('Set-Cookie').split(';')[0];
    return { cookie, visitor: await resolveVisitorSession(request(cookie), h.env) };
  };
  const generate = (cookie, body = cook, key) => handlers.generate({ env: h.env, request: request(cookie, body, key) });
  return { ...h, sent, session, generate };
}

test('prioridade HTTP: vazio funciona, opt-in envia ordem/limite sem alterar SYSTEM/pedido/reserva', async t => {
  const h = await httpSetup(t), a = await h.session();
  const { generationSystem } = await import('../src/providers/generation-prompts.js');
  await writePreferences(h.env, a.visitor, prefs(true, false));
  assert.equal((await h.generate(a.cookie)).status, 200);
  assert.equal(h.sent[0].messages.length, 2);
  await h.add(a.visitor, stock('Sem data')); await h.add(a.visitor, stock('Antes', '2020-01-01'));
  const key = crypto.randomUUID();
  assert.equal((await h.generate(a.cookie, cook, key)).status, 200);
  const sent = h.sent.at(-1);
  assert.deepEqual(JSON.parse(sent.messages[1].content), cook);
  assert.equal(sent.messages[0].content, generationSystem('cook'));
  assert.equal(sent.max_completion_tokens, 4096);
  assert.deepEqual(JSON.parse(sent.messages[2].content).pantry.map(x => x.name), ['Antes', 'Sem data']);
  assert.ok(characterCount(sent.messages[2].content) <= 1200);
  const start = h.DB.trace.length;
  assert.equal((await h.generate(a.cookie, cook, key)).status, 409);
  assert.equal(h.sent.length, 2);
  assert.equal(h.DB.trace.slice(start).some(sql => /FROM preferences|FROM meal_logs|FROM pantry_items/u.test(sql)), false);
  assert.equal(h.DB.sqlite.prepare("SELECT reserved_tokens FROM usage_buckets WHERE bucket_key='generation:Day:all'").get().reserved_tokens, 8192);
  assert.ok(h.DB.sqlite.prepare('SELECT data_json FROM plans').all().every(row => !row.data_json.includes('meal_context')));
});

test('prioridade HTTP: sessão, corpo e consentimento não permitem ler despensa de outro visitante', async t => {
  const h = await httpSetup(t), a = await h.session(), b = await h.session();
  await h.add(a.visitor, stock('ESTOQUE_ALHEIO'));
  await writePreferences(h.env, a.visitor, prefs(true, false));
  await writePreferences(h.env, b.visitor, prefs(true, false));
  assert.equal((await h.generate('')).status, 401);
  assert.equal((await h.generate(b.cookie, { ...cook, visitor_id: a.visitor.visitorId })).status, 400);
  assert.equal((await h.generate(b.cookie)).status, 200);
  assert.equal(h.sent.at(-1).messages.length, 2);
  assert.equal((await h.generate(a.cookie)).status, 200);
  assert.match(h.sent.at(-1).messages[2].content, /ESTOQUE_ALHEIO/u);
});

test('prioridade HTTP: erro/data inválida no banco degrada para geração sem contexto, sem reparar linha', async t => {
  const h = await httpSetup(t), a = await h.session();
  await h.add(a.visitor); await writePreferences(h.env, a.visitor, prefs(true, false));
  h.DB.before = sql => { if (sql.includes('FROM pantry_items')) throw Error('DADO_PRIVADO'); };
  assert.equal((await h.generate(a.cookie)).status, 200);
  assert.equal(h.sent.at(-1).messages.length, 2);
  h.DB.before = null;
  h.DB.sqlite.prepare("UPDATE pantry_items SET expires_at='2026-02-30' WHERE visitor_id=?").run(a.visitor.visitorId);
  assert.equal((await h.generate(a.cookie)).status, 200);
  assert.equal(h.sent.at(-1).messages.length, 2);
});


const now = Date.parse('2026-09-12T00:00:00Z');
const cook = { mode: 'cook', meal: 'jantar', people: 2, time_minutes: 30, ingredient_policy: 'suggest', ingredients: [] };
const stock = (name, expires_at, extra = {}) => ({ name, ...(expires_at !== undefined ? { expires_at } : {}), ...extra });
const history = description => buildHistoryContext([{ id: 'a', description, eaten_at: new Date(now).toISOString() }], { now });
const prefs = (use_pantry = true, use_history = true) => ({ version: 1, use_history, use_pantry, defaults: {} });

function setup(t) {
  const DB = historyDb(); t.after(() => DB.sqlite.close());
  const env = { DB, PERSONALIZATION_ENABLED: 'true', PANTRY_ENABLED: 'true' };
  const visitor = () => {
    const v = { visitorId: crypto.randomUUID(), expiresAt: '2026-10-01T00:00:00Z' };
    DB.sqlite.prepare('INSERT INTO visitors (id,session_token_hash) VALUES (?,?)').run(v.visitorId, 'fake-' + v.visitorId);
    return v;
  };
  const a = visitor(), b = visitor();
  const add = (owner = a, item = stock('Arroz', '2026-09-12')) =>
    mutatePantry(env, owner, 'create', null, { version: 1, ...item }, crypto.randomUUID(), { now });
  const meal = (owner = a, description = 'Minha refeição') => DB.sqlite.prepare(
    'INSERT INTO meal_logs (id,visitor_id,eaten_at,data_json) VALUES (?,?,?,?)')
    .run(crypto.randomUUID(), owner.visitorId, new Date(now).toISOString(), JSON.stringify({ version: 1, description }));
  const select = (input = cook, owner = a) => selectGenerationContext(env, owner, input, { now });
  return { DB, env, a, b, add, meal, select };
}

test('validade: ontem, hoje, amanhã e ausência de data em ordem UTC; não altera dados', () => {
  const rows = [stock('Sem data'), stock('Amanhã', '2026-09-13'), stock('Hoje', '2026-09-12'), stock('Ontem', '2026-09-11')];
  const before = structuredClone(rows);
  assert.deepEqual(prioritizePantry(rows, cook).map(x => x.name), ['Ontem', 'Hoje', 'Amanhã', 'Sem data']);
  assert.deepEqual(rows, before);
  const content = JSON.parse(buildGenerationContext(null, rows, cook, { now: Date.parse('2026-09-11T21:00:00-03:00') }));
  assert.equal(content.as_of_utc, '2026-09-12');
  assert.equal(content.pantry[0].expires_at, '2026-09-11');
  assert.equal(Object.hasOwn(content.pantry.at(-1), 'expires_at'), false);
  assert.match(content.notice, /sem julgamento sanitário/u);
});

test('validade: calendário inválido, timestamp e null não viram ausência de data', () => {
  const bad = ['2026-02-29', '2026-04-31', '2026-13-01', '12/09/2026', '2026-09-12T00:00:00Z', '', null];
  const rows = bad.map((date, i) => stock('Inválido ' + i, date));
  rows.push(stock('Bissexto', '2028-02-29'), stock('Sem data'));
  assert.deepEqual(prioritizePantry(rows, cook).map(x => x.name), ['Bissexto', 'Sem data']);
});

test('validade: empate por nome NFC/minúsculas e ID, sem depender da ordem de chegada', () => {
  const rows = [stock('Feijão', '2026-09-12'), stock('ARROZ', '2026-09-12', { id: 'b', quantity: 2 }),
    stock('arroz', '2026-09-12', { id: 'a', quantity: 1 })];
  assert.deepEqual(prioritizePantry(rows, cook).map(x => x.quantity ?? x.name), [1, 2, 'Feijão']);
  assert.deepEqual(prioritizePantry(rows, cook), prioritizePantry([...rows].reverse(), cook));
});

test('validade: teto de quatro itens após ordenar; não copia ID, revisão, foto nem inferências', () => {
  const rows = Array.from({ length: 40 }, (_, i) => stock('Item ' + i, '2026-10-01', { id: String(i), revision: 1, photo: 'NAO_ENVIAR' }));
  const result = prioritizePantry(rows, cook);
  assert.equal(result.length, PANTRY_CONTEXT_LIMITS.items);
  assert.ok(result.every(x => Object.keys(x).join(',') === 'name,expires_at'));
});

test('validade: quantidade zero não participa; desconhecida não é estimada', () => {
  const result = prioritizePantry([stock('Zero', '2026-09-01', { quantity: 0 }), stock('Desconhecida'), stock('Positiva', undefined, { quantity: 0.001, unit: 'g' })], cook);
  assert.deepEqual(result.map(x => x.name), ['Desconhecida', 'Positiva']);
  assert.equal(Object.hasOwn(result[0], 'quantity'), false);
});

test('validade: only_available cruza nome exato normalizado e preserva pedido; sem equivalências inventadas', () => {
  const input = { ...cook, ingredient_policy: 'only_available', ingredients: ['cafe\u0301'] };
  const before = structuredClone(input);
  assert.deepEqual(prioritizePantry([stock('CAFÉ'), stock('Café moído'), stock('Arroz')], input), [{ name: 'CAFÉ' }]);
  assert.deepEqual(input, before);
  assert.deepEqual(prioritizePantry([stock('Arroz')], { ...input, ingredients: [] }), []);
  assert.equal(prioritizePantry([stock('Arroz')], { ...cook, ingredient_policy: 'can_buy_missing', ingredients: ['Feijão'] }).length, 1);
});

test('contexto: divisão compartilhada inclui envelope, no máximo quatro de cada lista', () => {
  const h = buildHistoryContext(Array.from({ length: 8 }, (_, i) => ({ id: String(i), description: 'Refeição ' + i, eaten_at: new Date(now - i * 1000).toISOString() })), { now });
  const text = buildGenerationContext(h, Array.from({ length: 8 }, (_, i) => stock('Ingrediente ' + i, '2026-09-12')), cook, { now });
  const parsed = JSON.parse(text);
  assert.equal(parsed.context_type, 'meal_context');
  assert.ok(parsed.meals.length > 0 && parsed.meals.length <= 4);
  assert.ok(parsed.pantry.length > 0 && parsed.pantry.length <= 4);
  assert.ok(characterCount(JSON.stringify(parsed.meals)) <= 400);
  assert.ok(characterCount(JSON.stringify(parsed.pantry)) <= 400);
  assert.ok(characterCount(text) <= 1200);
});

test('contexto: sem diário despensa usa até 800; sem despensa mantém diário byte a byte', () => {
  const rows = Array.from({ length: 4 }, (_, i) => stock(String(i) + 'a'.repeat(79), '2026-09-12', { quantity: 1, unit: 'g' }));
  const parsed = JSON.parse(buildGenerationContext(null, rows, cook, { now }));
  assert.equal(parsed.pantry.length, 4);
  assert.ok(characterCount(JSON.stringify(parsed.pantry)) > 400);
  assert.ok(characterCount(JSON.stringify(parsed.pantry)) <= 800);
  assert.deepEqual(parsed.meals, []);
  const h = history('Minha refeição');
  assert.equal(buildGenerationContext(h, [], cook, { now }), h);
  assert.equal(buildGenerationContext(null, [], cook, { now }), null);
});

test('contexto: escapes/Unicode contam no JSON, não corta nome nem pula item prioritário que não cabe', () => {
  for (const char of ['😀', '"', '\\', '\u0001']) {
    const rows = [stock(char.repeat(80), '2026-09-11'), stock('Outro', '2026-09-12')];
    const text = buildGenerationContext(history('Refeição '.repeat(30)), rows, cook, { now });
    assert.ok(characterCount(text) <= 1200);
    const parsed = JSON.parse(text);
    if (parsed.pantry) assert.equal(parsed.pantry[0].name, char.repeat(80));
    else assert.equal(parsed.context_type, 'meal_history');
  }
  const h = history('Arroz');
  assert.equal(buildGenerationContext(h, [stock('\u0001'.repeat(80), '2026-09-11'), stock('Outro', '2026-09-12')], cook, { now }), h);
});

test('preferências: use_pantry opcional e booleana; omitir em PUT revoga sem apagar estoque', async t => {
  const h = setup(t); await h.add();
  for (const use_pantry of [null, 'true', 1, {}]) assert.throws(() => validatePreferences(prefs(use_pantry)));
  await writePreferences(h.env, h.a, prefs(true, false)); assert.ok(await h.select());
  await writePreferences(h.env, h.a, { version: 1, use_history: false, defaults: {} });
  assert.equal(Object.hasOwn(await readPreferences(h.env, h.a), 'use_pantry'), false);
  assert.equal(await h.select(), null);
  assert.equal(h.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM pantry_items').get().n, 1);
});

test('contexto: consentimentos independentes, ligar/desligar/reativar e leitura fresca', async t => {
  const h = setup(t); await h.add(); h.meal();
  assert.equal(await h.select(), null);
  for (const [p, d] of [[true, false], [false, true], [true, true], [false, false], [true, false]]) {
    await writePreferences(h.env, h.a, prefs(p, d));
    const content = await h.select(), parsed = content && JSON.parse(content);
    assert.equal(Boolean(parsed?.pantry?.length), p);
    assert.equal(Boolean(parsed?.meals?.length), d);
  }
});

test('contexto: dois visitantes com opt-in não compartilham despensa nem diário', async t => {
  const h = setup(t); await h.add(h.a, stock('Arroz próprio')); await h.add(h.b, stock('ALHEIO'));
  h.meal(h.a, 'Refeição própria'); h.meal(h.b, 'DIARIO_ALHEIO');
  await writePreferences(h.env, h.a, prefs()); await writePreferences(h.env, h.b, prefs());
  const a = await h.select(), b = await h.select(cook, h.b);
  assert.equal(a.includes('ALHEIO'), false); assert.equal(b.includes('própri'), false);
  assert.match(a, /Arroz próprio/u); assert.match(b, /ALHEIO/u);
});

test('contexto: ready não lê despensa; compare/visão/flag geral nem consultam preferências', async t => {
  const h = setup(t); await h.add(); h.meal(); await writePreferences(h.env, h.a, prefs());
  h.DB.before = sql => { if (sql.includes('FROM pantry_items')) throw Error('Leitura proibida'); };
  const start = h.DB.trace.length;
  assert.equal(JSON.parse(await h.select({ mode: 'ready' })).context_type, 'meal_history');
  assert.equal(h.DB.trace.slice(start).some(sql => sql.includes('FROM pantry_items')), false);
  for (const mode of ['compare', 'vision']) {
    const start = h.DB.trace.length;
    assert.equal(await h.select({ mode }), null);
    assert.equal(h.DB.trace.length, start);
  }
  h.env.PERSONALIZATION_ENABLED = 'false';
  const length = h.DB.trace.length; assert.equal(await h.select(), null); assert.equal(h.DB.trace.length, length);
});

test('contexto: sem PANTRY_ENABLED ou use_pantry não consulta estoque, preserva diário', async t => {
  const h = setup(t); await h.add(); h.meal();
  for (const flag of [true, false]) {
    h.env.PANTRY_ENABLED = String(flag);
    await writePreferences(h.env, h.a, prefs(!flag, true));
    const start = h.DB.trace.length;
    assert.equal(JSON.parse(await h.select()).context_type, 'meal_history');
    assert.equal(h.DB.trace.slice(start).some(sql => sql.includes('FROM pantry_items')), false);
  }
});

test('contexto: falha de cada fonte degrada independentemente; preferência ilegível não autoriza nada', async t => {
  const h = setup(t); await h.add(); h.meal(); await writePreferences(h.env, h.a, prefs());
  h.DB.before = sql => { if (sql.includes('FROM pantry_items')) throw Error('PRIVADO'); };
  assert.equal(JSON.parse(await h.select()).context_type, 'meal_history');
  h.DB.before = sql => { if (sql.includes('FROM meal_logs')) throw Error('PRIVADO'); };
  assert.deepEqual(JSON.parse(await h.select()).meals, []);
  h.DB.before = sql => { if (sql.includes('FROM preferences')) throw Error('PRIVADO'); };
  assert.equal(await h.select(), null);
});

test('contexto: data corrompida no banco omite a despensa inteira, sem inventar correção', async t => {
  const h = setup(t); await h.add(); h.meal(); await writePreferences(h.env, h.a, prefs());
  h.DB.sqlite.prepare("UPDATE pantry_items SET expires_at='2026-02-30' WHERE visitor_id=?").run(h.a.visitorId);
  assert.equal(JSON.parse(await h.select()).context_type, 'meal_history');
  assert.equal(h.DB.sqlite.prepare('SELECT expires_at FROM pantry_items').get().expires_at, '2026-02-30');
});

test('contexto: edição e exclusão do estoque são refletidas sem cache; data não é inferida', async t => {
  const h = setup(t); const created = await h.add(); await writePreferences(h.env, h.a, prefs(true, false));
  const id = created.data.id;
  assert.equal(JSON.parse(await h.select()).pantry[0].expires_at, '2026-09-12');
  await mutatePantry(h.env, h.a, 'update', id, { version: 1, name: 'Arroz', revision: 1 }, crypto.randomUUID(), { now });
  assert.deepEqual(JSON.parse(await h.select()).pantry, [{ name: 'Arroz' }]);
  await mutatePantry(h.env, h.a, 'delete', id, { version: 1, revision: 2 }, crypto.randomUUID(), { now });
  assert.equal(await h.select(), null);
});
