// Exercita a rota e o serviço completos no workerd/D1 descartável, sem YouTube real.
import assert from 'node:assert/strict';
import { VIDEO_NOTICE } from '../src/contracts/video-request.js';

export async function checkVideoRuntime({ db, send, session, scenario, calls, policy }) {
  await db.prepare('CREATE TABLE test_video_calls(query TEXT NOT NULL)').run();
  const tables = ['video_cache', 'video_claims', 'video_usage_reservations', 'video_usage_buckets', 'video_project_blocks', 'test_video_calls'];
  const count = async table => (await db.prepare('SELECT count(*) n FROM ' + table).first()).n;
  const searches = () => count('test_video_calls');
  const videoPolicy = { visitorDay: 20, visitorMinute: 20, networkDay: 40, networkMinute: 40,
    globalDay: 60, globalMinute: 60, projectDay: 100, otherDay: 20, marginDay: 20 };
  // Números de cenário, sem definição de quota de publicação. Relógio estável
  // avança poucos minutos para não coincidir com o limite de uma janela.
  let now;
  const check = (name, fn) => scenario('vídeo: ' + name, async () => {
    now = Math.floor((Date.now() + 120000) / 60000) * 60000 + 15000;
    await db.batch(tables.map(table => db.prepare('DELETE FROM ' + table)));
    await fn();
  });
  const video = (cookie, body, extra = {}) => {
    const { headers, overrides, ...rest } = extra;
    return send('/video', { cookie, body, ...rest,
      overrides: { VIDEO_ENABLED: 'true', VIDEO_QUOTA_POLICY_JSON: JSON.stringify(videoPolicy),
        YOUTUBE_API_KEY: 'YOUTUBE_API_KEY', AI_ENABLED: 'false', GROQ_API_KEY: '', ...overrides },
      headers: { 'X-Test-Video-Time': String(now), ...headers } });
  };
  const choose = (id, side = 'cook', suggestion_index = 0) => ({ version: 1, plan_id: id, side, suggestion_index });
  const makePlan = async (cookie, mode = 'cook', provider) => {
    const key = crypto.randomUUID();
    const body = { mode, meal: 'jantar', people: 2, ...(mode !== 'ready'
      ? { time_minutes: 30, ingredient_policy: 'suggest', ingredients: [] } : {}) };
    const extra = { cookie, body, key, ...(provider ? { headers: { 'X-Test-Provider': provider } } : {}) };
    const response = await send('/generate', extra); assert.equal(response.status, 200);
    const replay = await send('/generate', extra); assert.equal(replay.status, 409);
    return (await replay.json()).replay.plan.id;
  };
  const result = async (response, expected) => {
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
    const body = await response.json(), data = body.data;
    assert.equal(data.status, expected); assert.deepEqual(data.notice, VIDEO_NOTICE);
    assert.ok(data.search.query); assert.equal(new URL(data.search.url).origin, 'https://www.youtube.com');
    assert.equal(new URL(data.search.url).searchParams.get('search_query'), data.search.query);
    assert.equal(Boolean(data.video), expected === 'found');
    for (const forbidden of ['reason', 'source', 'quotaReserved', 'YOUTUBE_API_KEY', 'SESSION_SECRET', 'failed_generation']) {
      assert.equal(JSON.stringify(body).includes(forbidden), false);
    }
    return data;
  };

  for (const mode of ['cook', 'ready', 'compare']) await check(mode + ': sucesso independente da IA e histórico intacto', async () => {
    const cookie = await session(), id = await makePlan(cookie, mode), side = mode === 'ready' ? 'ready' : 'cook';
    const snapshot = JSON.stringify((await db.prepare('SELECT * FROM plans').all()).results);
    const generationCalls = await calls();
    const data = await result(await video(cookie, choose(id, side)), 'found');
    assert.equal(await searches(), 1); assert.equal(await calls(), generationCalls);
    assert.equal((await db.prepare('SELECT query FROM test_video_calls').first()).query, data.search.query);
    assert.equal(JSON.stringify((await db.prepare('SELECT * FROM plans').all()).results), snapshot);
    assert.equal(await count('meal_logs'), 0);
    assert.equal((await db.prepare("SELECT count(*) n FROM usage_reservations WHERE operation IN ('generation','vision')").first()).n, 1);
  });
  await check('cache entre visitantes sem nova reserva; flag desligada não entrega cache', async () => {
    const a = await session(), aid = await makePlan(a), b = await session(), bid = await makePlan(b);
    await result(await video(a, choose(aid)), 'found');
    const reservations = await count('video_usage_reservations');
    await result(await video(b, choose(bid), { overrides: { YOUTUBE_API_KEY: '', VIDEO_QUOTA_POLICY_JSON: '{}' } }), 'found');
    assert.equal(await searches(), 1); assert.equal(await count('video_usage_reservations'), reservations);
    await result(await video(b, choose(bid), { overrides: { VIDEO_ENABLED: 'false' }, headers: { 'X-Test-Video-Db': 'cache' } }), 'disabled');
    assert.equal(await searches(), 1);
  });
  await check('ausência válida reaproveitada e expiração permite nova ação', async () => {
    const cookie = await session(), id = await makePlan(cookie);
    await result(await video(cookie, choose(id), { headers: { 'X-Test-Video': 'empty' } }), 'not_found');
    await result(await video(cookie, choose(id)), 'not_found'); assert.equal(await searches(), 1);
    now += 3600000;
    await result(await video(cookie, choose(id)), 'found'); assert.equal(await searches(), 2);
  });
  await check('seis contadores e última vaga global são atômicos sob concorrência', async () => {
    const a = await session(), aid = await makePlan(a), b = await session(), bid = await makePlan(b, 'ready');
    const overrides = { VIDEO_QUOTA_POLICY_JSON: JSON.stringify({ ...videoPolicy, globalDay: 1, globalMinute: 1 }) };
    const responses = await Promise.all([video(a, choose(aid), { overrides }), video(b, choose(bid, 'ready'), { overrides, ip: '198.51.100.9' })]);
    const statuses = [];
    for (const response of responses) { assert.equal(response.status, 200); statuses.push((await response.json()).data.status); }
    assert.deepEqual(statuses.sort(), ['found', 'unavailable']); assert.equal(await searches(), 1);
    assert.equal(await count('video_usage_reservations'), 1); assert.equal(await count('video_usage_buckets'), 6);
  });
  await check('oito pedidos concorrentes pelo título fazem uma busca; cache não gasta cota', async () => {
    const cookie = await session(), id = await makePlan(cookie);
    const responses = await Promise.all(Array.from({ length: 8 }, () => video(cookie, choose(id), { headers: { 'X-Test-Video': 'slow' } })));
    for (const response of responses) assert.equal(response.status, 200);
    assert.equal(await searches(), 1); assert.equal(await count('video_usage_reservations'), 1);
    await result(await video(cookie, choose(id)), 'found'); assert.equal(await searches(), 1);
  });
  await check('esgotamento local não impede cache e não retorna 502', async () => {
    const cookie = await session(), a = await makePlan(cookie), b = await makePlan(cookie, 'ready');
    const overrides = { VIDEO_QUOTA_POLICY_JSON: JSON.stringify({ ...videoPolicy, globalDay: 1, globalMinute: 1 }) };
    await result(await video(cookie, choose(a), { overrides }), 'found');
    await result(await video(cookie, choose(b, 'ready'), { overrides }), 'unavailable');
    await result(await video(cookie, choose(a), { overrides }), 'found'); assert.equal(await searches(), 1);
  });
  for (const kind of ['invalid', 'extra', 'large', 'network', '403', '429', '503', 'timeout']) {
    await check(kind + ': resposta tranquila sem retry nem cache negativo', async () => {
      const cookie = await session(), id = await makePlan(cookie), key = crypto.randomUUID();
      await result(await video(cookie, choose(id), { key, headers: { 'X-Test-Video': kind } }), 'unavailable');
      now += 61000;
      await result(await video(cookie, choose(id), { key }), 'unavailable');
      assert.equal(await searches(), 1); assert.equal(await count('video_cache'), 0);
      assert.equal(await count('video_usage_reservations'), 1);
    });
  }
  await check('quotaExceeded suspende novas buscas do projeto', async () => {
    const cookie = await session(), a = await makePlan(cookie), b = await makePlan(cookie, 'ready');
    await result(await video(cookie, choose(a), { headers: { 'X-Test-Video': 'quota' } }), 'unavailable');
    await result(await video(cookie, choose(b, 'ready')), 'unavailable');
    assert.equal(await searches(), 1); assert.equal(await count('video_project_blocks'), 1);
  });
  await check('falha de cache/política/chave preserva alternativa e não inicia busca', async () => {
    const cookie = await session(), id = await makePlan(cookie);
    await result(await video(cookie, choose(id), { headers: { 'X-Test-Video-Db': 'cache' } }), 'unavailable');
    await result(await video(cookie, choose(id), { overrides: { VIDEO_QUOTA_POLICY_JSON: '{}' } }), 'unavailable');
    await result(await video(cookie, choose(id), { overrides: { YOUTUBE_API_KEY: '' } }), 'unavailable');
    assert.equal(await searches(), 0);
  });
  await check('falha ao guardar cache não repete nem anuncia vídeo persistido', async () => {
    const cookie = await session(), id = await makePlan(cookie), key = crypto.randomUUID();
    await db.prepare("CREATE TRIGGER video_cache_abort BEFORE INSERT ON video_cache BEGIN SELECT RAISE(ABORT, 'Falha privada.'); END").run();
    try { await result(await video(cookie, choose(id), { key }), 'unavailable'); }
    finally { await db.prepare('DROP TRIGGER video_cache_abort').run(); }
    now += 61000; await result(await video(cookie, choose(id), { key }), 'unavailable');
    assert.equal(await searches(), 1); assert.equal(await count('video_cache'), 0);
  });
  await check('sessão real, origem, dono, chave, índice e expiração obrigatórios mesmo com flag false', async () => {
    const a = await session(), id = await makePlan(a), b = await session();
    for (const flag of ['true', 'false']) {
      const overrides = { VIDEO_ENABLED: flag };
      for (const [cookie, body, extra, expected] of [
        ['', choose(id), {}, 401], [b, choose(id), {}, 400],
        [a, choose(id), { headers: { Origin: 'https://outro.test' } }, 403],
        [a, choose(id), { key: '' }, 400], [a, choose(id, 'cook', 2), {}, 400],
        [a, { ...choose(id), title: 'Prato arbitrário' }, {}, 400],
      ]) {
        const response = await video(cookie, body, { ...extra, overrides });
        assert.equal(response.status, expected); assert.equal((await response.json()).data, undefined);
      }
    }
    assert.equal(await searches(), 0);
    await db.prepare('UPDATE plans SET expires_at = ?1 WHERE id = ?2').bind(new Date(now).toISOString(), id).run();
    assert.equal((await video(a, choose(id))).status, 400);
  });
  await check('ingress esgotado recusa acesso inclusive com flag desligada', async () => {
    const cookie = await session(), id = await makePlan(cookie);
    const overrides = { VIDEO_ENABLED: 'false', QUOTA_POLICY_JSON: JSON.stringify({ ...policy,
      ingress: { ...policy.ingress, globalDay: 1, globalMinute: 1 } }) };
    const response = await video(cookie, choose(id), { overrides });
    assert.equal(response.status, 429); assert.equal((await response.json()).code, 'LIMIT_REACHED');
    assert.equal(await searches(), 0);
  });
  await check('erro de leitura do plano não revela título nem consulta inventada', async () => {
    const cookie = await session(), id = await makePlan(cookie);
    const response = await video(cookie, choose(id), { headers: { 'X-Test-Video-Db': 'plan' } });
    assert.equal(response.status, 503); assert.equal((await response.json()).data, undefined); assert.equal(await searches(), 0);
  });
  await check('sessão expirada e IP confiável ausente não autorizam consulta', async () => {
    const cookie = await session(), id = await makePlan(cookie);
    const withoutIp = await video(cookie, choose(id), { ip: '' });
    assert.equal(withoutIp.status, 503); assert.equal((await withoutIp.json()).data, undefined);
    const old = new Date(now - 31 * 86400000).toISOString().slice(0, 19).replace('T', ' ');
    await db.prepare('UPDATE visitors SET created_at = ?1').bind(old).run();
    const expired = await video(cookie, choose(id));
    assert.equal(expired.status, 401); assert.equal((await expired.json()).data, undefined);
    assert.equal(await searches(), 0);
  });
  await check('compare recusado não oferece tutorial; lado sugerido permanece disponível', async () => {
    const cookie = await session(), id = await makePlan(cookie, 'compare', 'compare-cook-none');
    const refused = await video(cookie, choose(id));
    assert.equal(refused.status, 400); assert.equal((await refused.json()).data, undefined);
    await result(await video(cookie, choose(id, 'ready')), 'found'); assert.equal(await searches(), 1);
  });
}
