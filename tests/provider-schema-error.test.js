import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { completeWithGroq } from '../src/providers/groq-client.js';
import { evaluateCase } from '../scripts/generation-quality.mjs';
import { QUALITY_CASES } from '../scripts/fixtures/generation-quality-cases.mjs';

// Forma error/message/type/code relatada em C07, com conteúdo sintético.
// Não reproduzir credenciais ou tratar failed_generation como saída validada.
const errorBody = (code = 'json_validate_failed') => ({ error: {
  message: 'Diagnóstico privado simulado.', type: 'invalid_request_error', code,
  failed_generation: '{"error":"Conteúdo privado simulado."}',
} });
async function rejected(response, expected, timeoutMs = 30000) {
  let calls = 0;
  await assert.rejects(completeWithGroq({}, () => assert.fail('Erro HTTP não passa pelo validador de receita.'), {
    apiKey: randomUUID(), timeoutMs, fetchImpl: async () => { calls++; return response; },
  }), error => {
    assert.equal(error.code, expected);
    assert.equal(error.message, expected);
    assert.equal(error.usage, null);
    assert.ok(!JSON.stringify(error).includes('privado'));
    assert.equal(Object.hasOwn(error, 'failed_generation'), false);
    return true;
  });
  assert.equal(calls, 1);
}

test('esquema do provedor: 400 com código exato é distinto, sem bruto ou consumo inventado', async () => {
  await rejected(Response.json(errorBody(), { status: 400 }), 'PROVIDER_SCHEMA_REJECTED');
});

test('esquema do provedor: só error.code identifica o erro; não procurar palavras na mensagem', async () => {
  for (const body of [
    errorBody('outro_codigo'), errorBody(null), errorBody(1), errorBody('JSON_VALIDATE_FAILED'),
    { error: { message: 'json_validate_failed', type: 'invalid_request_error' } },
    { code: 'json_validate_failed' }, { error: 'json_validate_failed' }, { error: [] }, null,
  ]) await rejected(Response.json(body, { status: 400 }), 'PROVIDER_REJECTED_REQUEST');
});

test('esquema do provedor: JSON ausente/inválido, excesso de bytes ou falha de leitura mantêm 400 genérico', async () => {
  for (const response of [new Response(null, { status: 400 }), new Response('<html>Erro privado</html>', { status: 400 }),
    new Response(JSON.stringify(errorBody()) + ' '.repeat(262144), { status: 400 }),
    new Response(new ReadableStream({ start(c) { c.error(Error('Detalhe privado.')); } }), { status: 400 }),
  ]) await rejected(response, 'PROVIDER_REJECTED_REQUEST');
});

test('esquema do provedor: corpo incompleto expira e é cancelado, sem gerar TIMEOUT elegível', async () => {
  let cancelled = false;
  const stream = new ReadableStream({
    start(c) { c.enqueue(new TextEncoder().encode('{"error":')); },
    cancel() { cancelled = true; },
  });
  await rejected(new Response(stream, { status: 400 }), 'PROVIDER_REJECTED_REQUEST', 10);
  assert.equal(cancelled, true);
});

test('esquema do provedor: 413, 415 e 422 mantêm rejeição genérica mesmo com json_validate_failed', async () => {
  for (const status of [413, 415, 422]) await rejected(Response.json(errorBody(), { status }), 'PROVIDER_REJECTED_REQUEST');
});

test('esquema do provedor: demais status mantêm precedência e não são reclassificados pelo corpo', async () => {
  for (const [status, code] of [[401, 'AUTH_ERROR'], [403, 'AUTH_ERROR'], [429, 'RATE_LIMITED'],
    [500, 'PROVIDER_UNAVAILABLE'], [502, 'PROVIDER_UNAVAILABLE']]) {
    await rejected(Response.json(errorBody(), { status }), code);
  }
});

test('esquema do provedor: HTTP 200 não usa error.code para contornar a validação local', async () => {
  const record = await evaluateCase(QUALITY_CASES[0], { apiKey: randomUUID(), saveRaw: async () => {},
    fetchImpl: async (_, init) => Response.json({ model: JSON.parse(init.body).model,
      choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(errorBody()) } }],
    }),
  });
  assert.equal(record.provider_code, 'INVALID_OUTPUT');
  assert.equal(record.contract_verdict, 'fail');
});

test('esquema do provedor: avaliador preserva bruto de C07 e registra uso indisponível sem alterar taxonomia', async () => {
  const raw = JSON.stringify(errorBody());
  let saved, calls = 0;
  const record = await evaluateCase(QUALITY_CASES.find(entry => entry.id === 'C07'), {
    apiKey: randomUUID(), saveRaw: async bytes => { saved = bytes.toString(); },
    fetchImpl: async () => { calls++; return new Response(raw, { status: 400 }); },
  });
  assert.equal(calls, 1);
  assert.equal(saved, raw);
  assert.equal(record.raw_complete, true);
  assert.equal(record.http_status, 400);
  assert.equal(record.provider_code, 'PROVIDER_SCHEMA_REJECTED');
  assert.deepEqual(record.metadata.usage, { prompt_tokens: null, completion_tokens: null, total_tokens: null, reasoning_tokens: null });
  assert.equal(record.contract_verdict, 'fail');
  assert.deepEqual(record.contract_error, { path: 'output', code: 'CONTENT_UNAVAILABLE' });
  assert.equal(record.refusal_channel, 'not_applicable');
  assert.equal(record.rubric_verdict, null);
  assert.ok(!JSON.stringify(record).includes('privado'));
});
