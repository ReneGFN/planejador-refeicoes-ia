import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateComparison, calculateTimeCost } from '../src/comparison/calculate.js';
import { ContractError } from '../src/contracts/generation.js';

const request = (patch = {}) => ({ mode: 'compare', meal: 'jantar', people: 2, time_minutes: 60,
  ingredient_policy: 'suggest', ingredients: [], ...patch });
const recipe = (minutes = 30) => ({ title: 'Banana', servings: 2, total_minutes: minutes,
  ingredients: [{ name: 'banana', quantity: 2, unit: 'unit' }], steps: ['Descasque e sirva.'] });
const ready = (price = 20) => ({ title: 'Prato de legumes', description: 'Uma opção para buscar.',
  search_term: 'prato de legumes', servings: 2,
  ...(price === null ? {} : { estimated_price_brl: { value: price, origin: 'estimado' } }) });
const result = (minutes = 30, price = 20) => ({ version: 1, mode: 'compare',
  cook: { status: 'suggested', suggestions: [recipe(minutes)] },
  ready: { status: 'suggested', suggestions: [ready(price)] } });
const noOption = () => ({ status: 'not_suggested', reason: 'Não foi encontrada uma opção compatível.' });
const rejectAt = (fn, path) => assert.throws(fn, error => error instanceof ContractError && error.path === path);

test('custo do tempo: fórmula em centavos, inclusive hora com centavos', () => {
  for (const [minutes, rate, expected] of [[30, 50, 25], [60, 19.99, 19.99],
    [30, 19.99, 10], [15, 19.99, 5], [1, 17.99, 0.3], [240, 99999.99, 399999.96]]) {
    const cost = calculateTimeCost(minutes, rate);
    assert.equal(cost.value, expected);
    assert.equal(cost.unit, 'BRL');
    assert.equal(cost.origin, 'calculado');
    assert.equal(cost.based_on_estimates, true);
    assert.deepEqual(cost.sources.map(s => s.origin), ['estimado', 'informado']);
  }
});

test('custo do tempo: zero matemático e bordas, sem ampliar contrato de receita', () => {
  for (const minutes of [0, 1, 240]) assert.equal(calculateTimeCost(minutes, 0).value, 0);
  assert.equal(calculateTimeCost(0, 100000).value, 0);
  assert.equal(calculateTimeCost(240, 100000).value, 400000);
  assert.equal(calculateTimeCost(60, 0.01).value, 0.01);
  rejectAt(() => calculateComparison(request(), result(0)), 'output.cook.suggestions.0.total_minutes');
  rejectAt(() => calculateComparison(request({ time_minutes: 0 }), result()), 'input.time_minutes');
});

test('custo do tempo: valida tipos, inteiros, finitude, faixa e casas decimais', () => {
  for (const minutes of [-1, 241, 0.5, '30', null, undefined, NaN, Infinity, true]) {
    rejectAt(() => calculateTimeCost(minutes, 20), 'calculation.minutes');
  }
  for (const rate of [-0.01, 100000.01, 1.001, 0.009, '20', null, undefined, NaN, Infinity, true]) {
    rejectAt(() => calculateTimeCost(30, rate), 'calculation.hourly_rate_brl');
  }
});

test('custo do tempo: abaixo, acima e exatamente no meio centavo', () => {
  for (const [minutes, rate, expected] of [[29, 0.01, 0], [30, 0.01, 0.01], [31, 0.01, 0.01],
    [1, 0.29, 0], [1, 0.30, 0.01], [1, 0.31, 0.01], [90, 0.01, 0.02]]) {
    assert.equal(calculateTimeCost(minutes, rate).value, expected);
  }
});

test('comparação: valor da hora informado e tempo estimado geram custo e diferença parcial', () => {
  const data = calculateComparison(request({ hourly_rate_brl: 50 }), result(30, 40));
  assert.equal(data.hourly_rate_brl.value, 50);
  assert.equal(data.hourly_rate_brl.origin, 'informado');
  assert.equal(data.hourly_rate_brl.based_on_estimates, false);
  const cook = data.cook.alternatives[0], readyOption = data.ready.alternatives[0];
  assert.equal(cook.preparation_minutes.value, 30);
  assert.equal(cook.preparation_minutes.origin, 'estimado');
  assert.equal(cook.time_cost_brl.value, 25);
  assert.equal(readyOption.estimated_price_brl.value, 40);
  assert.equal(readyOption.estimated_price_brl.origin, 'estimado');
  assert.equal(data.partial_comparison.status, 'available');
  assert.equal(data.partial_comparison.pairs[0].difference_brl.value, 15);
  assert.equal(data.partial_comparison.scope, 'ready_price_minus_cook_time_cost');
  assert.equal(data.partial_comparison.is_total_savings, false);
  assert.deepEqual(data.partial_comparison.excluded_costs, ['cook_ingredients', 'unknown_delivery_fees']);
  assert.ok(data.partial_comparison.notice.includes('não representa economia total'));
  assert.equal(Object.hasOwn(data, 'winner'), false);
});

