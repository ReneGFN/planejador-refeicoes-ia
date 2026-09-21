import test from 'node:test';
import assert from 'node:assert/strict';
import { getSupportVideo } from '../src/video/service.js';
import { readVideoCache, pruneVideoData, storeVideoResult, VIDEO_CACHE_TTL } from '../src/video/cache.js';
import { reserveVideoSearch, videoWindows } from '../src/security/video-quota.js';
import { videoDb } from './helpers/video-db.js';

// Números apenas de testes, não aprovação de política. Pseudônimos não são segredos.
const policy = { visitorDay: 20, visitorMinute: 10, networkDay: 40, networkMinute: 20,
  globalDay: 80, globalMinute: 30, projectDay: 100, otherDay: 10, marginDay: 10 };
const instant = Date.parse('2026-09-12T15:00:00Z');
const candidate = title => ({ id: { kind: 'youtube#video', videoId: 'v'.repeat(11) },
  snippet: { title: 'Como fazer ' + title, channelId: 'UC' + 'c'.repeat(22), channelTitle: 'Canal de teste' } });

function setup(t) {
  const DB = videoDb(); t.after(() => DB.sqlite.close());
  const state = { now: instant, calls: 0, response: title => Response.json({ items: [candidate(title)] }) };
  const ctx = () => ({ visitorId: crypto.randomUUID(), requestKey: crypto.randomUUID(),
    networkHash: 'a'.repeat(64), networkDay: videoWindows(state.now).day,
    expiresAt: new Date(instant + 29 * 86400000).toISOString() });
  const options = { DB, policyJson: JSON.stringify(policy), apiKey: 'YOUTUBE_API_KEY', clock: () => state.now,
    fetchImpl: async (url, init) => {
      state.calls++;
      assert.equal(init.headers['X-Goog-Api-Key'], 'YOUTUBE_API_KEY');
      assert.equal(DB.sqlite.prepare("SELECT count(*) n FROM video_usage_reservations WHERE status = 'reserved'").get().n > 0, true);
      const request = new URL(url);
      assert.equal(request.searchParams.has('key'), false);
      return state.response(request.searchParams.get('q'));
    } };
  const get = (title = 'arroz', context = ctx(), extra = {}) => getSupportVideo({ title }, context, { ...options, ...extra });
  return { DB, state, ctx, options, get };
}

test('vídeo serviço: cache global reutilizado por outra pessoa sem quota/API e sem identidade na linha', async t => {
  const { DB, state, get, ctx } = setup(t);
  const first = await get('  ARROZ  ');
  assert.equal(first.source, 'provider'); assert.equal(first.result.status, 'found');
  const before = DB.sqlite.prepare('SELECT sum(requests) n FROM video_usage_buckets').get().n;
  const next = await get('arroz', ctx(), { policyJson: undefined, apiKey: undefined });
  assert.equal(next.source, 'cache'); assert.equal(next.query, 'arroz');
  assert.equal(state.calls, 1); assert.equal(DB.sqlite.prepare('SELECT sum(requests) n FROM video_usage_buckets').get().n, before);
  const row = DB.sqlite.prepare('SELECT * FROM video_cache').get();
  assert.deepEqual(Object.keys(row), ['title_key', 'status', 'video_id', 'video_title', 'channel_id', 'channel_title', 'fetched_at', 'expires_at']);
  assert.equal(row.expires_at - row.fetched_at, VIDEO_CACHE_TTL.found);
});

test('vídeo serviço: ausência válida é cache negativo distinto de nunca buscado', async t => {
  const { DB, state, get } = setup(t);
  assert.equal(await readVideoCache(DB, 'arroz', state.now), null);
  state.response = () => Response.json({ items: [] });
  assert.equal((await get()).result.status, 'not_found');
  const next = await get();
  assert.equal(next.source, 'cache'); assert.deepEqual(next.result, { version: 1, status: 'not_found', video: null });
  assert.equal(state.calls, 1);
  const row = DB.sqlite.prepare('SELECT * FROM video_cache').get();
  assert.equal(row.expires_at - row.fetched_at, VIDEO_CACHE_TTL.not_found);
});

for (const negative of [false, true]) test(`vídeo serviço: expiração ${negative ? 'negativa' : 'positiva'} permite nova ação explícita`, async t => {
  const { state, get } = setup(t);
  if (negative) state.response = () => Response.json({ items: [] });
  await get(); state.now += VIDEO_CACHE_TTL[negative ? 'not_found' : 'found'];
  assert.equal((await get()).source, 'provider'); assert.equal(state.calls, 2);
});

