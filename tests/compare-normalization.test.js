import test from 'node:test';
import assert from 'node:assert/strict';
import { validateGenerationOutput } from '../src/contracts/generation.js';
import { calculateComparison } from '../src/comparison/calculate.js';
import { compareWire } from './helpers/compare-wire.js';

const input = { mode: 'compare', meal: 'banana', people: 1, time_minutes: 10,
  ingredient_policy: 'only_available', ingredients: ['banana'], hourly_rate_brl: 19.99 };
const recipe = { title: 'Banana', servings: 1, total_minutes: 5,
  ingredients: [{ name: 'banana', quantity: 1, unit: 'unit' }], steps: ['Descasque e sirva.'] };
const ready = { title: 'Banana', description: 'Fruta pronta para consumo.', search_term: 'banana', servings: 1 };
const none = () => ({ status: 'not_suggested', reason: 'Não foi encontrada opção compatível.' });
const canonical = () => ({ version: 1, mode: 'compare',
  cook: { status: 'suggested', suggestions: [structuredClone(recipe)] },
  ready: { status: 'suggested', suggestions: [structuredClone(ready)] } });

test('compare normalização: todas as combinações, preço opcional e idempotência preservam cálculos', () => {
  for (const hasCook of [true, false]) for (const hasReady of [true, false]) for (const price of [null, 20]) {
    const expected = canonical();
    if (!hasCook) expected.cook = none();
    if (!hasReady) expected.ready = none();
    else if (price !== null) expected.ready.suggestions[0].estimated_price_brl = { value: price, origin: 'estimado' };
    const wire = compareWire(expected), snapshot = structuredClone(wire);
    const normalized = validateGenerationOutput(wire, input);
    assert.deepEqual(normalized, expected);
    assert.deepEqual(validateGenerationOutput(normalized, input), expected);
    assert.deepEqual(calculateComparison(input, wire), calculateComparison(input, expected));
    assert.deepEqual(wire, snapshot);
    assert.notEqual(normalized.cook, wire.cook);
    assert.notEqual(normalized.ready, wire.ready);
    if (hasCook) assert.notEqual(normalized.cook.suggestions[0].ingredients, wire.cook.suggestions[0].ingredients);
  }
});

test('compare normalização: não confunde null inativo com conteúdo, vazio ou undefined', () => {
  const reject = (raw, path) => assert.throws(() => validateGenerationOutput(raw, input), error => error.path === path);
  for (const mode of ['cook', 'ready']) {
    for (const reason of ['', ' ', 'Motivo contraditório.', undefined, 0, false, {}, []]) {
      const raw = compareWire(canonical()); raw[mode].reason = reason;
      reject(raw, 'output.' + mode + '.reason');
    }
    for (const suggestions of [[], [recipe], undefined, 0, false, {}, '']) {
      const raw = compareWire(canonical()); raw[mode] = { ...none(), suggestions };
      reject(raw, 'output.' + mode + '.suggestions');
    }
    for (const reason of [null, undefined, '', ' ', 'a'.repeat(501)]) {
      const raw = compareWire(canonical()); raw[mode] = { status: 'not_suggested', reason, suggestions: null };
      reject(raw, 'output.' + mode + '.reason');
    }
    const raw = compareWire(canonical()); raw[mode].suggestions = null;
    reject(raw, 'output.' + mode + '.suggestions');
  }
});

test('compare normalização: campos extras não são descartados, nem preço parcialmente nulo aceito', () => {
  for (const [mutate, path] of [
    [raw => { raw.extra = null; }, 'output.extra'],
    [raw => { raw.cook.extra = null; }, 'output.cook.extra'],
    [raw => { raw.ready.suggestions[0].restaurant = null; }, 'output.ready.suggestions.0.restaurant'],
    [raw => { raw.ready.suggestions[0].estimated_price_brl = { value: null, origin: 'estimado' }; }, 'output.ready.suggestions.0.estimated_price_brl.value'],
    [raw => { raw.ready.suggestions[0].estimated_price_brl = { value: 20, origin: null }; }, 'output.ready.suggestions.0.estimated_price_brl.origin'],
    [raw => { raw.ready.suggestions[0].estimated_price_brl = undefined; }, 'output.ready.suggestions.0.estimated_price_brl'],
    [raw => { raw.cook.suggestions[0].estimated_price_brl = null; }, 'output.cook.suggestions.0.estimated_price_brl'],
  ]) {
    const raw = compareWire(canonical()); mutate(raw);
    assert.throws(() => validateGenerationOutput(raw, input), error => error.path === path);
  }
});

test('normalização de transporte não altera os modos cook/ready isolados', () => {
  for (const mode of ['cook', 'ready']) {
    const request = mode === 'cook' ? { ...input, mode } : { mode, meal: input.meal, people: input.people };
    delete request.hourly_rate_brl;
    const raw = { version: 1, mode, suggestions: [structuredClone(mode === 'cook' ? recipe : ready)] };
    assert.deepEqual(validateGenerationOutput(raw, request), raw);
    assert.throws(() => validateGenerationOutput({ ...raw, reason: null }, request), error => error.path === 'output.reason');
    raw.suggestions[0].estimated_price_brl = null;
    assert.throws(() => validateGenerationOutput(raw, request), error => error.path === 'output.suggestions.0.estimated_price_brl');
  }
});
