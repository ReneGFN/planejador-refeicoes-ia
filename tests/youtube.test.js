import test from 'node:test';
import assert from 'node:assert/strict';
import { searchYouTubeVideo as search, VideoProviderError } from '../src/providers/youtube.js';
import { VIDEO_LIMITS } from '../src/contracts/video.js';

// Só o NOME da variável é usado como marcador no transporte simulado, não uma
// chave/token de teste. Nunca ler credenciais do ambiente nem acessar a rede.
const options = fetchImpl => ({ apiKey: 'YOUTUBE_API_KEY', fetchImpl });
const input = { title: '  RISOTO de Frango ' };
const body = () => ({ items: [{ id: { kind: 'youtube#video', videoId: 'v'.repeat(11) },
  snippet: { title: 'Risoto de frango fácil', channelId: 'UC' + 'c'.repeat(22), channelTitle: 'Canal de demonstração' } }] });
const rejection = reason => ({ error: { code: 403, message: 'diagnóstico privado',
  errors: [{ domain: 'youtube.quota', reason, message: 'diagnóstico privado' }] } });

test('YouTube: uma busca, somente nome do prato, filtros fixos e credencial fora da URL', async () => {
  let calls = 0;
  const result = await search(input, options(async (address, init) => {
    calls++;
    const url = new URL(address);
    assert.equal(url.origin + url.pathname, 'https://www.googleapis.com/youtube/v3/search');
    assert.deepEqual(Object.fromEntries(url.searchParams), { part: 'snippet', type: 'video',
      videoEmbeddable: 'true', videoSyndicated: 'true', relevanceLanguage: 'pt', regionCode: 'BR',
      safeSearch: 'strict', order: 'relevance', maxResults: '5',
      fields: 'items(id(kind,videoId),snippet(title,channelId,channelTitle))', q: 'risoto de frango' });
    assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'error');
    assert.equal(init.body, undefined); assert.ok(init.signal instanceof AbortSignal);
    assert.deepEqual(init.headers, { Accept: 'application/json', 'X-Goog-Api-Key': 'YOUTUBE_API_KEY' });
    assert.equal(url.searchParams.has('key'), false);
    return Response.json(body());
  }));
  assert.equal(calls, 1); assert.equal(result.status, 'found');
  assert.deepEqual(Object.keys(result), ['version', 'status', 'video']);
});

test('YouTube: lista vazia e candidato sem correspondência não são erros ou nova busca', async () => {
  for (const raw of [{ items: [] }, { items: [{ ...body().items[0],
    snippet: { ...body().items[0].snippet, title: 'Bolo de fubá' } }] }]) {
    let calls = 0;
    assert.deepEqual(await search(input, options(async () => { calls++; return Response.json(raw); })),
      { version: 1, status: 'not_found', video: null });
    assert.equal(calls, 1);
  }
});

test('YouTube: entrada e configuração inválidas impedem fetch', async () => {
  let calls = 0;
  const opts = options(async () => { calls++; throw Error('não chamar'); });
  for (const raw of [{ ...input, ingredients: ['frango'] }, { ...input, plan_id: 'privado' },
    { title: 'https://exemplo.com' }, null]) await assert.rejects(search(raw, opts), { name: 'ContractError' });
  for (const patch of [{ apiKey: undefined }, { apiKey: '' }, { apiKey: ' ' }, { apiKey: '\n' },
    { timeoutMs: 0 }, { timeoutMs: 10001 }, { timeoutMs: 1.5 }, { timeoutMs: NaN }, { fetchImpl: null }]) {
    await assert.rejects(search(input, { ...opts, ...patch }), { code: 'VIDEO_CONFIG_ERROR' });
  }
  assert.equal(calls, 0);
});

test('YouTube: erros HTTP são sanitizados e nunca viram ausência válida', async () => {
  for (const [status, code] of [[400, 'VIDEO_REQUEST_REJECTED'], [401, 'VIDEO_ACCESS_DENIED'],
    [403, 'VIDEO_ACCESS_DENIED'], [404, 'VIDEO_REQUEST_REJECTED'], [429, 'VIDEO_RATE_LIMITED'],
    [500, 'VIDEO_UNAVAILABLE'], [503, 'VIDEO_UNAVAILABLE'], [302, 'VIDEO_UNAVAILABLE']]) {
    let calls = 0;
    await assert.rejects(search(input, options(async () => {
      calls++; return new Response('diagnóstico privado', { status });
    })), error => error instanceof VideoProviderError && error.code === code
      && !error.message.includes('diagnóstico privado') && error.cause === undefined);
    assert.equal(calls, 1);
  }
});

test('YouTube: distingue quota 403, frequência e acesso negado sem repetir', async () => {
  for (const [reason, code] of [['quotaExceeded', 'VIDEO_QUOTA_EXCEEDED'],
    ['rateLimitExceeded', 'VIDEO_RATE_LIMITED'], ['userRateLimitExceeded', 'VIDEO_RATE_LIMITED'],
    ['forbidden', 'VIDEO_ACCESS_DENIED']]) {
    let calls = 0;
    await assert.rejects(search(input, options(async () => {
      calls++; return Response.json(rejection(reason), { status: 403 });
    })), error => error.code === code && !JSON.stringify(error).includes('diagnóstico privado'));
    assert.equal(calls, 1);
  }
});

