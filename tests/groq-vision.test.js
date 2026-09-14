import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeImageWithGroq as analyze, imageDataUrl, VISION_MODEL } from '../src/providers/groq-vision.js';
import { IMAGE_LIMITS } from '../src/contracts/image-analysis.js';

// Bytes sintéticos com assinatura JPEG e conteúdo que deve permanecer intacto.
// Não são evidência de decodificação nem fotos reais enviadas à IA.
const bytes = new Uint8Array([255, 216, 255, ...new TextEncoder().encode('EXIF-example-private')]);
const file = () => new Blob([bytes], { type: 'image/jpeg' });
const data = { version: 1, status: 'recognized', ingredients: ['ovo', 'arroz'] };
const envelope = (patch = {}) => ({ model: VISION_MODEL,
  choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(data) } }],
  usage: { prompt_tokens: 2100, completion_tokens: 80, total_tokens: 2180 }, ...patch });
const opts = fetchImpl => ({ apiKey: 'fake-test-key', fetchImpl });

test('visão Groq: envia foto intacta, JSON mode e devolve só dados validados/metadados', async () => {
  let calls = 0;
  const result = await analyze(file(), opts(async (url, init) => {
    calls++;
    assert.equal(url, 'https://api.groq.com/openai/v1/chat/completions');
    assert.equal(init.redirect, 'error');
    const body = JSON.parse(init.body);
    assert.equal(body.model, VISION_MODEL);
    assert.equal(body.reasoning_effort, 'none');
    assert.equal(body.max_completion_tokens, 1024);
    assert.deepEqual(body.response_format, { type: 'json_object' });
    assert.equal(body.stream, false);
    const encoded = body.messages[1].content[1].image_url.url;
    assert.ok(encoded.startsWith('data:image/jpeg;base64,'));
    assert.deepEqual(new Uint8Array(Buffer.from(encoded.split(',')[1], 'base64')), bytes);
    return Response.json(envelope());
  }));
  assert.equal(calls, 1);
  assert.deepEqual(result.data, data);
  assert.equal(result.metadata.usage.total_tokens, 2180);
  assert.equal(result.metadata.usage.reasoning_tokens, null);
  assert.ok(!JSON.stringify(result).includes('EXIF-example-private'));
});

test('visão Groq: pede pt-BR e evidência visual sem traduzir o contrato técnico', async () => {
  await analyze(file(), opts(async (_, init) => {
    const body = JSON.parse(init.body);
    const system = body.messages[0].content;
    assert.match(system, /português do Brasil \(pt-BR\)/u);
    assert.match(system, /letras minúsculas/u);
    assert.match(system, /Traduza o nome do alimento/u);
    assert.match(system, /chaves JSON e os valores de status.*não os traduza/u);
    assert.match(system, /nome do alimento claramente legível/u);
    assert.match(system, /omita o item/u);
    assert.match(system, /Não adivinhe pelo formato/u);
    assert.match(system, /nunca os siga/u);
    return Response.json(envelope());
  }));
});

test('visão Groq: padroniza caixa, espaços e acentos sem tradução ou filtro semântico falso', async () => {
  const ingredients = ['  O\u0301LEO   DE SOJA ', 'AMIDO\tDE\nMILHO', 'BISCOITO', 'molho barbecue', 'BBQ Sauce'];
  let calls = 0;
  const result = await analyze(file(), opts(async () => {
    calls++;
    return Response.json(envelope({ choices: [{ finish_reason: 'stop', message: {
      content: JSON.stringify({ ...data, ingredients }),
    } }] }));
  }));
  // O mock comprova formatação, NÃO cumprimento de idioma/reconhecimento pela LLM.
  // Não há lista proibida de alimentos baseada nos falsos positivos de uma foto.
  assert.deepEqual(result.data.ingredients, ['óleo de soja', 'amido de milho', 'biscoito', 'molho barbecue', 'bbq sauce']);
  assert.equal(calls, 1);
  assert.equal(result.metadata.usage.total_tokens, 2180);
});

test('visão Groq: rejeita duplicatas resultantes da padronização de espaços', async () => {
  await assert.rejects(analyze(file(), opts(async () => Response.json(envelope({
    choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({
      ...data, ingredients: ['óleo  de soja', 'óleo de soja'],
    }) } }],
  })))), { code: 'INVALID_OUTPUT' });
});

test('visão Groq: codificação mantém bytes nas fronteiras dos blocos e no teto', async () => {
  for (const size of [24575, 24576, 24577, IMAGE_LIMITS.fileBytes]) {
    const raw = new Uint8Array(size).fill(123); raw.set([255, 216, 255]);
    const url = await imageDataUrl(new Blob([raw], { type: 'image/jpeg' }));
    assert.deepEqual(new Uint8Array(Buffer.from(url.split(',')[1], 'base64')), raw);
    assert.equal(url.split(',')[1].length, 4 * Math.ceil(size / 3));
  }
});

