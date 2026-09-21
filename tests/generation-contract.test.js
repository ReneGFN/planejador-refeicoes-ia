import test from 'node:test';
import assert from 'node:assert/strict';
import { ContractError, validateGenerationInput as input, validateGenerationOutput as output } from '../src/contracts/generation.js';

const cook = { mode: 'cook', meal: ' jantar ', people: 2, time_minutes: 30, ingredient_policy: 'only_available', ingredients: ['ovo'] };
const ready = { mode: 'ready', meal: 'almoço', people: 1 };
const recipe = () => ({ version: 1, mode: 'cook', suggestions: [{ title: 'Ovos mexidos', servings: 2, total_minutes: 10, ingredients: [{ name: 'ovo', quantity: 4, unit: 'unit' }], steps: ['Bata os ovos e cozinhe, mexendo, até ficarem firmes.'] }] });
test('aceita os modos e normaliza sem alterar o rascunho', () => {
  assert.equal(input(cook).meal, 'jantar');
  assert.equal(cook.meal, ' jantar ');
  assert.deepEqual(input(ready), ready);
  assert.equal(input({ ...ready, budget_brl: 19.9 }).budget_brl, 19.9);
});
test('pessoas: aceita limites e rejeita números inválidos/coerção', () => {
  for (const people of [1, 20]) assert.equal(input({ ...ready, people }).people, people);
  for (const people of [0, 21, 1.5, '2', null, NaN, Infinity]) assert.throws(() => input({ ...ready, people }), ContractError);
});
test('obrigatórios, modo, texto e propriedades extras', () => {
  for (const raw of [null, [], {}, { ...ready, mode: 'other' }, { ...ready, meal: '' }, { ...ready, meal: 'a'.repeat(81) }, { ...ready, people: undefined }, { ...ready, unexpected: true }]) assert.throws(() => input(raw), ContractError);
  assert.equal(input({ ...ready, meal: 'a'.repeat(80) }).meal.length, 80);
});
test('tempo e ingredientes não podem ser enviados no modo pronto', () => {
  for (const extras of [{ time_minutes: 15 }, { ingredients: [] }, { ingredient_policy: 'suggest' }]) assert.throws(() => input({ ...ready, ...extras }), ContractError);
});
test('cozinhar exige tempo válido e escolha explícita de ingredientes', () => {
  for (const time_minutes of [undefined, 0, 241, 2.5, '30']) assert.throws(() => input({ ...cook, time_minutes }), ContractError);
  for (const ingredients of [undefined, [], [''], ['ovo', ' OVO '], Array(41).fill('ovo')]) assert.throws(() => input({ ...cook, ingredients }), ContractError);
  assert.deepEqual(input({ ...cook, ingredient_policy: 'suggest', ingredients: [] }).ingredients, []);
  assert.throws(() => input({ ...cook, ingredient_policy: 'suggest' }), ContractError);
  assert.equal(input({ ...cook, ingredient_policy: 'can_buy_missing' }).ingredients.length, 1);
});
test('orçamento e preferências opcionais possuem limites', () => {
  for (const budget_brl of [0, -1, 100001, 1.123, '10', null, Infinity]) assert.throws(() => input({ ...ready, budget_brl }), ContractError);
  assert.throws(() => input({ ...ready, preferences: 'a'.repeat(401) }), ContractError);
  assert.equal(input({ ...ready, preferences: 'a'.repeat(400) }).preferences.length, 400);
});
test('receita válida, porções e tempo coerentes', () => {
  assert.equal(output(recipe(), cook).suggestions[0].total_minutes, 10);
  for (const patch of [{ servings: 1 }, { total_minutes: 31 }, { steps: [] }, { ingredients: [] }, { title: '' }]) {
    const raw = recipe(); Object.assign(raw.suggestions[0], patch);
    assert.throws(() => output(raw, cook), ContractError);
  }
});
test('valida unidades, quantidades, versão, modo e tamanho da resposta', () => {
  for (const patch of [{ quantity: 0 }, { unit: 'unknown' }, { name: '' }]) {
    const raw = recipe(); Object.assign(raw.suggestions[0].ingredients[0], patch);
    assert.throws(() => output(raw, cook), ContractError);
  }
  for (const patch of [{ version: 2 }, { mode: 'ready' }, { suggestions: [] }, { suggestions: Array(4).fill(recipe().suggestions[0]) }]) assert.throws(() => output({ ...recipe(), ...patch }, cook), ContractError);
});
test('comida pronta possui sugestão e busca, sem campos de entrega/receita', () => {
  const raw = { version: 1, mode: 'ready', suggestions: [{ title: 'Prato feito', description: 'Uma opção para almoço.', search_term: 'prato feito', servings: 1 }] };
  assert.equal(output(raw, ready).suggestions.length, 1);
  for (const patch of [{ delivery_minutes: 10 }, { restaurant: 'Loja' }, { price_brl: 20 }, { steps: [] }]) {
    assert.throws(() => output({ ...raw, suggestions: [{ ...raw.suggestions[0], ...patch }] }, ready), ContractError);
  }
});
