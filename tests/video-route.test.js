import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ContractError } from '../src/contracts/generation.js';
import { validateVideoSelection, videoReply, VIDEO_NOTICE } from '../src/contracts/video-request.js';
import { createVideoHandler } from '../src/http/video.js';
import { onRequestPost } from '../functions/api/video.js';
import { SessionError } from '../src/security/session.js';
import { QuotaError } from '../src/security/quota.js';
import { planDocument } from '../src/history/plans.js';
import { videoDb } from './helpers/video-db.js';
import { videoMockResponse } from './helpers/video-response.js';

const now = Date.parse('2026-09-12T15:15:15Z');
// Política fictícia, não valores escolhidos para publicação.
const policy = { visitorDay: 10, visitorMinute: 10, networkDay: 20, networkMinute: 20,
  globalDay: 30, globalMinute: 30, projectDay: 50, otherDay: 10, marginDay: 10 };
const selection = plan_id => ({ version: 1, plan_id, side: 'cook', suggestion_index: 0 });
const request = (body, headers = {}, url = 'https://video.test/api/video') => new Request(url, {
  method: 'POST', headers: { Origin: 'https://video.test', 'Content-Type': 'application/json',
    'Idempotency-Key': crypto.randomUUID(), ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
function setup(t, mode = 'cook') {
  const DB = videoDb(); t.after(() => DB.sqlite.close());
  const visitor = { visitorId: crypto.randomUUID(), expiresAt: new Date(now + 86400000).toISOString() };
  // Não criamos cookie/credencial: autenticação real é exercitada no runtime.
  DB.sqlite.prepare("INSERT INTO visitors(id, session_token_hash, created_at, last_seen_at) VALUES (?, 'SESSION_SECRET', '2026-09-12 15:00:00', '2026-09-12 15:00:00')").run(visitor.visitorId);
  const recipe = { title: 'Arroz', servings: 2, total_minutes: 20,
    ingredients: [{ name: 'arroz', quantity: 100, unit: 'g' }], steps: ['Prepare o arroz.'] };
  const ready = { title: 'Arroz pronto', servings: 2, description: 'Opção pronta.', search_term: 'arroz pronto' };
  const input = { mode, meal: 'jantar', people: 2, ...(mode !== 'ready'
    ? { time_minutes: 30, ingredient_policy: 'suggest', ingredients: [] } : {}) };
  const output = mode === 'compare' ? { version: 1, mode, cook: { status: 'suggested', suggestions: [recipe] },
    ready: { status: 'suggested', suggestions: [{ ...ready, estimated_price_brl: null }] } }
    : { version: 1, mode, suggestions: [mode === 'cook' ? recipe : ready] };
  const document = planDocument(input, { data: output, metadata: { model: 'openai/gpt-oss-20b',
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2, reasoning_tokens: null }, elapsed_ms: 1 } });
  const id = crypto.randomUUID();
  DB.sqlite.prepare('INSERT INTO plans(id, visitor_id, model, data_json, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, visitor.visitorId, document.metadata.model, JSON.stringify(document), new Date(now).toISOString(), visitor.expiresAt);
  const state = { calls: 0, scenario: 'normal', access: 0, denied: null };
  const options = { clock: () => now, timeoutMs: 10, authorize: async () => {
    state.access++; if (state.denied) throw state.denied; return visitor;
  }, deriveNetwork: async (_, __, day) => { assert.equal(day, '2026-09-12'); return 'a'.repeat(64); },
  fetchImpl: async url => { state.calls++; return videoMockResponse(new URL(url).searchParams.get('q'), state.scenario); } };
  const env = { DB, VIDEO_ENABLED: 'true', VIDEO_QUOTA_POLICY_JSON: JSON.stringify(policy), YOUTUBE_API_KEY: 'YOUTUBE_API_KEY' };
  const handler = createVideoHandler(options);
  const send = (body = selection(id), patch = {}, headers = {}) => handler({ request: request(body, headers), env: { ...env, ...patch } });
  return { DB, visitor, id, state, options, env, handler, send };
}

test('vídeo HTTP: seleção fechada não aceita título, dono ou preferências do cliente', () => {
  const valid = selection(crypto.randomUUID()); assert.deepEqual(validateVideoSelection(valid), valid);
  for (const body of [null, [], {}, { ...valid, title: 'sopa' }, { ...valid, visitor_id: crypto.randomUUID() },
    { ...valid, version: 2 }, { ...valid, plan_id: 'x' }, { ...valid, side: 'compare' },
    { ...valid, suggestion_index: -1 }, { ...valid, suggestion_index: 3 }, { ...valid, suggestion_index: 0.5 }]) {
    assert.throws(() => validateVideoSelection(body), ContractError);
  }
});

test('vídeo HTTP: aviso exato, busca sempre presente e saída externa validada', () => {
  assert.equal(VIDEO_NOTICE.title, 'Vídeo de apoio');
  assert.equal(VIDEO_NOTICE.text, 'Este tutorial pode usar ingredientes, quantidades, equipamentos e tempos diferentes. Use-o para entender as técnicas; para manter as escolhas feitas no aplicativo, siga a receita escrita.');
  for (const data of [videoReply('Arroz'), videoReply('Arroz', null, { disabled: true }),
    videoReply('Arroz', { version: 1, status: 'not_found', video: null })]) {
    assert.equal(data.search.query, 'arroz'); assert.equal(new URL(data.search.url).searchParams.get('search_query'), 'arroz');
    assert.deepEqual(data.notice, VIDEO_NOTICE); assert.equal(data.video, null);
    assert.equal(data.message, 'Você pode buscar um tutorial no YouTube. Sua receita continua disponível.');
  }
  assert.throws(() => videoReply('Arroz', { version: 1, status: 'not_found', video: null, raw: 'extra' }), ContractError);
});

for (const mode of ['cook', 'ready', 'compare']) test(`vídeo HTTP ${mode}: extrai título salvo sem escrever histórico ou gastar IA`, async t => {
  const h = setup(t, mode), body = { ...selection(h.id), side: mode === 'ready' ? 'ready' : 'cook' };
  const before = JSON.stringify(h.DB.sqlite.prepare('SELECT * FROM plans').all());
  const response = await h.send(body), data = (await response.json()).data;
  assert.equal(response.status, 200); assert.equal(data.status, 'found');
  assert.equal(data.search.query, mode === 'ready' ? 'arroz pronto' : 'arroz'); assert.equal(h.state.calls, 1);
  assert.deepEqual(data.notice, VIDEO_NOTICE); assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(JSON.stringify(h.DB.sqlite.prepare('SELECT * FROM plans').all()), before);
  assert.equal(h.DB.sqlite.prepare('SELECT count(*) n FROM usage_reservations').get().n, 0);
  assert.equal(h.DB.sqlite.prepare('SELECT count(*) n FROM meal_logs').get().n, 0);
});

test('vídeo HTTP: flag desligada exige acesso e seleção mas não lê cache mesmo se houver vídeo', async t => {
  const h = setup(t); await h.send(); const calls = h.state.calls;
  h.DB.before = sql => { if (sql.includes('video_')) throw new Error('Não deveria acessar tabelas de vídeo.'); };
  for (const value of ['false', undefined, true, 'TRUE']) {
    const response = await h.send(selection(h.id), { VIDEO_ENABLED: value }), data = (await response.json()).data;
    assert.equal(response.status, 200); assert.equal(data.status, 'disabled'); assert.equal(data.video, null); assert.ok(data.search.url);
  }
  assert.equal(h.state.calls, calls); assert.equal(h.state.access, 5);
});

test('vídeo HTTP: outro dono, plano expirado, lado errado e índice inexistente não revelam consulta', async t => {
  const h = setup(t);
  for (const body of [{ ...selection(h.id), side: 'ready' }, { ...selection(h.id), suggestion_index: 2 }, selection(crypto.randomUUID())]) {
    const response = await h.send(body); assert.equal(response.status, 400); assert.equal((await response.json()).data, undefined);
  }
  const other = createVideoHandler({ ...h.options, authorize: async () => ({ ...h.visitor, visitorId: crypto.randomUUID() }) });
  assert.equal((await other({ env: h.env, request: request(selection(h.id)) })).status, 400);
  h.DB.sqlite.prepare('UPDATE plans SET expires_at = ?').run(new Date(now).toISOString());
  assert.equal((await h.send()).status, 400); assert.equal(h.state.calls, 0);
});

test('vídeo HTTP: compare sem alternativa no lado escolhido não busca tutorial', async t => {
  const h = setup(t, 'compare');
  const row = h.DB.sqlite.prepare('SELECT data_json FROM plans').get(), document = JSON.parse(row.data_json);
  document.output.cook = { status: 'not_suggested', reason: 'Não foi encontrada uma opção compatível.' };
  h.DB.sqlite.prepare('UPDATE plans SET data_json = ?').run(JSON.stringify(document));
  assert.equal((await h.send()).status, 400);
  const response = await h.send({ ...selection(h.id), side: 'ready' });
  assert.equal(response.status, 200); assert.equal((await response.json()).data.status, 'found'); assert.equal(h.state.calls, 1);
});

test('vídeo HTTP: sessão/ingress/origem não são convertidos em acesso autorizado', async t => {
  const h = setup(t);
  for (const [error, status] of [[new SessionError('SESSION_REQUIRED'), 401], [new QuotaError('LIMIT_REACHED'), 429]]) {
    h.state.denied = error;
    const response = await h.send(selection(h.id), { VIDEO_ENABLED: 'false' }); assert.equal(response.status, status);
    assert.equal((await response.json()).data, undefined);
  }
  const previous = h.state.access;
  assert.equal((await h.send(selection(h.id), {}, { Origin: 'https://outro.test' })).status, 403);
  assert.equal(h.state.access, previous); assert.equal(h.state.calls, 0);
});

test('vídeo HTTP: formato, tamanho, chave, método e query são rejeitados antes de vídeo', async t => {
  const h = setup(t);
  for (const [body, headers, expected] of [[selection(h.id), { 'Content-Type': 'text/plain' }, 415],
    [' '.repeat(513), {}, 413], ['{', {}, 400], [selection(h.id), { 'Idempotency-Key': '' }, 400]]) {
    assert.equal((await h.send(body, {}, headers)).status, expected);
  }
  assert.equal((await h.handler({ env: h.env, request: request(selection(h.id), {}, 'https://video.test/api/video?x=1') })).status, 400);
  assert.equal((await h.handler({ env: h.env, request: new Request('https://video.test/api/video') })).status, 403);
  assert.equal(h.state.calls, 0);
});

test('vídeo HTTP: seleção inválida não culpa a pessoa nem revela o campo interno', async t => {
  const h = setup(t), response = await h.send({ version: 1 });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { code: 'INVALID_INPUT',
    message: 'Não foi possível preparar o apoio em vídeo agora. Sua receita continua disponível.' });
});

for (const scenario of ['empty', 'invalid', 'extra', 'large', 'quota', '403', '429', '503', 'network', 'timeout']) {
  test(`vídeo HTTP: ${scenario} devolve alternativa 200 sem diagnóstico privado ou retry`, async t => {
    const h = setup(t); h.state.scenario = scenario;
    const response = await h.send(), body = await response.json();
    assert.equal(response.status, 200); assert.equal(body.data.status, scenario === 'empty' ? 'not_found' : 'unavailable');
    assert.equal(body.data.video, null); assert.ok(body.data.search.url); assert.deepEqual(body.data.notice, VIDEO_NOTICE);
    assert.equal(h.state.calls, 1);
    for (const forbidden of ['reason', 'source', 'quotaReserved', 'failed_generation', 'YOUTUBE_API_KEY']) {
      assert.equal(JSON.stringify(body).includes(forbidden), false);
    }
  });
}

test('vídeo HTTP: erro de cache mantém consulta 200; erro do plano não inventa consulta', async t => {
  const h = setup(t);
  h.DB.before = sql => { if (sql.includes('video_cache')) throw new Error('SQL privado.'); };
  assert.equal((await h.send()).status, 200); assert.equal(h.state.calls, 0);
  h.DB.before = sql => { if (sql.includes('FROM plans')) throw new Error('SQL privado.'); };
  const response = await h.send(); assert.equal(response.status, 503);
  assert.equal(JSON.stringify(await response.json()).includes('SQL'), false);
});

test('vídeo HTTP: rota pública não aceita overrides de teste e configuração mantém todos os ambientes desligados', async () => {
  const response = await onRequestPost({ env: { SESSIONS_ENABLED: 'false' },
    request: request(selection(crypto.randomUUID()), { 'X-Test-Env': JSON.stringify({ VIDEO_ENABLED: 'true', SESSIONS_ENABLED: 'true' }) }) });
  assert.equal(response.status, 503);
  const source = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.equal((source.match(/"VIDEO_ENABLED": "false"/gu) ?? []).length, 3);
  assert.equal((source.match(/"VIDEO_QUOTA_POLICY_JSON": "\{\}"/gu) ?? []).length, 3);
});
