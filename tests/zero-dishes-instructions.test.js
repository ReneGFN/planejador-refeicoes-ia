import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { generateWithGroq, MODEL, outputSchema } from '../src/providers/groq.js';
import { EQUIPMENT_CASES } from '../scripts/fixtures/equipment-quality-cases.mjs';

const input = EQUIPMENT_CASES.find(entry => entry.id === 'E06').input;
const envelope = suggestions => ({ model: MODEL,
  choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ version: 1, mode: 'cook', suggestions }) } }],
});

test('zero louça: envia a instrução para E06; resposta simulada não comprova obediência real', async () => {
  const suggestions = [{ title: 'Banana ao natural', servings: 1, total_minutes: 1,
    ingredients: [{ name: 'banana', quantity: 1, unit: 'unit' }], steps: ['Descasque a banana e coma.'] }];
  let calls = 0;
  const result = await generateWithGroq(input, { apiKey: randomUUID(), fetchImpl: async (_, init) => {
    calls++;
    const body = JSON.parse(init.body), system = body.messages[0].content;
    assert.equal(body.messages[0].role, 'system');
    assert.deepEqual(JSON.parse(body.messages[1].content), input);
    assert.equal(input.max_dishes, 0);
    assert.deepEqual(input.equipment, []);
    for (const fragment of [
      'max_dishes 0 pede um preparo que não suja nenhuma peça reutilizável',
      'Consumir o alimento como está — descascar, abrir ou servir direto — é uma resposta válida, não um pedido impossível',
      'quando compatível com os ingredientes e as demais restrições',
      'descascar a banana e comer atende com zero peças sujas',
      'Zero, por si só, não autoriza recusar',
      'Não sugira manipular alimentos com as mãos ou os dedos em lugar de utensílio para caber em max_dishes',
    ]) assert.ok(system.includes(fragment), fragment);
    assert.equal(body.model, MODEL);
    assert.equal(body.max_completion_tokens, 4096);
    assert.equal(body.reasoning_effort, 'low');
    assert.equal(body.response_format.json_schema.strict, true);
    assert.deepEqual(body.response_format.json_schema.schema, outputSchema('cook'));
    return Response.json(envelope(suggestions));
  } });
  assert.equal(calls, 1);
  assert.deepEqual(result.data.suggestions, suggestions);
  // Testa instruções e transporte, não detecta nem conta peças na saída.
});

test('zero louça: lista vazia continua INVALID_OUTPUT sem reparo, recusa alterada ou repetição', async () => {
  let calls = 0;
  await assert.rejects(generateWithGroq(input, { apiKey: randomUUID(), fetchImpl: async (_, init) => {
    calls++;
    const system = JSON.parse(init.body).messages[0].content;
    assert.ok(system.includes('Não force receita inviável: se não conseguir atender ao pedido, retorne suggestions vazia; o servidor tratará como resposta incompatível.'));
    return Response.json(envelope([]));
  } }), { code: 'INVALID_OUTPUT' });
  assert.equal(calls, 1);
});
