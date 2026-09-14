// Exercícios locais do Item 3; só D1 descartável e provedor simulado do harness principal.
import assert from 'node:assert/strict';

export async function checkDiaryRuntime({ db, send, session, scenario, calls, policy }) {
  const enabled = { DIARY_ENABLED: 'true', AI_ENABLED: 'false', GROQ_API_KEY: '' };
  const body = (patch = {}) => ({ version: 1, source: 'manual', description: 'Delivery de arroz',
    eaten_at: '2026-01-10T19:00:00-03:00', confirmed_consumed: true, ...patch });
  const edit = { version: 1, description: 'Refeição corrigida', eaten_at: '2026-01-11T12:00:00Z' };
  const diary = (cookie, options = {}) => {
    const { id, overrides, ...rest } = options;
    return send('/meal-logs' + (id ? '/' + id : ''), { cookie, ...rest, overrides: { ...enabled, ...overrides } });
  };
  const count = async table => (await db.prepare('SELECT COUNT(*) AS n FROM ' + table).first()).n;
  const create = async (cookie, options = {}) => {
    const response = await diary(cookie, { body: body(), ...options });
    assert.equal(response.status, 201, JSON.stringify(await response.clone().json()));
    return (await response.json()).data.id;
  };
  const read = async (cookie, id) => {
    const response = await diary(cookie, { method: 'GET', id }); assert.equal(response.status, 200);
    return (await response.json()).data;
  };
  const plan = async (cookie, mode, provider) => {
    const input = mode === 'ready' ? { mode, meal: 'jantar', people: 2 }
      : { mode, meal: 'jantar', people: 2, time_minutes: 30, ingredient_policy: 'suggest', ingredients: [] };
    const key = crypto.randomUUID();
    const response = await send('/generate', { cookie, body: input, key, headers: provider ? { 'X-Test-Provider': provider } : {} });
    assert.equal(response.status, 200);
    assert.equal(await count('meal_logs'), 0); // Gerar/salvar não é consumir.
    const replay = await send('/generate', { cookie, body: input, key }); assert.equal(replay.status, 409);
    return (await replay.json()).replay.plan.id;
  };
  const select = (plan_id, side = 'cook') => ({ version: 1, source: 'plan_suggestion', plan_id, side,
    suggestion_index: 0, eaten_at: new Date(Date.now() - 1000).toISOString(), confirmed_consumed: true });

  await scenario('diário: manual/delivery retroativo, leitura e edição/exclusão sem chave ou cota de IA', async () => {
    const cookie = await session(), id = await create(cookie);
    const meal = await read(cookie, id); assert.equal(meal.eaten_at, '2026-01-10T22:00:00.000Z');
    assert.equal(meal.plan_id, null); assert.equal(Object.hasOwn(meal, 'servings_consumed'), false);
    assert.equal((await diary(cookie, { method: 'PUT', id, body: edit })).status, 200);
    assert.equal((await read(cookie, id)).description, edit.description);
    assert.equal((await diary(cookie, { method: 'DELETE', id, body: { version: 1 } })).status, 200);
    assert.deepEqual(await read(cookie), []);
    assert.equal(await calls(), 0); assert.equal(await count('preferences'), 0);
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM usage_reservations WHERE operation IN ('generation','vision')").first()).n, 0);
  });
  for (const mode of ['cook', 'ready', 'compare']) {
    await scenario('diário: sugestão ' + mode + ' confirmada explicitamente, sem registrar outro lado', async () => {
      const cookie = await session(), planId = await plan(cookie, mode), side = mode === 'ready' ? 'ready' : 'cook';
      const beforeCalls = await calls(), beforeReservations = await count('usage_reservations');
      const id = await create(cookie, { body: select(planId, side) }), meal = await read(cookie, id);
      assert.equal(meal.source, 'plan_suggestion'); assert.equal(meal.plan_id, planId);
      assert.equal(meal.side, side); assert.equal(await count('meal_logs'), 1);
      assert.equal(meal.snapshot.servings, 2); assert.equal(Object.hasOwn(meal, 'servings_consumed'), false);
      assert.equal(Object.hasOwn(meal.snapshot, 'steps'), false);
      assert.equal(await calls(), beforeCalls);
      assert.ok(await count('usage_reservations') > beforeReservations); // Só ingress novo.
      assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM usage_reservations WHERE operation='generation'").first()).n, 1);
    });
  }
  await scenario('diário compare: recusa rejeitada; só lado sugerido pode ser consumido', async () => {
    const cookie = await session(), planId = await plan(cookie, 'compare', 'compare-cook-none');
    assert.equal((await diary(cookie, { body: select(planId) })).status, 400);
    assert.equal(await count('meal_logs'), 0); assert.equal(await count('meal_log_mutations'), 0);
    await create(cookie, { body: select(planId, 'ready') });
    assert.equal(await count('meal_logs'), 1);
  });
  await scenario('diário: 12 confirmações simultâneas com a mesma chave geram uma única refeição', async () => {
    const cookie = await session(), key = crypto.randomUUID();
    const responses = await Promise.all(Array.from({ length: 12 }, () => diary(cookie, { key, body: body() })));
    assert.equal(responses.filter(value => value.status === 201).length, 1);
    assert.equal(responses.filter(value => value.status === 409).length, 11);
    assert.equal(await count('meal_logs'), 1); assert.equal(await count('meal_log_mutations'), 1);
    assert.equal(await calls(), 0);
  });
  await scenario('diário: refeições iguais com ações diferentes; edição concorrente repetida só é aplicada uma vez', async () => {
    const cookie = await session();
    const [a, b] = await Promise.all([create(cookie), create(cookie, { body: body({ eaten_at: '2026-01-11T19:00:00-03:00' }) })]);
    assert.notEqual(a, b); assert.equal(await count('meal_logs'), 2);
    const key = crypto.randomUUID();
    const results = await Promise.all(Array.from({ length: 6 }, () => diary(cookie, { method: 'PUT', id: a, key, body: edit })));
    assert.equal(results.filter(value => value.status === 200).length, 1);
    assert.equal(results.filter(value => value.status === 409).length, 5);
    assert.equal((await read(cookie, a)).description, edit.description);
    assert.equal((await read(cookie, b)).description, body().description);
  });
  await scenario('diário: exclusão concorrente/reenvio preserva recibos e POST antigo não ressuscita consumo', async () => {
    const cookie = await session(), key = crypto.randomUUID(), id = await create(cookie, { key });
    const deleteKey = crypto.randomUUID();
    const responses = await Promise.all(Array.from({ length: 6 }, () => diary(cookie, { method: 'DELETE', id, key: deleteKey, body: { version: 1 } })));
    assert.equal(responses.filter(value => value.status === 200).length, 1);
    assert.equal(responses.filter(value => value.status === 409).length, 5);
    assert.equal((await diary(cookie, { key, body: body() })).status, 409);
    assert.equal(await count('meal_logs'), 0); assert.equal(await count('meal_log_mutations'), 2);
  });
  await scenario('diário: isolamento entre visitantes em lista, leitura, edição, exclusão e plano', async () => {
    const a = await session(), b = await session(), planId = await plan(a, 'ready'), id = await create(a);
    assert.deepEqual(await read(b), []);
    for (const method of ['GET', 'PUT', 'DELETE']) {
      assert.equal((await diary(b, { method, id, body: method === 'PUT' ? edit : { version: 1 } })).status, 400);
    }
    assert.equal((await diary(b, { body: select(planId, 'ready') })).status, 400);
    assert.equal((await diary(b, { body: body({ visitor_id: crypto.randomUUID() }) })).status, 400);
    assert.equal(await count('meal_logs'), 1);
  });
  await scenario('diário: falhas SQL em criar/editar/excluir fazem rollback do recibo e do conteúdo', async () => {
    const cookie = await session();
    for (const [operation, method] of [['INSERT', 'POST'], ['UPDATE', 'PUT'], ['DELETE', 'DELETE']]) {
      const id = operation === 'INSERT' ? undefined : await create(cookie), before = await count('meal_log_mutations');
      await db.prepare('CREATE TRIGGER diary_fail BEFORE ' + operation + " ON meal_logs BEGIN SELECT RAISE(ABORT, 'PRIVADO_DIARIO'); END").run();
      try {
        const response = await diary(cookie, { method, id, body: method === 'POST' ? body() : method === 'PUT' ? edit : { version: 1 } });
        assert.equal(response.status, 503); assert.equal((await response.text()).includes('PRIVADO_DIARIO'), false);
        assert.equal(await count('meal_log_mutations'), before);
      } finally { await db.prepare('DROP TRIGGER diary_fail').run(); }
    }
  });
  await scenario('diário: flags, sessão, confirmação, chave e ingress continuam obrigatórios', async () => {
    const cookie = await session();
    assert.equal((await diary(cookie, { body: body(), overrides: { DIARY_ENABLED: 'false' } })).status, 503);
    assert.equal((await diary('', { body: body() })).status, 401);
    assert.equal((await diary(cookie, { body: body({ confirmed_consumed: false }) })).status, 400);
    assert.equal((await diary(cookie, { body: body(), key: '' })).status, 400);
    assert.equal((await diary(cookie, { body: body(), headers: { Origin: 'https://outro.test' } })).status, 403);
    assert.equal((await diary(cookie, { body: body(), overrides: {
      QUOTA_POLICY_JSON: JSON.stringify({ ...policy, ingress: { ...policy.ingress, globalMinute: 1 } }),
    } })).status, 429);
    assert.equal(await count('meal_logs'), 0); assert.equal(await calls(), 0);
  });
  await scenario('diário: edição/exclusão real das rotas atualiza contexto autorizado', async () => {
    const cookie = await session(), eaten_at = new Date(Date.now() - 1000).toISOString();
    const id = await create(cookie, { body: body({ eaten_at }) });
    assert.equal(await count('preferences'), 0);
    const personalized = { PERSONALIZATION_ENABLED: 'true' };
    assert.equal((await send('/preferences', { cookie, method: 'PUT', overrides: personalized,
      body: { version: 1, use_history: true, defaults: {} } })).status, 200);
    await diary(cookie, { method: 'PUT', id, body: { ...edit, eaten_at } });
    assert.equal((await send('/generate', { cookie, overrides: personalized })).status, 200);
    let sent = JSON.parse((await db.prepare('SELECT body_json FROM test_provider_requests ORDER BY rowid DESC LIMIT 1').first()).body_json);
    assert.equal(JSON.parse(sent.messages[2].content).meals[0].description, edit.description);
    await diary(cookie, { method: 'DELETE', id, body: { version: 1 } });
    assert.equal((await send('/generate', { cookie, overrides: personalized })).status, 200);
    sent = JSON.parse((await db.prepare('SELECT body_json FROM test_provider_requests ORDER BY rowid DESC LIMIT 1').first()).body_json);
    assert.equal(sent.messages.length, 2);
    assert.equal(JSON.parse((await db.prepare('SELECT data_json FROM preferences').first()).data_json).use_history, true);
  });
}
