// Exclusão no workerd/D1 descartável; dados fictícios e Groq sempre simulada.
import assert from 'node:assert/strict';

export async function checkDeletionRuntime({ db, send, session, scenario, calls, policy }) {
  const enabled = { HISTORY_DELETION_ENABLED: 'true', PERSONALIZATION_ENABLED: 'true', DIARY_ENABLED: 'true', PANTRY_ENABLED: 'true' };
  const confirmation = { version: 1, confirmed: true };
  const cook = { mode: 'cook', meal: 'jantar', people: 1, time_minutes: 30, ingredient_policy: 'suggest', ingredients: [] };
  const preference = { version: 1, use_history: true, use_pantry: true, defaults: {} };
  const item = { version: 1, name: 'Arroz', quantity: 500, unit: 'g' };
  const erase = (cookie, options = {}) => send('/history', { cookie, method: 'DELETE', body: confirmation, overrides: enabled, ...options });
  const count = async table => (await db.prepare('SELECT COUNT(*) AS n FROM ' + table).first()).n;
  const rows = async table => (await db.prepare('SELECT * FROM ' + table + ' ORDER BY rowid').all()).results;
  const seed = async cookie => {
    const key = crypto.randomUUID();
    assert.equal((await send('/generate', { cookie, body: cook, key })).status, 200);
    const replay = await send('/generate', { cookie, body: cook, key });
    const plan = (await replay.json()).replay.plan;
    assert.equal((await send('/preferences', { cookie, method: 'PUT', body: preference, overrides: enabled })).status, 200);
    const pantryKey = crypto.randomUUID();
    assert.equal((await send('/pantry', { cookie, key: pantryKey, body: item, overrides: enabled })).status, 201);
    const mealKey = crypto.randomUUID(), mealBody = { version: 1, source: 'plan_suggestion', plan_id: plan.id,
      side: 'cook', suggestion_index: 0, servings_consumed: 1, confirmed_consumed: true, eaten_at: new Date(Date.now() - 1000).toISOString() };
    assert.equal((await send('/meal-logs', { cookie, key: mealKey, body: mealBody, overrides: enabled })).status, 201);
    return { key, plan: plan.id, pantryKey, mealKey, mealBody };
  };
  const products = ['plans', 'preferences', 'meal_logs', 'pantry_items'];

  await scenario('exclusão: remove só produto do dono, mantém sessão, recibos e contadores de IA', async () => {
    const a = await session(), owner = (await db.prepare('SELECT id FROM visitors').first()).id;
    const b = await session(); await seed(a); await seed(b);
    const before = {};
    for (const table of products) before[table] = (await rows(table)).filter(row => row.visitor_id !== owner);
    const technical = { meals: await rows('meal_log_mutations'), pantry: await rows('pantry_mutations'),
      buckets: (await rows('usage_buckets')).filter(row => row.bucket_key.startsWith('generation:')),
      receipts: (await rows('usage_reservations')).filter(row => row.operation === 'generation') };
    const r = await erase(a, { overrides: { ...enabled, AI_ENABLED: 'false', GROQ_API_KEY: '' } });
    assert.equal(r.status, 200); assert.deepEqual(await r.json(), { data: { version: 1, deleted: true } });
    assert.equal(r.headers.get('Set-Cookie'), null);
    for (const table of products) assert.deepEqual(await rows(table), before[table]);
    assert.deepEqual(await rows('meal_log_mutations'), technical.meals);
    assert.deepEqual(await rows('pantry_mutations'), technical.pantry);
    assert.deepEqual((await rows('usage_buckets')).filter(row => row.bucket_key.startsWith('generation:')), technical.buckets);
    assert.deepEqual((await rows('usage_reservations')).filter(row => row.operation === 'generation'), technical.receipts);
    assert.equal(await count('visitors'), 2); assert.equal(await calls(), 2);
  });
  await scenario('exclusão: 12 reenvios concorrentes resultam em uma revisão/recibo; chave antiga preserva novo cadastro', async () => {
    const cookie = await session(); await seed(cookie); const key = crypto.randomUUID();
    const replies = await Promise.all(Array.from({ length: 12 }, () => erase(cookie, { key })));
    assert.ok(replies.every(r => r.status === 200));
    assert.equal(await count('history_deletions'), 1);
    assert.equal((await db.prepare('SELECT history_revision FROM visitors').first()).history_revision, 1);
    assert.equal((await send('/pantry', { cookie, body: item, overrides: enabled })).status, 201);
    assert.equal((await erase(cookie, { key })).status, 200); assert.equal(await count('pantry_items'), 1);
    assert.equal((await erase(cookie)).status, 200); assert.equal(await count('pantry_items'), 0);
  });
  await scenario('exclusão: chaves novas concorrentes são serializadas, sem remoção parcial', async () => {
    const cookie = await session(); await seed(cookie);
    const replies = await Promise.all(Array.from({ length: 4 }, () => erase(cookie)));
    assert.ok(replies.every(r => r.status === 200));
    for (const table of products) assert.equal(await count(table), 0);
    assert.equal(await count('history_deletions'), 4);
    assert.equal((await db.prepare('SELECT history_revision FROM visitors').first()).history_revision, 4);
  });
  await scenario('exclusão: rollback em D1 restaura conteúdo, versão e recibo', async () => {
    const cookie = await session(); await seed(cookie); const key = crypto.randomUUID();
    await db.prepare("CREATE TRIGGER history_abort BEFORE DELETE ON pantry_items BEGIN SELECT RAISE(ABORT,'SQL_PRIVADO'); END").run();
    try {
      const r = await erase(cookie, { key }); assert.equal(r.status, 503); assert.equal((await r.text()).includes('SQL_PRIVADO'), false);
      for (const table of products) assert.equal(await count(table), 1);
      assert.equal(await count('history_deletions'), 0);
      assert.equal((await db.prepare('SELECT history_revision FROM visitors').first()).history_revision, 0);
    } finally { await db.prepare('DROP TRIGGER history_abort').run(); }
    assert.equal((await erase(cookie, { key })).status, 200);
  });
  await scenario('exclusão: confirmação, sessão, origem, flag e query protegem rota sem depender da IA', async () => {
    const cookie = await session(); await seed(cookie);
    assert.equal((await erase('')).status, 401);
    assert.equal((await erase(cookie, { body: { ...confirmation, visitor_id: crypto.randomUUID() } })).status, 400);
    assert.equal((await erase(cookie, { body: { version: 1, confirmed: false } })).status, 400);
    assert.equal((await erase(cookie, { headers: { Origin: 'https://outro.test' } })).status, 403);
    assert.equal((await erase(cookie, { overrides: { ...enabled, HISTORY_DELETION_ENABLED: 'false' } })).status, 503);
    assert.equal((await send('/history?visitor_id=outro', { cookie, method: 'DELETE', overrides: enabled, body: confirmation })).status, 400);
    assert.equal(await count('plans'), 1);
    assert.equal((await erase(cookie, { overrides: { ...enabled, AI_ENABLED: 'false', GROQ_API_KEY: '', DIARY_ENABLED: 'false', PANTRY_ENABLED: 'false', PERSONALIZATION_ENABLED: 'false' } })).status, 200);
    assert.equal(await calls(), 1);
  });
  await scenario('exclusão: quarta geração bloqueada e replay sem plano, sem chamada ou estorno', async () => {
    const cookie = await session(), key = crypto.randomUUID();
    for (const k of [key, crypto.randomUUID(), crypto.randomUUID()]) assert.equal((await send('/generate', { cookie, body: cook, key: k })).status, 200);
    assert.equal((await erase(cookie)).status, 200);
    const r = await send('/generate', { cookie, body: cook, key });
    assert.equal(r.status, 409); assert.equal((await r.json()).replay.available, false);
    assert.equal((await send('/generate', { cookie, body: cook })).status, 429);
    assert.equal(await calls(), 3);
  });
  await scenario('exclusão: reenvio de consumo/estoque preserva recibo, sem ressuscitar nem personalizar', async () => {
    const cookie = await session(), seeded = await seed(cookie);
    assert.equal((await erase(cookie)).status, 200);
    assert.equal((await send('/meal-logs', { cookie, body: seeded.mealBody, key: seeded.mealKey, overrides: enabled })).status, 409);
    assert.equal((await send('/pantry', { cookie, body: item, key: seeded.pantryKey, overrides: enabled })).status, 409);
    assert.equal(await count('meal_logs'), 0); assert.equal(await count('pantry_items'), 0);
    const prefs = await send('/preferences', { cookie, method: 'GET', overrides: enabled });
    assert.deepEqual((await prefs.json()).data, { version: 1, use_history: false, defaults: {} });
    assert.equal((await send('/generate', { cookie, body: cook, overrides: enabled })).status, 200);
    const sent = JSON.parse((await db.prepare('SELECT body_json FROM test_provider_requests ORDER BY rowid DESC LIMIT 1').first()).body_json);
    assert.equal(sent.messages.length, 2);
  });
  await scenario('exclusão durante provedor: resposta antiga não repõe plano e cota permanece reservada', async () => {
    const cookie = await session(), key = crypto.randomUUID();
    const r = await send('/generate', { cookie, body: cook, key, headers: { 'X-Test-Delete-During-Provider': 'true' } });
    assert.equal(r.status, 503); assert.equal((await r.json()).quotaReserved, true);
    assert.equal(await count('plans'), 0); assert.equal(await count('history_deletions'), 1);
    assert.equal((await send('/generate', { cookie, body: cook, key })).status, 409);
    assert.equal(await calls(), 1);
    assert.equal((await send('/generate', { cookie, body: cook })).status, 200);
    assert.equal(await count('plans'), 1);
  });
  await scenario('exclusão: ingress bloqueia repetição mesmo sem IA habilitada', async () => {
    const cookie = await session();
    const overrides = { ...enabled, AI_ENABLED: 'false', GROQ_API_KEY: '',
      QUOTA_POLICY_JSON: JSON.stringify({ ...policy, ingress: { ...policy.ingress, globalMinute: 1 } }) };
    assert.equal((await erase(cookie, { overrides })).status, 200);
    assert.equal((await erase(cookie, { overrides })).status, 429);
    assert.equal(await calls(), 0);
  });
}
