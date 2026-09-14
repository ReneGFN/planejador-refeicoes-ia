// Item 4 no runtime local; banco descartável e provedor sempre simulado.
import assert from 'node:assert/strict';

export async function checkPantryRuntime({ db, send, session, scenario, calls, policy }) {
  const enabled = { PANTRY_ENABLED: 'true', DIARY_ENABLED: 'true', AI_ENABLED: 'false', GROQ_API_KEY: '' };
  const item = (patch = {}) => ({ version: 1, name: 'Arroz', quantity: 500, unit: 'g', ...patch });
  const pantry = (cookie, { id, overrides, ...options } = {}) => send('/pantry' + (id ? '/' + id : ''), {
    cookie, ...options, overrides: { ...enabled, ...overrides },
  });
  const deduct = (cookie, id, { overrides, ...options } = {}) => send('/meal-logs/' + id + '/pantry-deduction', {
    cookie, ...options, overrides: { ...enabled, ...overrides },
  });
  const create = async (cookie, body = item(), options = {}) => {
    const response = await pantry(cookie, { body, ...options }); assert.equal(response.status, 201, await response.clone().text());
    return (await response.json()).data.id;
  };
  const get = async (cookie, id) => {
    const response = await pantry(cookie, { method: 'GET', id }); assert.equal(response.status, 200);
    return (await response.json()).data;
  };
  const preview = async (cookie, id) => {
    const response = await deduct(cookie, id, { method: 'GET' }); assert.equal(response.status, 200);
    return (await response.json()).data;
  };
  const confirmation = p => ({ version: 1, preview_id: p.preview_id, confirmed_snapshot: true });
  const count = async table => (await db.prepare('SELECT COUNT(*) AS n FROM ' + table).first()).n;
  const meal = async (cookie, mode = 'cook') => {
    const input = mode === 'ready' ? { mode, meal: 'jantar', people: 2 }
      : { mode, meal: 'jantar', people: 2, time_minutes: 30, ingredient_policy: 'suggest', ingredients: [] };
    const key = crypto.randomUUID(), response = await send('/generate', { cookie, body: input, key });
    assert.equal(response.status, 200);
    const replay = await send('/generate', { cookie, body: input, key }); assert.equal(replay.status, 409);
    const plan = (await replay.json()).replay.plan;
    const saved = await send('/meal-logs', { cookie, overrides: enabled, body: { version: 1, source: 'plan_suggestion',
      plan_id: plan.id, side: mode === 'ready' ? 'ready' : 'cook', suggestion_index: 0,
      servings_consumed: 1, eaten_at: new Date(Date.now() - 1000).toISOString(), confirmed_consumed: true } });
    assert.equal(saved.status, 201);
    return (await saved.json()).data.id;
  };

  await scenario('baixa: lote máximo de 40 ingredientes estruturados é confirmado atomicamente no runtime', async () => {
    const cookie = await session(), names = Array.from({ length: 40 }, (_, i) => 'Ingrediente ' + i);
    for (const name of names) await create(cookie, item({ name, quantity: 1 }));
    const mealId = await meal(cookie);
    // Amplia somente o instantâneo fictício do teste; nenhuma rota publicável aceita essa alteração.
    const ingredients = names.map(name => ({ name, quantity: 1, unit: 'g' }));
    await db.prepare("UPDATE meal_logs SET data_json=json_set(data_json, '$.snapshot.ingredients', json(?1)) WHERE id=?2")
      .bind(JSON.stringify(ingredients), mealId).run();
    const p = await preview(cookie, mealId);
    assert.equal(p.items.length, 40); assert.ok(p.items.every(value => value.status === 'eligible'));
    const result = await deduct(cookie, mealId, { body: confirmation(p) });
    assert.equal(result.status, 200); assert.equal((await result.json()).data.applied_count, 40);
    assert.ok((await get(cookie)).every(value => value.quantity === 0.5 && value.revision === 2));
  });
  await scenario('despensa: CRUD sem IA, opcionais, revisão e reabertura; datas não removem item', async () => {
    const cookie = await session(), id = await create(cookie, item({ expires_at: '2020-01-01' }));
    assert.equal((await get(cookie, id)).expires_at, '2020-01-01');
    assert.equal((await pantry(cookie, { method: 'PUT', id, body: { version: 1, name: 'Arroz integral', revision: 1 } })).status, 200);
    const current = await get(cookie, id); assert.equal(current.revision, 2); assert.equal(Object.hasOwn(current, 'quantity'), false);
    assert.equal((await pantry(cookie, { method: 'DELETE', id, body: { version: 1, revision: 1 } })).status, 400);
    assert.equal((await pantry(cookie, { method: 'DELETE', id, body: { version: 1, revision: 2 } })).status, 200);
    assert.deepEqual(await get(cookie), []); assert.equal(await calls(), 0);
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM usage_reservations WHERE operation IN ('generation','vision')").first()).n, 0);
  });
  await scenario('despensa: 12 criações com mesma chave produzem um item e 11 duplicidades', async () => {
    const cookie = await session(), key = crypto.randomUUID();
    const results = await Promise.all(Array.from({ length: 12 }, () => pantry(cookie, { key, body: item() })));
    assert.equal(results.filter(r => r.status === 201).length, 1);
    assert.equal(results.filter(r => r.status === 409).length, 11);
    assert.equal(await count('pantry_items'), 1); assert.equal(await count('pantry_mutations'), 1);
  });
  await scenario('despensa: nomes NFC/pt-BR concorrentes com chaves novas não duplicam nem somam', async () => {
    const cookie = await session();
    const results = await Promise.all(['CAFÉ', 'cafe\u0301'].map(name => pantry(cookie, { body: item({ name }) })));
    assert.equal(results.filter(r => r.status === 201).length, 1);
    assert.equal(results.filter(r => r.status === 400).length, 1);
    assert.equal((await get(cookie))[0].quantity, 500);
    assert.equal(await count('pantry_mutations'), 1);
  });
  await scenario('despensa: teto de 40 é atômico, inclusive duas criações na última vaga', async () => {
    const cookie = await session();
    for (let i = 0; i < 39; i++) await create(cookie, item({ name: 'Item ' + i }));
    const results = await Promise.all(['A', 'B'].map(name => pantry(cookie, { body: item({ name }) })));
    assert.equal(results.filter(r => r.status === 201).length, 1);
    assert.equal(results.filter(r => r.status === 400).length, 1);
    assert.equal((await get(cookie)).length, 40);
  });
  await scenario('despensa: isolamento em lista, leitura, escrita/exclusão e chaves entre dois visitantes', async () => {
    const a = await session(), b = await session(), key = crypto.randomUUID(), id = await create(a, item(), { key });
    assert.deepEqual(await get(b), []);
    for (const method of ['GET', 'PUT', 'DELETE']) assert.equal((await pantry(b, {
      method, id, body: method === 'PUT' ? item({ revision: 1 }) : { version: 1, revision: 1 },
    })).status, 400);
    await create(b, item(), { key }); assert.equal(await count('pantry_items'), 2);
  });
  await scenario('despensa: falha de escrita desfaz recibo e não expõe SQL', async () => {
    const cookie = await session();
    await db.prepare("CREATE TRIGGER pantry_abort BEFORE INSERT ON pantry_items BEGIN SELECT RAISE(ABORT, 'PRIVADO'); END").run();
    try {
      const response = await pantry(cookie, { body: item() }); assert.equal(response.status, 503);
      assert.equal((await response.text()).includes('PRIVADO'), false);
      assert.equal(await count('pantry_mutations'), 0);
    } finally { await db.prepare('DROP TRIGGER pantry_abort').run(); }
  });
  await scenario('despensa: flags, sessão, corpo, unidade e ingress obrigatórios sem cota de IA', async () => {
    const cookie = await session();
    assert.equal((await pantry(cookie, { body: item(), overrides: { PANTRY_ENABLED: 'false' } })).status, 503);
    assert.equal((await pantry('', { body: item() })).status, 401);
    assert.equal((await pantry(cookie, { body: item({ unit: 'gramas' }) })).status, 400);
    assert.equal((await pantry(cookie, { body: item({ visitor_id: crypto.randomUUID() }) })).status, 400);
    assert.equal((await pantry(cookie, { method: 'GET', overrides: { QUOTA_POLICY_JSON: JSON.stringify({
      ...policy, ingress: { ...policy.ingress, globalMinute: 1 },
    }) } })).status, 429);
    assert.equal(await calls(), 0);
  });
  for (const mode of ['cook', 'compare']) {
    await scenario('baixa ' + mode + ': consumo confirmado, prévia e proporção declarada sem nova IA', async () => {
      const cookie = await session(), id = await create(cookie, item({ quantity: 50, expires_at: '2020-01-01' }));
      const mealId = await meal(cookie, mode), beforeCalls = await calls();
      const p = await preview(cookie, mealId);
      assert.equal(p.items[0].quantity, 50); assert.equal((await get(cookie, id)).quantity, 50);
      assert.equal(p.items[0].origin, 'calculado'); assert.equal(p.items[0].based_on_estimates, true);
      const applied = await deduct(cookie, mealId, { body: confirmation(p) }); assert.equal(applied.status, 200);
      assert.equal((await applied.json()).data.items[0].status, 'deducted');
      assert.equal((await get(cookie, id)).quantity, 0); assert.equal(await count('pantry_items'), 1);
      assert.equal(await calls(), beforeCalls); assert.equal(await count('preferences'), 0);
    });
  }
  await scenario('baixa: 12 confirmações concorrentes com chaves distintas descontam uma única vez', async () => {
    const cookie = await session(), id = await create(cookie), mealId = await meal(cookie), p = await preview(cookie, mealId);
    const results = await Promise.all(Array.from({ length: 12 }, () => deduct(cookie, mealId, { body: confirmation(p) })));
    assert.equal(results.filter(r => r.status === 200).length, 1, JSON.stringify(results.map(r => r.status)));
    assert.equal(results.filter(r => r.status === 409).length, 11, JSON.stringify(results.map(r => r.status)));
    assert.equal((await get(cookie, id)).quantity, 450);
  });
  await scenario('baixa: duas refeições concorrentes não sobrescrevem saldo nem usam prévia obsoleta', async () => {
    const cookie = await session(), id = await create(cookie), meals = [await meal(cookie), await meal(cookie)];
    const previews = await Promise.all(meals.map(id => preview(cookie, id)));
    const results = await Promise.all(meals.map((id, i) => deduct(cookie, id, { body: confirmation(previews[i]) })));
    assert.equal(results.filter(r => r.status === 200).length, 1);
    assert.equal(results.filter(r => r.status === 400).length, 1);
    assert.equal((await get(cookie, id)).quantity, 450);
  });
  await scenario('baixa: prévia obsoleta ou receita pronta não descontam; edição velha não restaura estoque', async () => {
    const cookie = await session(), id = await create(cookie), mealId = await meal(cookie), p = await preview(cookie, mealId);
    await pantry(cookie, { method: 'PUT', id, body: item({ quantity: 400, revision: 1 }) });
    assert.equal((await deduct(cookie, mealId, { body: confirmation(p) })).status, 400);
    const q = await preview(cookie, mealId); assert.equal((await deduct(cookie, mealId, { body: confirmation(q) })).status, 200);
    assert.equal((await pantry(cookie, { method: 'PUT', id, body: item({ quantity: 500, revision: 2 }) })).status, 400);
    const ready = await meal(cookie, 'ready'), readyPreview = await preview(cookie, ready);
    assert.equal(readyPreview.reason, 'no_structured_recipe');
    assert.equal((await get(cookie, id)).quantity, 350);
  });
  await scenario('baixa: nome parcial/unidade diferente e ausente não são convertidos pela IA', async () => {
    const cookie = await session(), id = await create(cookie, item({ name: 'Arroz integral' })), mealId = await meal(cookie);
    assert.equal((await preview(cookie, mealId)).items[0].reason, 'not_found');
    await pantry(cookie, { method: 'PUT', id, body: item({ unit: 'kg', revision: 1 }) });
    const p = await preview(cookie, mealId); assert.equal(p.items[0].reason, 'unit_mismatch');
    assert.equal((await deduct(cookie, mealId, { body: confirmation(p) })).status, 200);
    assert.equal((await get(cookie, id)).quantity, 500);
  });
  await scenario('baixa: falha SQL desfaz recibo/desconto e permite tentativa explícita com mesma chave', async () => {
    const cookie = await session(), id = await create(cookie), mealId = await meal(cookie), p = await preview(cookie, mealId);
    const key = crypto.randomUUID();
    await db.prepare("CREATE TRIGGER deduction_abort BEFORE UPDATE ON pantry_items BEGIN SELECT RAISE(ABORT, 'PRIVADO'); END").run();
    try {
      assert.equal((await deduct(cookie, mealId, { key, body: confirmation(p) })).status, 503);
      assert.equal((await get(cookie, id)).quantity, 500);
      assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM pantry_mutations WHERE operation='deduct'").first()).n, 0);
    } finally { await db.prepare('DROP TRIGGER deduction_abort').run(); }
    assert.equal((await deduct(cookie, mealId, { key, body: confirmation(p) })).status, 200);
  });
  await scenario('baixa: isolamento de refeição/estoque/recibo e exclusão de diário sem segundo desconto', async () => {
    const a = await session(), b = await session(), id = await create(a), mealId = await meal(a), p = await preview(a, mealId);
    assert.equal((await deduct(b, mealId, { method: 'GET' })).status, 400);
    const key = crypto.randomUUID();
    await deduct(a, mealId, { key, body: confirmation(p) });
    await send('/meal-logs/' + mealId, { cookie: a, method: 'DELETE', overrides: enabled, body: { version: 1 } });
    assert.equal((await deduct(a, mealId, { body: confirmation(p) })).status, 409);
    assert.equal((await deduct(b, mealId, { body: confirmation(p) })).status, 400);
    assert.equal((await get(a, id)).quantity, 450);
  });
}