test('vídeo serviço: erro de leitura ou limpeza de cache não vira permissão de busca', async t => {
  const { DB, state, get } = setup(t);
  for (const fragment of ['SELECT title_key, status', 'DELETE FROM video_cache']) {
    DB.before = sql => { if (sql.includes(fragment)) throw new Error('Detalhe interno não deve sair.'); };
    const result = await get(); assert.equal(result.reason, 'cache_error');
    assert.equal(JSON.stringify(result).includes('Detalhe'), false);
  }
  assert.equal(state.calls, 0);
});

test('vídeo serviço: cache corrompido não é entregue nem dispara busca', async t => {
  const { DB, state, get } = setup(t);
  await get(); DB.sqlite.prepare("UPDATE video_cache SET video_id = 'inválido'").run();
  const result = await get(); assert.equal(result.reason, 'cache_error'); assert.equal(state.calls, 1);
});

test('vídeo serviço: teto global mantém alternativa e continua permitindo acertos de cache', async t => {
  const { state, get } = setup(t), extra = { policyJson: JSON.stringify({ ...policy, globalDay: 1, globalMinute: 1 }) };
  assert.equal((await get('arroz', undefined, extra)).source, 'provider');
  const exhausted = await get('feijão', undefined, extra);
  assert.equal(exhausted.reason, 'quota_exceeded'); assert.equal(exhausted.query, 'feijão'); assert.equal(exhausted.result, null);
  assert.equal((await get('arroz', undefined, extra)).source, 'cache'); assert.equal(state.calls, 1);
});

test('vídeo serviço: sem política configurada não consulta o provedor', async t => {
  const { state, get } = setup(t);
  assert.equal((await get('arroz', undefined, { policyJson: undefined })).reason, 'config_error');
  assert.equal(state.calls, 0);
});

test('vídeo serviço: disputa pelo mesmo título gera uma única chamada externa', async t => {
  const { state, get } = setup(t);
  let release, started;
  const began = new Promise(resolve => { started = resolve; });
  state.response = async title => { started(); await new Promise(resolve => { release = resolve; }); return Response.json({ items: [candidate(title)] }); };
  const first = get(); await began;
  const other = await get(); assert.equal(other.reason, 'busy'); assert.equal(state.calls, 1);
  release(); assert.equal((await first).source, 'provider');
  assert.equal((await get()).source, 'cache'); assert.equal(state.calls, 1);
});

test('vídeo serviço: rechecagem atômica encontra cache criado depois da leitura inicial', async t => {
  const { DB, state, get } = setup(t);
  let inserted = false;
  // Outro pedido publica antes do batch, depois da leitura inicial deste pedido.
  const original = DB.batch.bind(DB);
  DB.batch = async statements => {
    if (statements.length === 2 && !inserted) {
      inserted = true;
      DB.sqlite.prepare("INSERT INTO video_cache VALUES ('arroz', 'not_found', NULL, NULL, NULL, NULL, ?, ?)").run(state.now, state.now + 3600000);
    }
    return original(statements);
  };
  assert.equal((await get()).source, 'cache'); assert.equal(state.calls, 0);
  assert.equal(DB.sqlite.prepare('SELECT count(*) n FROM video_usage_reservations').get().n, 0);
});

test('vídeo serviço: falha de gravação não devolve cota nem permite repetir a tentativa', async t => {
  const { DB, state, get, ctx } = setup(t), context = ctx();
  DB.before = sql => { if (sql.startsWith('INSERT INTO video_cache')) throw new Error('Falha simulada.'); };
  assert.equal((await get('arroz', context)).reason, 'cache_write_error');
  DB.before = null; state.now += 60001;
  assert.equal((await get('arroz', context)).reason, 'replay'); assert.equal(state.calls, 1);
  assert.equal(DB.sqlite.prepare('SELECT count(*) n FROM video_cache').get().n, 0);
  assert.equal(DB.sqlite.prepare("SELECT requests FROM video_usage_buckets WHERE scope = 'global' AND window LIKE 'day:%'").get().requests, 1);
});