test('YouTube: diagnóstico desconhecido/extra não é classificado como quota diária', async () => {
  const extra = rejection('quotaExceeded'); extra.error.details = [];
  const wrongCode = rejection('quotaExceeded'); wrongCode.error.code = 400;
  for (const raw of [extra, wrongCode, {}, { error: { reason: 'quotaExceeded' } }]) {
    await assert.rejects(search(input, options(async () => Response.json(raw, { status: 403 }))),
      { code: 'VIDEO_ACCESS_DENIED' });
  }
});

test('YouTube: resposta malformada, corpo ausente e campo extra são inválidos', async () => {
  for (const make of [() => new Response('não é JSON'), () => new Response(null, { status: 204 }),
    () => Response.json({ ...body(), nextPageToken: 'não usar' }),
    () => Response.json({ items: [{ ...body().items[0], extra: true }] }),
    () => Response.json({ items: null }), () => new Response(new Uint8Array([0xff]))]) {
    let calls = 0;
    await assert.rejects(search(input, options(async () => { calls++; return make(); })),
      { code: 'VIDEO_INVALID_RESPONSE' });
    assert.equal(calls, 1);
  }
});

test('YouTube: limite real de bytes ignora Content-Length enganoso e cancela stream', async () => {
  let cancelled = false, pulls = 0;
  const stream = new ReadableStream({ pull(controller) {
    if (pulls++ === 0) controller.enqueue(new Uint8Array(VIDEO_LIMITS.responseBytes + 1));
  }, cancel() { cancelled = true; } });
  await assert.rejects(search(input, options(async () => new Response(stream,
    { headers: { 'Content-Length': '1' } }))), { code: 'VIDEO_RESPONSE_TOO_LARGE' });
  assert.equal(cancelled, true);
});

test('YouTube: aceita fronteira de bytes e JSON dividido em vários blocos', async () => {
  const bytes = new TextEncoder().encode(JSON.stringify(body()));
  const complete = new Uint8Array(VIDEO_LIMITS.responseBytes).fill(32); complete.set(bytes);
  const stream = new ReadableStream({ start(controller) {
    for (let index = 0; index < complete.length; index += 7) controller.enqueue(complete.slice(index, index + 7));
    controller.close();
  } });
  assert.equal((await search(input, options(async () => new Response(stream)))).status, 'found');
});

test('YouTube: erro HTTP com corpo enorme também tem leitura limitada', async () => {
  await assert.rejects(search(input, options(async () => new Response('x'.repeat(VIDEO_LIMITS.responseBytes + 1),
    { status: 403 }))), { code: 'VIDEO_ACCESS_DENIED' });
});

test('YouTube: timeout limita cabeçalhos mesmo com transporte que ignora abort', async () => {
  let calls = 0, signal;
  await assert.rejects(search(input, { ...options((_, init) => {
    calls++; signal = init.signal; return new Promise(() => {});
  }), timeoutMs: 5 }), { code: 'VIDEO_TIMEOUT' });
  assert.equal(calls, 1); assert.equal(signal.aborted, true);
});

test('YouTube: timeout cobre corpo parado e cancela leitura', async () => {
  for (const status of [200, 403]) {
    let cancelled = false;
    const stream = new ReadableStream({ cancel() { cancelled = true; } });
    await assert.rejects(search(input, { ...options(async () => new Response(stream, { status })), timeoutMs: 5 }),
      { code: 'VIDEO_TIMEOUT' });
    assert.equal(cancelled, true);
  }
});

test('YouTube: resposta tardia é descartada e falha tardia não vira rejeição sem tratamento', async () => {
  let finish, cancelled = false;
  await assert.rejects(search(input, { ...options(() => new Promise(resolve => { finish = resolve; })), timeoutMs: 5 }),
    { code: 'VIDEO_TIMEOUT' });
  finish(new Response(new ReadableStream({ cancel() { cancelled = true; } })));
  await new Promise(resolve => setTimeout(resolve, 0)); assert.equal(cancelled, true);
  let rejectLater;
  await assert.rejects(search(input, { ...options(() => new Promise((_, reject) => { rejectLater = reject; })), timeoutMs: 5 }),
    { code: 'VIDEO_TIMEOUT' });
  rejectLater(Error('diagnóstico privado'));
  await new Promise(resolve => setTimeout(resolve, 0));
});

test('YouTube: falha de rede não expõe mensagem/URL do transporte', async () => {
  let calls = 0;
  await assert.rejects(search(input, options(() => {
    calls++; throw Error('diagnóstico privado com URL');
  })), { code: 'VIDEO_NETWORK_ERROR', message: 'Não foi possível consultar o vídeo de apoio.' });
  assert.equal(calls, 1);
});

test('YouTube: chamadas simultâneas não compartilham título, resultado ou estado', async () => {
  const inputs = ['Risoto de frango', 'Arroz de forno'];
  const results = await Promise.all(inputs.map(title => search({ title }, options(async address => {
    const result = body(); result.items[0].snippet.title = new URL(address).searchParams.get('q');
    return Response.json(result);
  }))));
  assert.deepEqual(results.map(result => result.video.title), ['risoto de frango', 'arroz de forno']);
});