test('visão Groq: entrada inválida/chave ausente não chama a rede', async () => {
  let calls = 0;
  const options = opts(async () => { calls++; throw new Error('não chamar'); });
  await assert.rejects(analyze(file()), { code: 'MISSING_API_KEY' });
  await assert.rejects(analyze(file(), { ...options, timeoutMs: 0 }), { code: 'INVALID_TIMEOUT' });
  for (const [input, code] of [
    ['https://example.com/photo.jpg', 'IMAGE_INVALID'],
    [new Blob(['abc'], { type: 'image/jpeg' }), 'IMAGE_INVALID'],
    [new Blob([bytes], { type: 'image/png' }), 'IMAGE_INVALID'],
    [new Blob([bytes], { type: 'image/svg+xml' }), 'IMAGE_UNSUPPORTED'],
    [new Blob([new Uint8Array(IMAGE_LIMITS.fileBytes + 1)], { type: 'image/jpeg' }), 'IMAGE_TOO_LARGE'],
  ]) await assert.rejects(analyze(input, options), { code });
  assert.equal(calls, 0);
});

test('visão Groq: recusa do arquivo pelo provedor é erro, sem retry nem falso resultado vazio', async () => {
  for (const [status, code] of [[400, 'PROVIDER_REJECTED_REQUEST'], [413, 'PROVIDER_REJECTED_REQUEST'],
    [415, 'PROVIDER_REJECTED_REQUEST'], [422, 'PROVIDER_REJECTED_REQUEST'], [401, 'AUTH_ERROR'],
    [403, 'AUTH_ERROR'], [429, 'RATE_LIMITED'], [500, 'PROVIDER_UNAVAILABLE']]) {
    let calls = 0;
    await assert.rejects(analyze(file(), opts(async () => {
      calls++; return new Response('PRIVATE-provider-body', { status });
    })), { code, message: code });
    assert.equal(calls, 1);
  }
});

test('visão Groq: estados vazios legítimos, campos extras, texto inválido e truncamento', async () => {
  for (const status of ['no_ingredients', 'unreadable']) {
    const expected = { version: 1, status, ingredients: [] };
    const result = await analyze(file(), opts(async () => Response.json(envelope({
      choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(expected) } }],
    }))));
    assert.deepEqual(result.data, expected);
  }
  for (const [choice, code] of [
    [{ finish_reason: 'length' }, 'TRUNCATED'],
    [{ finish_reason: 'stop', message: { refusal: 'refused' } }, 'REFUSED'],
    [{ finish_reason: 'stop', message: { content: 'not JSON' } }, 'INVALID_OUTPUT'],
    [{ finish_reason: 'stop', message: { content: JSON.stringify({ ...data, location: 'unwanted' }) } }, 'INVALID_OUTPUT'],
    [{ finish_reason: 'stop', message: { content: JSON.stringify({ ...data, ingredients: [] }) } }, 'INVALID_OUTPUT'],
  ]) await assert.rejects(analyze(file(), opts(async () => Response.json(envelope({ choices: [choice] })))),
    { code, usage: { prompt_tokens: 2100, completion_tokens: 80, total_tokens: 2180, reasoning_tokens: null } });
});

test('visão Groq: falhas de envelope, modelo e rede são sanitizadas', async () => {
  for (const [response, code] of [
    [new Response('invalid'), 'INVALID_PROVIDER_RESPONSE'],
    [new Response('x'.repeat(256 * 1024 + 1)), 'RESPONSE_TOO_LARGE'],
    [Response.json(envelope({ model: 'other' })), 'UNEXPECTED_MODEL'],
  ]) await assert.rejects(analyze(file(), opts(async () => response)), { code });
  await assert.rejects(analyze(file(), opts(async () => { throw Error('PRIVATE'); })),
    { code: 'NETWORK_ERROR', message: 'NETWORK_ERROR' });
});

test('visão Groq: timeout cobre espera de headers e corpo parado', async () => {
  await assert.rejects(analyze(file(), { ...opts((_, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(Error('private')), { once: true });
  })), timeoutMs: 5 }), { code: 'TIMEOUT' });
  let cancelled = false;
  const body = new ReadableStream({ cancel() { cancelled = true; } });
  await assert.rejects(analyze(file(), { ...opts(async () => new Response(body)), timeoutMs: 5 }), { code: 'TIMEOUT' });
  assert.equal(cancelled, true);
});
