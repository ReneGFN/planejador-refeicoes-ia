import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { generateWithGroq, MODEL, outputSchema } from '../src/providers/groq.js';

const input = { mode: 'cook', meal: 'lanche', people: 1, time_minutes: 15,
  ingredient_policy: 'suggest', ingredients: [], max_dishes: 2 };
const recipe = steps => ({ version: 1, mode: 'cook', suggestions: [{
  title: 'Banana', servings: 1, total_minutes: 5,
  ingredients: [{ name: 'banana', quantity: 1, unit: 'unit' }], steps,
}] });

// Estes testes comprovam as instruções enviadas, não a obediência do modelo.
// O transporte é sempre simulado, sem chave real, rede ou medição de tokens.
async function capture(steps = ['Descasque e sirva a banana.']) {
  let sent, calls = 0;
  const data = recipe(steps);
  const result = await generateWithGroq(input, { apiKey: randomUUID(), fetchImpl: async (_, init) => {
    calls++;
    sent = JSON.parse(init.body);
    return Response.json({ model: MODEL,
      choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(data) } }],
    });
  } });
  assert.equal(calls, 1);
  assert.deepEqual(result.data, data);
  return { sent, result };
}

for (const [label, fragments] of [
  ['receita completa do início ao servir', [
    'os passos devem formar a receita inteira, do primeiro preparo ao servir',
    'não omita etapas nem comece no meio',
  ]],
  ['passos sem prefixo numérico no texto', [
    'Não numere os passos dentro do texto',
    'a numeração pertence à lista; cada passo é uma frase sem prefixo numérico',
  ]],
  ['ingredientes dos passos também na lista, inclusive em suggest', [
    'Todo ingrediente usado nos passos deve constar em ingredients com quantidade, inclusive em suggest',
    'não acrescente sal ou temperos apenas nos passos',
  ]],
  ['tempo de ingredientes crus e nomes reais', [
    'total_minutes inclui hidratação, dessalga e cozimento de alimentos crus',
    'Não trate alimento cru como pronto',
    'Use somente nomes de alimentos reais e reconhecíveis em pt-BR',
    'não combine nomes nem invente cortes',
  ]],
  ['sem substituir utensílio por mãos para caber na louça', [
    'Não sugira manipular alimentos com as mãos ou os dedos em lugar de utensílio para caber em max_dishes',
    'como misturar com o próprio dedo',
  ]],
]) {
  test(`instruções enviadas, não qualidade real: ${label}`, async () => {
    const { sent } = await capture();
    assert.equal(sent.messages[0].role, 'system');
    for (const fragment of fragments) assert.ok(sent.messages[0].content.includes(fragment), fragment);
  });
}

test('instruções: não limpa prefixos que denunciam receita incompleta nem muda contrato/recusa', async () => {
  // Prefixos e omissão deliberados: preservar evidência não aprova esta receita.
  const steps = ['4. 4. Espalhe a massa.', '5. Asse.', '6. Sirva.'];
  const { sent, result } = await capture(steps);
  assert.deepEqual(result.data.suggestions[0].steps, steps);
  assert.deepEqual(JSON.parse(sent.messages[1].content), input);
  assert.equal(sent.model, MODEL);
  assert.equal(sent.max_completion_tokens, 4096);
  assert.equal(sent.reasoning_effort, 'low');
  assert.equal(sent.response_format.json_schema.strict, true);
  assert.deepEqual(sent.response_format.json_schema.schema, outputSchema('cook'));
  assert.ok(sent.messages[0].content.includes('Zero pede preparo sem sujar peças; omissão não informa limite.'));
  assert.ok(sent.messages[0].content.includes('Não force receita inviável: se não conseguir atender ao pedido, retorne suggestions vazia; o servidor tratará como resposta incompatível.'));
});
