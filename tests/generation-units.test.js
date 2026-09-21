import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { UNIT_CHOICES, validateGenerationOutput, ContractError } from '../src/contracts/generation.js';
import { generateWithGroq, MODEL, outputSchema } from '../src/providers/groq.js';

const input = { mode: 'cook', meal: 'lanche', people: 1, time_minutes: 15, ingredient_policy: 'suggest', ingredients: [] };
const recipe = (unit = 'unit', steps = ['Descasque e sirva a banana.']) => ({ version: 1, mode: 'cook', suggestions: [{
  title: 'Banana', servings: 1, total_minutes: 5, ingredients: [{ name: 'banana', quantity: 1, unit }], steps,
}] });
async function sentRequest() {
  let sent, calls = 0;
  await generateWithGroq(input, { apiKey: randomUUID(), fetchImpl: async (_, init) => {
    calls++; sent = JSON.parse(init.body);
    return Response.json({ model: MODEL, choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(recipe()) } }] });
  } });
  assert.equal(calls, 1);
  return sent;
}

test('unidades: fonte única congelada preserva as nove opções existentes', () => {
  // Oráculo do contrato anterior, não outra lista usada pelo produto.
  assert.deepEqual(UNIT_CHOICES, ['g', 'kg', 'ml', 'l', 'unit', 'teaspoon', 'tablespoon', 'cup', 'pinch']);
  assert.equal(Object.isFrozen(UNIT_CHOICES), true);
  assert.equal(new Set(UNIT_CHOICES).size, UNIT_CHOICES.length);
  assert.throws(() => UNIT_CHOICES.push('outra'), TypeError);
});

test('unidades: validador, schema e lista textual enviada usam a mesma fonte', async () => {
  const sent = await sentRequest();
  const schemaUnits = outputSchema('cook').properties.suggestions.items.properties.ingredients.items.properties.unit.enum;
  assert.equal(schemaUnits, UNIT_CHOICES);
  assert.deepEqual(sent.response_format.json_schema.schema.properties.suggestions.items.properties.ingredients.items.properties.unit.enum, UNIT_CHOICES);
  const matches = [...sent.messages[0].content.matchAll(/Em ingredients, unit aceita somente: ([^.]+)\./gu)];
  assert.equal(matches.length, 1);
  assert.deepEqual(matches[0][1].split(', '), UNIT_CHOICES);
  for (const unit of UNIT_CHOICES) {
    assert.equal(validateGenerationOutput(recipe(unit), input).suggestions[0].ingredients[0].unit, unit);
  }
  // Confere também a ligação do validador à fonte, para detectar uma lista paralela
  // que aceite valores extras sem aparecer no schema ou no texto.
  const source = await readFile(new URL('../src/contracts/generation.js', import.meta.url), 'utf8');
  assert.match(source, /choice\(\s*ingredient\.unit\s*,\s*UNIT_CHOICES\s*,/u);
  assert.equal(sent.response_format.json_schema.strict, true);
  assert.equal(sent.max_completion_tokens, 4096);
  assert.equal(sent.reasoning_effort, 'low');
  // Transporte simulado: comprova sincronia, não que o modelo obedeceu.
});

test('unidades: prompt informa identificadores exatos; validador não traduz nem muda caixa', async () => {
  const system = (await sentRequest()).messages[0].content;
  assert.ok(system.includes('São identificadores exatos: não traduza para português (unidade, dentes, colher) nem varie a caixa.'));
  for (const unit of ['unidade', 'dentes', 'colher', 'mg', 'outra_unidade', ...UNIT_CHOICES.map(u => u.toUpperCase()),
    ...UNIT_CHOICES.map(u => ` ${u} `)]) {
    assert.throws(() => validateGenerationOutput(recipe(unit), input), error =>
      error instanceof ContractError && error.path === 'output.suggestions.0.ingredients.0.unit');
  }
});

test('passos: instrução contra vazio e espaços, sem limpeza ou aperto de schema neste item', async () => {
  const sent = await sentRequest();
  assert.ok(sent.messages[0].content.includes('Nenhum item de steps pode ser string vazia ou conter só espaços.'));
  for (const step of ['', '   ', '\t\n']) {
    const raw = recipe('unit', ['Descasque a banana.', step]);
    assert.throws(() => validateGenerationOutput(raw, input), error =>
      error instanceof ContractError && error.path === 'output.suggestions.0.steps.1');
    assert.deepEqual(raw.suggestions[0].steps, ['Descasque a banana.', step]);
  }
  const suggestions = sent.response_format.json_schema.schema.properties.suggestions;
  assert.deepEqual(suggestions.items.properties.steps.items, { type: 'string' });
  assert.equal(Object.hasOwn(suggestions, 'minItems'), false);
  assert.equal(Object.hasOwn(suggestions, 'maxItems'), false);
  assert.ok(sent.messages[0].content.includes('Não force receita inviável: se não conseguir atender ao pedido, retorne suggestions vazia; o servidor tratará como resposta incompatível.'));
});
