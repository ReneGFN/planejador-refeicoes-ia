import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWithGroq, MODEL } from '../src/providers/groq.js';
const input = { mode: 'ready', meal: 'almoço', people: 1 };
const data = { version: 1, mode: 'ready', suggestions: [{ title: 'Prato feito', description: 'Opção de almoço.', search_term: 'prato feito', servings: 1 }] };
const envelope = (patch = {}) => ({ model: MODEL, choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(data) } }], usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300, completion_tokens_details: { reasoning_tokens: 50 } }, ...patch });
const opts = fetchImpl => ({ apiKey: 'test-only-not-a-real-key', fetchImpl });

test('envia schema estrito, preserva metadados e não devolve raciocínio', async () => {
  let calls = 0;
  const result = await generateWithGroq(input, opts(async (url, request) => {
    calls++;
    assert.equal(url, 'https://api.groq.com/openai/v1/chat/completions');
    assert.equal(request.redirect, 'manual');
    const body = JSON.parse(request.body);
    assert.equal(body.response_format.json_schema.strict, true);
    assert.equal(body.model, MODEL);
    assert.equal(body.stream, false);
    return Response.json(envelope());
  }));
  assert.equal(calls, 1);
  assert.deepEqual(result.data, data);
  assert.equal(result.metadata.usage.total_tokens, 300);
  assert.equal(result.metadata.usage.reasoning_tokens, 50);
});
test('sem chave ou entrada inválida não chama provedor', async () => {
  const fetchImpl = () => { throw new Error('não deveria executar'); };
  await assert.rejects(generateWithGroq(input, { fetchImpl }), { code: 'MISSING_API_KEY' });
  await assert.rejects(generateWithGroq({ ...input, people: 0 }, opts(fetchImpl)), { name: 'ContractError' });
});
test('erros HTTP não expõem corpo e não repetem chamadas', async () => {
  for (const [status, code] of [[401, 'AUTH_ERROR'], [403, 'AUTH_ERROR'], [429, 'RATE_LIMITED'], [500, 'PROVIDER_UNAVAILABLE']]) {
    let calls = 0;
    await assert.rejects(generateWithGroq(input, opts(async () => { calls++; return new Response('sensitive', { status }); })), { code, message: code });
    assert.equal(calls, 1);
  }
});
test('rejeita resposta truncada, recusa, JSON inválido e contrato incorreto', async () => {
  for (const [choice, code] of [
    [{ finish_reason: 'length' }, 'TRUNCATED'],
    [{ finish_reason: 'stop', message: { refusal: 'no' } }, 'REFUSED'],
    [{ finish_reason: 'stop', message: { content: 'invalid' } }, 'INVALID_OUTPUT'],
    [{ finish_reason: 'stop', message: { content: '{}' } }, 'INVALID_OUTPUT'],
  ]) await assert.rejects(generateWithGroq(input, opts(async () => Response.json(envelope({ choices: [choice] })))), { code });
});
test('limita bytes, trata falha de rede e timeout', async () => {
  await assert.rejects(generateWithGroq(input, opts(async () => new Response('x'.repeat(262145)))), { code: 'RESPONSE_TOO_LARGE' });
  await assert.rejects(generateWithGroq(input, opts(async () => { throw new Error('sensitive'); })), { code: 'NETWORK_ERROR' });
  await assert.rejects(generateWithGroq(input, { ...opts((url, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }))), timeoutMs: 5 }), { code: 'TIMEOUT' });
});
test('metadados ausentes não viram consumo zero e modelo diferente é rejeitado', async () => {
  const result = await generateWithGroq(input, opts(async () => Response.json(envelope({ usage: undefined }))));
  assert.equal(result.metadata.usage.total_tokens, null);
  await assert.rejects(generateWithGroq(input, opts(async () => Response.json(envelope({ model: 'other' })))), { code: 'UNEXPECTED_MODEL' });
});
