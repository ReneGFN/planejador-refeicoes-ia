// Item 5: todos os pedidos passam pelo Worker local, com Groq simulada.
import assert from 'node:assert/strict';

export async function checkPriorityRuntime({ db, send, session, scenario, calls }) {
  const enabled = { PERSONALIZATION_ENABLED: 'true', PANTRY_ENABLED: 'true' };
  const cook = { mode: 'cook', meal: 'jantar', people: 2, time_minutes: 30, ingredient_policy: 'suggest', ingredients: [] };
  const preference = (p, d = false) => ({ version: 1, use_history: d, use_pantry: p, defaults: {} });
  const prefs = async (cookie, body) => {
    const r = await send('/preferences', { cookie, method: 'PUT', overrides: enabled, body });
    assert.equal(r.status, 200); return r;
  };
  const add = async (cookie, name = 'Arroz', expires_at) => {
    const r = await send('/pantry', { cookie, overrides: enabled,
      body: { version: 1, name, ...(expires_at ? { expires_at } : {}) } });
    assert.equal(r.status, 201); return (await r.json()).data.id;
  };
  const last = async () => JSON.parse((await db.prepare('SELECT body_json FROM test_provider_requests ORDER BY rowid DESC LIMIT 1').first()).body_json);
  const generate = async (cookie, options = {}) => {
    const r = await send('/generate', { cookie, body: cook, overrides: enabled, ...options });
    assert.equal(r.status, 200, await r.clone().text()); return last();
  };
  const meal = (cookie, description) => send('/meal-logs', { cookie,
    overrides: { ...enabled, DIARY_ENABLED: 'true' },
    body: { version: 1, source: 'manual', description, eaten_at: new Date(Date.now() - 1000).toISOString(), confirmed_consumed: true } });

  await scenario('prioridade: opt-in separado, reabertura, desliga/reativa; não apaga estoque', async () => {
    const cookie = await session(); await add(cookie);
    await prefs(cookie, preference(true));
    const read = await send('/preferences', { cookie, method: 'GET', overrides: enabled });
    assert.equal((await read.json()).data.use_pantry, true);
    for (const active of [true, false, true]) {
      await prefs(cookie, preference(active));
      const sent = await generate(cookie);
      assert.equal(sent.messages.length, active ? 3 : 2);
      if (active) assert.deepEqual(JSON.parse(sent.messages[2].content).pantry, [{ name: 'Arroz' }]);
      assert.deepEqual(JSON.parse(sent.messages[1].content), cook);
    }
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM pantry_items').first()).n, 1);
  });
  await scenario('prioridade: ausência/omissão de use_pantry não concede consentimento; inválida rejeitada', async () => {
    const cookie = await session(); await add(cookie);
    assert.equal((await generate(cookie)).messages.length, 2);
    await prefs(cookie, preference(true));
    await prefs(cookie, { version: 1, use_history: false, defaults: {} });
    assert.equal((await generate(cookie)).messages.length, 2);
    const bad = await send('/preferences', { cookie, method: 'PUT', overrides: enabled, body: preference('true') });
    assert.equal(bad.status, 400);
  });
  await scenario('prioridade: visitantes isolados em contexto autorizado e sem sessão bloqueado', async () => {
    const a = await session(), b = await session();
    await prefs(a, preference(true, true)); await prefs(b, preference(true, true));
    await add(a, 'Próprio'); await add(b, 'ALHEIO');
    assert.equal((await meal(a, 'Diário próprio')).status, 201);
    assert.equal((await meal(b, 'DIARIO_ALHEIO')).status, 201);
    const sent = await generate(a), content = sent.messages[2].content;
    assert.equal(content.includes('ALHEIO'), false); assert.match(content, /Próprio/u); assert.match(content, /Diário próprio/u);
    assert.equal((await send('/generate', { body: cook, overrides: enabled })).status, 401);
    assert.equal(await calls(), 1);
  });
  await scenario('prioridade: UTC, empate, sem data e inválida por HTTP; teto compartilhado', async () => {
    const cookie = await session(); await prefs(cookie, preference(true, true));
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    await add(cookie, 'Sem data'); await add(cookie, 'B', today); await add(cookie, 'A', today); await add(cookie, 'Ontem', yesterday);
    const invalid = await send('/pantry', { cookie, overrides: enabled, body: { version: 1, name: 'Inválido', expires_at: '2026-02-30' } });
    assert.equal(invalid.status, 400);
    for (let i = 0; i < 4; i++) assert.equal((await meal(cookie, 'Refeição ' + i)).status, 201);
    const content = (await generate(cookie)).messages[2].content, parsed = JSON.parse(content);
    assert.deepEqual(parsed.pantry.map(x => x.name), ['Ontem', 'A', 'B', 'Sem data']);
    assert.ok([...content].length <= 1200);
    assert.ok([...JSON.stringify(parsed.meals)].length <= 400);
    assert.ok([...JSON.stringify(parsed.pantry)].length <= 400);
  });
  await scenario('prioridade: ready sem despensa, compare sem nenhuma leitura e flag desativada', async () => {
    const cookie = await session(); await prefs(cookie, preference(true, true)); await add(cookie, 'ESTOQUE_NAO_ENVIAR');
    assert.equal((await meal(cookie, 'Meu diário')).status, 201);
    let sent = await generate(cookie, { body: { mode: 'ready', meal: 'jantar', people: 2 } });
    assert.equal(JSON.parse(sent.messages[2].content).context_type, 'meal_history');
    assert.equal(JSON.stringify(sent).includes('ESTOQUE_NAO_ENVIAR'), false);
    sent = await generate(cookie, { body: { ...cook, mode: 'compare' }, headers: { 'X-Test-No-History-Reads': 'true' } });
    assert.equal(sent.messages.length, 2);
    sent = await generate(cookie, { overrides: { ...enabled, PANTRY_ENABLED: 'false' } });
    assert.equal(JSON.parse(sent.messages[2].content).context_type, 'meal_history');
  });
  await scenario('prioridade: despensa vazia gera normalmente; only_available mantém lista explícita', async () => {
    const cookie = await session(); await prefs(cookie, preference(true));
    assert.equal((await generate(cookie)).messages.length, 2);
    await add(cookie, 'Arroz'); await add(cookie, 'Feijão', '2026-01-01');
    const input = { ...cook, ingredient_policy: 'only_available', ingredients: ['ARROZ'] };
    const sent = await generate(cookie, { body: input });
    assert.deepEqual(JSON.parse(sent.messages[1].content), input);
    assert.deepEqual(JSON.parse(sent.messages[2].content).pantry, [{ name: 'Arroz' }]);
  });
  await scenario('prioridade: edição/exclusão aparece no próximo envio; sem fabricar data', async () => {
    const cookie = await session(); await prefs(cookie, preference(true)); const id = await add(cookie, 'Arroz', '2026-09-12');
    assert.equal(JSON.parse((await generate(cookie)).messages[2].content).pantry[0].expires_at, '2026-09-12');
    assert.equal((await send('/pantry/' + id, { cookie, method: 'PUT', overrides: enabled, body: { version: 1, name: 'Arroz', revision: 1 } })).status, 200);
    assert.deepEqual(JSON.parse((await generate(cookie)).messages[2].content).pantry, [{ name: 'Arroz' }]);
    assert.equal((await send('/pantry/' + id, { cookie, method: 'DELETE', overrides: enabled, body: { version: 1, revision: 2 } })).status, 200);
    assert.equal((await generate(cookie)).messages.length, 2);
  });
  await scenario('prioridade: replay não consulta contexto nem chama IA; plano não armazena despensa', async () => {
    const cookie = await session(); await prefs(cookie, preference(true)); await add(cookie, 'ESTOQUE_PRIVADO');
    const key = crypto.randomUUID(); await generate(cookie, { key });
    await prefs(cookie, preference(false));
    const replay = await send('/generate', { cookie, body: cook, key, overrides: enabled, headers: { 'X-Test-No-History-Reads': 'true' } });
    assert.equal(replay.status, 409); assert.equal(await calls(), 1);
    const plan = (await db.prepare('SELECT data_json FROM plans').first()).data_json;
    assert.equal(plan.includes('ESTOQUE_PRIVADO'), false); assert.equal(plan.includes('meal_context'), false);
  });
}
