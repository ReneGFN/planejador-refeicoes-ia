import test from 'node:test';
import assert from 'node:assert/strict';
import { completeWithGroq, technicalCategory } from '../src/providers/groq-client.js';
import { probe } from '../scripts/groq-transport-probe.mjs';

test('diagnóstico distingue DNS, TLS e redirect sem copiar texto livre', () => {
  for (const [cause, expected] of [[{ code: 'ENOTFOUND' }, 'DNS'], [{ code: 'CERT_HAS_EXPIRED' }, 'TLS'], [{ message: 'unexpected redirect' }, 'REDIRECT_REJECTED']]) {
    const error = new TypeError('SECRET https://private', { cause });
    assert.equal(technicalCategory(error, 'fetch').category, expected);
    assert.doesNotMatch(JSON.stringify(technicalCategory(error, 'fetch')), /SECRET|private/);
  }
  assert.equal(technicalCategory({ name: 'SECRET', cause: { code: 'SECRET' } }, 'fetch').name, 'UNKNOWN');
});

test('leitura de corpo quebrada não é rotulada como rede', async () => {
  await assert.rejects(completeWithGroq({}, () => ({}), { apiKey: 'fake', fetchImpl: async () => new Response(new ReadableStream({ start(c) { c.error(new TypeError('private')); } })) }),
    error => error.code === 'RESPONSE_READ_ERROR' && error.diagnostic.category === 'BODY_READ');
});

test('montagem circular e DNS conservam etapas diferentes', async () => {
  const body = {}; body.self = body;
  await assert.rejects(completeWithGroq(body, () => ({}), { apiKey: 'fake', fetchImpl: () => assert.fail('sem rede') }), error => error.code === 'REQUEST_BUILD_ERROR');
  await assert.rejects(completeWithGroq({}, () => ({}), { apiKey: 'fake', fetchImpl: async () => { throw new TypeError('private', { cause: { code: 'ENOTFOUND' } }); } }),
    error => error.code === 'NETWORK_ERROR' && error.diagnostic.cause_code === 'ENOTFOUND');
});

test('sonda usa somente GET models com redirect error: 200, 401 e DNS simulados', async () => {
  for (const status of [200, 401]) {
    const result = await probe({ apiKey: 'fake', fetchImpl: async (url, init) => {
      assert.equal(url, 'https://api.groq.com/openai/v1/models'); assert.equal(init.method, 'GET');
      assert.equal(init.redirect, 'error'); assert.equal(init.body, undefined);
      return new Response('{}', { status });
    } });
    assert.equal(result.code, status === 200 ? 'OK' : 'AUTH_ERROR');
  }
  const result = await probe({ apiKey: 'fake', fetchImpl: async () => { throw new Error('secret', { cause: { code: 'ENOTFOUND' } }); } });
  assert.equal(result.code, 'NETWORK_ERROR'); assert.equal(result.diagnostic.category, 'DNS');
});