test('vídeo serviço: resposta incerta do banco após reservar não autoriza chamada ou nova tentativa', async t => {
  const { DB, state, get, ctx } = setup(t), context = ctx(), original = DB.batch.bind(DB);
  let lost = false;
  DB.batch = async statements => {
    const result = await original(statements);
    if (!lost && statements.length === 2) { lost = true; throw new Error('Confirmação perdida.'); }
    return result;
  };
  assert.equal((await get('arroz', context)).reason, 'reservation_error');
  state.now += 60001;
  assert.equal((await get('arroz', context)).reason, 'replay'); assert.equal(state.calls, 0);
});

for (const [label, response, code] of [
  ['HTTP 503', () => new Response(null, { status: 503 }), 'VIDEO_UNAVAILABLE'],
  ['HTTP 429', () => new Response(null, { status: 429 }), 'VIDEO_RATE_LIMITED'],
  ['JSON inválido', () => new Response('{'), 'VIDEO_INVALID_RESPONSE'],
  ['campo extra', () => Response.json({ items: [], extra: true }), 'VIDEO_INVALID_RESPONSE'],
  ['erro de rede', () => { throw new Error('Detalhe interno.'); }, 'VIDEO_NETWORK_ERROR'],
]) test(`vídeo serviço: ${label} não vira cache negativo nem retry`, async t => {
  const { DB, state, get, ctx } = setup(t), context = ctx(); state.response = response;
  assert.equal((await get('arroz', context)).reason, code);
  state.now += 60001;
  assert.equal((await get('arroz', context)).reason, 'replay'); assert.equal(state.calls, 1);
  assert.equal(DB.sqlite.prepare('SELECT count(*) n FROM video_cache').get().n, 0);
});

test('vídeo serviço: timeout não cria ausência nem repete busca', async t => {
  const { DB, state, get } = setup(t); state.response = () => new Promise(() => {});
  assert.equal((await get('arroz', undefined, { timeoutMs: 5 })).reason, 'VIDEO_TIMEOUT');
  assert.equal(state.calls, 1); assert.equal(DB.sqlite.prepare('SELECT count(*) n FROM video_cache').get().n, 0);
});

test('vídeo serviço: quotaExceeded bloqueia projeto até reset PT, mas não cache', async t => {
  const { DB, state, get } = setup(t); await get('arroz');
  state.response = () => Response.json({ error: { code: 403, message: 'Quota esgotada.',
    errors: [{ domain: 'youtube.quota', reason: 'quotaExceeded', message: 'Quota esgotada.' }] } }, { status: 403 });
  assert.equal((await get('feijão')).reason, 'VIDEO_QUOTA_EXCEEDED');
  assert.equal((await get('sopa')).reason, 'project_blocked');
  assert.equal((await get('arroz')).source, 'cache'); assert.equal(state.calls, 2);
  assert.equal(DB.sqlite.prepare('SELECT expires_at FROM video_project_blocks').get().expires_at, videoWindows(state.now).resetAt);
  state.now = videoWindows(state.now).resetAt;
  state.response = () => Response.json({ items: [] });
  assert.equal((await get('sopa')).source, 'provider'); assert.equal(state.calls, 3);
});

for (const change of ['day', 'minute', 'margin', 'lease']) test(`vídeo serviço: ${change} impede envio com reserva imprópria`, async t => {
  const { DB, state, get } = setup(t), original = DB.batch.bind(DB);
  if (change === 'margin') state.now = Date.parse('2026-09-13T06:59:55Z');
  DB.batch = async statements => {
    const result = await original(statements);
    if (statements.length === 2) {
      if (change === 'day') state.now = videoWindows(state.now).resetAt;
      if (change === 'minute') state.now += 60000;
      if (change === 'lease') state.now += 50000;
    }
    return result;
  };
  assert.equal((await get()).reason, ['day', 'minute'].includes(change) ? 'send_not_authorized' : 'window_changed');
  assert.equal(state.calls, 0);
});

test('vídeo cache: dono antigo não sobrescreve resultado após perder a trava', async t => {
  const { DB, state, ctx } = setup(t);
  const first = await reserveVideoSearch(DB, 'arroz', ctx(), policy, state.now);
  state.now += 60001;
  await reserveVideoSearch(DB, 'arroz', ctx(), policy, state.now);
  await assert.rejects(storeVideoResult(DB, 'arroz', first, { version: 1, status: 'not_found', video: null }, state.now));
  assert.equal(DB.sqlite.prepare('SELECT count(*) n FROM video_cache').get().n, 0);
  assert.equal(DB.sqlite.prepare('SELECT count(*) n FROM video_claims').get().n, 1);
  assert.equal(DB.sqlite.prepare('SELECT status FROM video_usage_reservations WHERE id = ?').get(first.id).status, 'reserved');
});