test('comparação: ausência da hora não introduz zero nem bloqueia tempo/preço disponíveis', () => {
  const data = calculateComparison(request(), result());
  assert.deepEqual(data.hourly_rate_brl, { status: 'unavailable', reason_codes: ['hourly_rate_not_provided'] });
  assert.equal(data.cook.alternatives[0].preparation_minutes.value, 30);
  assert.equal(data.ready.alternatives[0].estimated_price_brl.value, 20);
  assert.equal(data.cook.alternatives[0].time_cost_brl.status, 'unavailable');
  assert.equal(Object.hasOwn(data.cook.alternatives[0].time_cost_brl, 'value'), false);
  const comparison = data.partial_comparison;
  assert.equal(comparison.status, 'unavailable');
  assert.deepEqual(comparison.reason_codes, ['hourly_rate_not_provided']);
  assert.deepEqual(comparison.pairs[0].difference_brl, { status: 'unavailable', reason_codes: ['hourly_rate_not_provided'] });
});

test('comparação: hora zero é escolha explícita, distinta da ausência', () => {
  const data = calculateComparison(request({ hourly_rate_brl: 0 }), result(30, 20));
  assert.equal(data.hourly_rate_brl.status, 'available');
  assert.equal(data.hourly_rate_brl.value, 0);
  assert.equal(data.cook.alternatives[0].time_cost_brl.value, 0);
  assert.equal(data.partial_comparison.pairs[0].difference_brl.value, 20);
  assert.equal(data.partial_comparison.pairs[0].difference_brl.based_on_estimates, true);
});

test('comparação: preço ausente não é zero e não impede custo do tempo', () => {
  const data = calculateComparison(request({ hourly_rate_brl: 20, budget_brl: 50 }), result(30, null));
  assert.equal(data.cook.alternatives[0].time_cost_brl.value, 10);
  assert.deepEqual(data.ready.alternatives[0].estimated_price_brl, { status: 'unavailable', reason_codes: ['ready_price_not_provided'] });
  assert.deepEqual(data.partial_comparison.pairs[0].difference_brl.reason_codes, ['ready_price_not_provided']);
  // Orçamento informado não substitui o preço ausente.
  const missingBoth = calculateComparison(request(), result(30, null));
  assert.deepEqual(missingBoth.partial_comparison.reason_codes, ['hourly_rate_not_provided', 'ready_price_not_provided']);
});

test('comparação: um ou ambos os lados ausentes preservam motivos e não fabricam pares', () => {
  for (const missing of [['cook'], ['ready'], ['cook', 'ready']]) {
    const raw = result(); for (const side of missing) raw[side] = noOption();
    const data = calculateComparison(request({ hourly_rate_brl: 20 }), raw);
    for (const side of missing) {
      assert.deepEqual(data[side].alternatives, []);
      assert.equal(data[side].reason, raw[side].reason);
    }
    assert.equal(data.partial_comparison.status, 'unavailable');
    assert.deepEqual(data.partial_comparison.pairs, []);
    assert.deepEqual(data.partial_comparison.reason_codes, missing.map(side => `${side}_not_suggested`));
  }
});

test('comparação: cruza todas as alternativas sem escolher a primeira como vencedora', () => {
  const raw = result();
  raw.cook.suggestions = [recipe(30), recipe(60)];
  raw.ready.suggestions = [ready(20), ready(40)];
  const data = calculateComparison(request({ hourly_rate_brl: 20 }), raw);
  assert.deepEqual(data.partial_comparison.pairs.map(pair =>
    [pair.cook_reference, pair.ready_reference, pair.difference_brl.value]), [
    ['output.cook.suggestions.0', 'output.ready.suggestions.0', 10],
    ['output.cook.suggestions.0', 'output.ready.suggestions.1', 30],
    ['output.cook.suggestions.1', 'output.ready.suggestions.0', 0],
    ['output.cook.suggestions.1', 'output.ready.suggestions.1', 20],
  ]);
  assert.deepEqual(data.cook.alternatives.map(item => item.preparation_minutes.value), [30, 60]);
});

test('comparação: preço faltante em uma opção deixa somente os pares correspondentes indisponíveis', () => {
  const raw = result(); raw.cook.suggestions.push(recipe(60)); raw.ready.suggestions.push(ready(null));
  const data = calculateComparison(request({ hourly_rate_brl: 20 }), raw);
  assert.equal(data.partial_comparison.status, 'partially_available');
  assert.deepEqual(data.partial_comparison.pairs.map(pair => pair.difference_brl.status),
    ['available', 'unavailable', 'available', 'unavailable']);
  assert.deepEqual(data.partial_comparison.reason_codes, ['ready_price_not_provided']);
});