test('vídeo serviço: bloqueio do projeto surgido após reserva impede envio', async t => {
  const { DB, state, get } = setup(t), batch = DB.batch.bind(DB);
  DB.batch = async statements => {
    const result = await batch(statements);
    if (statements.length === 2) DB.sqlite.prepare('INSERT INTO video_project_blocks VALUES (1, ?)').run(videoWindows(state.now).resetAt);
    return result;
  };
  assert.equal((await get()).reason, 'send_not_authorized'); assert.equal(state.calls, 0);
});

test('vídeo serviço: falha após criar trava reverte toda a reserva', async t => {
  const { DB, state, get } = setup(t);
  DB.before = sql => { if (sql.startsWith('INSERT INTO video_usage_reservations')) throw new Error('Falha de gravação.'); };
  assert.equal((await get()).reason, 'reservation_error'); assert.equal(state.calls, 0);
  for (const table of ['video_claims', 'video_usage_reservations', 'video_usage_buckets']) {
    assert.equal(DB.sqlite.prepare(`SELECT count(*) n FROM ${table}`).get().n, 0);
  }
});

test('vídeo serviço: falha ao confirmar autorização de envio mantém alternativa sem chamar API', async t => {
  const { DB, state, get } = setup(t);
  DB.before = sql => { if (sql.startsWith('SELECT 1 AS allowed')) throw new Error('Falha interna.'); };
  assert.equal((await get()).reason, 'authorization_error'); assert.equal(state.calls, 0);
});

test('vídeo serviço: HTTP 403 não classificado não suspende projeto como quota esgotada', async t => {
  const { DB, state, get } = setup(t);
  state.response = () => Response.json({ error: { code: 403, message: 'Sem acesso.',
    errors: [{ domain: 'global', reason: 'forbidden', message: 'Sem acesso.' }] } }, { status: 403 });
  assert.equal((await get()).reason, 'VIDEO_ACCESS_DENIED');
  assert.equal(DB.sqlite.prepare('SELECT count(*) n FROM video_project_blocks').get().n, 0);
});

test('vídeo serviço: sessão inválida não acessa cache e usa primário na sessão D1 válida', async t => {
  const { DB, state, get, ctx } = setup(t);
  assert.equal((await get('arroz', { ...ctx(), expiresAt: new Date(state.now).toISOString() })).reason, 'context_error');
  assert.equal(DB.trace.length, 0);
  let sessions = 0;
  DB.withSession = constraint => { assert.equal(constraint, 'first-primary'); sessions++; return DB; };
  assert.equal((await get()).source, 'provider'); assert.equal(sessions, 1);
});

test('vídeo cache: limpeza efetiva limitada não toca histórico ou tabelas existentes', async t => {
  const { DB, state, get } = setup(t); await get();
  const existing = ['visitors', 'preferences', 'plans', 'meal_logs', 'usage_buckets', 'usage_reservations'];
  const snapshot = () => existing.map(table => JSON.stringify(DB.sqlite.prepare(`SELECT * FROM ${table}`).all()));
  const before = snapshot();
  const put = DB.sqlite.prepare("INSERT INTO video_cache VALUES (?, 'not_found', NULL, NULL, NULL, NULL, ?, ?)");
  for (let i = 0; i < 105; i++) put.run('prato ' + i, state.now - 3600001, state.now - 1);
  await pruneVideoData(DB, state.now);
  assert.equal(DB.sqlite.prepare('SELECT count(*) n FROM video_cache').get().n, 6);
  await pruneVideoData(DB, state.now);
  assert.equal(DB.sqlite.prepare('SELECT count(*) n FROM video_cache').get().n, 1);
  await pruneVideoData(DB, state.now + 30 * 86400000);
  for (const table of ['video_cache', 'video_claims', 'video_usage_reservations', 'video_usage_buckets', 'video_project_blocks']) {
    assert.equal(DB.sqlite.prepare(`SELECT count(*) n FROM ${table}`).get().n, 0);
  }
  assert.deepEqual(snapshot(), before);
});