test('comparação: diferença assinada usa os centavos exibidos, sem arredondamento binário ou zero negativo', () => {
  for (const [minutes, rate, price, expected] of [[30, 0.01, 0.01, 0], [30, 19.99, 10, 0],
    [30, 19.99, 9.99, -0.01], [60, 20, 20.01, 0.01],
    [240, 100000, 0.01, -399999.99], [1, 0, 100000, 100000]]) {
    const data = calculateComparison(request({ time_minutes: 240, hourly_rate_brl: rate }), result(minutes, price));
    const difference = data.partial_comparison.pairs[0].difference_brl.value;
    assert.equal(difference, expected);
    assert.equal(Object.is(difference, -0), false);
    assert.ok(Math.abs(difference * 100 - Math.round(difference * 100)) < 1e-7);
  }
});

test('comparação: toda medida numérica traz origem e cálculos mantêm dependência transitiva de estimativa', () => {
  const data = calculateComparison(request({ hourly_rate_brl: 19.99 }), result());
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (typeof child === 'number') {
        assert.equal(key, 'value');
        assert.ok(['informado', 'estimado', 'calculado'].includes(value.origin));
        assert.equal(typeof value.based_on_estimates, 'boolean');
      } else visit(child);
    }
  }
  visit(data);
  const difference = data.partial_comparison.pairs[0].difference_brl;
  assert.equal(difference.origin, 'calculado');
  assert.equal(difference.based_on_estimates, true);
  assert.deepEqual(difference.sources.map(s => [s.origin, s.based_on_estimates]),
    [['estimado', true], ['calculado', true]]);
  assert.equal(difference.sources[1].reference, 'cook.alternatives.0.time_cost_brl');
  assert.deepEqual(data.cook.alternatives[0].time_cost_brl.sources.map(s => s.reference),
    ['output.cook.suggestions.0.total_minutes', 'input.hourly_rate_brl']);
});

test('comparação: tempo copiado continua estimado, sem fingir corrigir incoerência do texto', () => {
  const raw = result(5);
  raw.cook.suggestions[0].steps = ['Deixe de molho por oito horas.'];
  const data = calculateComparison(request({ hourly_rate_brl: 60 }), raw);
  assert.equal(data.cook.alternatives[0].preparation_minutes.value, 5);
  assert.equal(data.cook.alternatives[0].preparation_minutes.origin, 'estimado');
  assert.equal(data.cook.alternatives[0].time_cost_brl.value, 5);
});

test('comparação: valida entrada e saída inteiras, inclusive a segunda alternativa', () => {
  rejectAt(() => calculateComparison(request({ hourly_rate_brl: 1.001 }), result()), 'input.hourly_rate_brl');
  rejectAt(() => calculateComparison({ ...request(), mode: 'cook' }, result()), 'input.mode');
  rejectAt(() => calculateComparison(request(), { ...result(), ready: null }), 'output.ready');
  const raw = result(); raw.ready.suggestions.push({ ...ready(), servings: 1 });
  rejectAt(() => calculateComparison(request(), raw), 'output.ready.suggestions.1.servings');
  const third = result(); third.cook.suggestions.push(recipe(), recipe());
  rejectAt(() => calculateComparison(request(), third), 'output.cook.suggestions');
  const wrongOrigin = result(); wrongOrigin.ready.suggestions[0].estimated_price_brl.origin = 'consultado';
  rejectAt(() => calculateComparison(request(), wrongOrigin), 'output.ready.suggestions.0.estimated_price_brl.origin');
  const forged = { ...result(), partial_comparison: {} };
  rejectAt(() => calculateComparison(request(), forged), 'output.partial_comparison');
});

test('comparação: pureza, entradas congeladas, resultados independentes e sem reenvio da receita', () => {
  function freeze(value) {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  }
  const req = freeze(request({ hourly_rate_brl: 19.99 })), raw = freeze(result());
  const snapshot = JSON.stringify({ req, raw });
  const first = calculateComparison(req, raw), second = calculateComparison(req, raw);
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify({ req, raw }), snapshot);
  first.cook.alternatives[0].time_cost_brl.sources[0].origin = 'alterado';
  first.partial_comparison.excluded_costs.push('alterado');
  assert.equal(second.cook.alternatives[0].time_cost_brl.sources[0].origin, 'estimado');
  assert.equal(second.partial_comparison.excluded_costs.includes('alterado'), false);
  assert.equal(JSON.stringify(second).includes('Descasque e sirva.'), false);
});
