// Cálculos puros de compare. Sem rede, persistência, relógio ou adaptador de IA.
import { ContractError, LIMITS, validateGenerationInput, validateGenerationOutput } from '../contracts/generation.js';

const unavailable = (...reason_codes) => ({ status: 'unavailable', reason_codes });
const measurement = (value, unit, origin, sources = []) => ({
  status: 'available', value, unit, origin,
  based_on_estimates: origin === 'estimado' || sources.some(source => source.based_on_estimates),
  sources,
});
const source = (reference, metric) => ({
  reference, origin: metric.origin, based_on_estimates: metric.based_on_estimates,
});
const direct = (value, unit, origin, reference) =>
  measurement(value, unit, origin, [{ reference, origin, based_on_estimates: origin === 'estimado' }]);
const cents = value => Math.round(value * 100);

function validateTimeCostInput(minutes, hourlyRateBrl) {
  // Zero é válido na função matemática, não altera o mínimo de um minuto da receita.
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > LIMITS.minutes) {
    throw new ContractError('calculation.minutes', `use minutos inteiros entre 0 e ${LIMITS.minutes}`);
  }
  if (typeof hourlyRateBrl !== 'number' || !Number.isFinite(hourlyRateBrl)
      || hourlyRateBrl < 0 || hourlyRateBrl > LIMITS.hourlyRateBrl
      || Math.abs(hourlyRateBrl * 100 - cents(hourlyRateBrl)) > 1e-7) {
    throw new ContractError('calculation.hourly_rate_brl', `use de 0 a ${LIMITS.hourlyRateBrl} reais por hora, com até duas casas decimais`);
  }
}

// Resultado monetário arredondado em centavos; não mede o tempo real de uma receita.
export function calculateTimeCost(minutes, hourlyRateBrl) {
  validateTimeCostInput(minutes, hourlyRateBrl);
  // Numerador inteiro: no teto atual, 240 * 10.000.000 = 2.400.000.000,
  // dentro dos inteiros exatos de Number. Meio centavo arredonda para cima.
  const costCents = Math.floor((minutes * cents(hourlyRateBrl) + 30) / 60);
  return measurement(costCents / 100, 'BRL', 'calculado', [
    { reference: 'minutes', origin: 'estimado', based_on_estimates: true },
    { reference: 'hourly_rate_brl', origin: 'informado', based_on_estimates: false },
  ]);
}

// Entrada e toda a saída da LLM passam novamente pelo contrato antes de calcular.
// Retorna somente métricas com origem, referências e indisponibilidades explícitas;
// não reenvia as receitas nem acrescenta campos ao contrato de saída da geração.
export function calculateComparison(rawInput, rawOutput) {
  const input = validateGenerationInput(rawInput);
  if (input.mode !== 'compare') throw new ContractError('input.mode', 'use compare para calcular a comparação');
  const output = validateGenerationOutput(rawOutput, input);
  const hourlyRate = Object.hasOwn(input, 'hourly_rate_brl')
    ? direct(input.hourly_rate_brl, 'BRL/hour', 'informado', 'input.hourly_rate_brl')
    : unavailable('hourly_rate_not_provided');

  const cook = output.cook.status === 'not_suggested'
    ? { status: 'not_suggested', reason: output.cook.reason, alternatives: [] }
    : { status: 'suggested', alternatives: output.cook.suggestions.map((item, index) => {
      const reference = `output.cook.suggestions.${index}`;
      const preparationMinutes = direct(item.total_minutes, 'minute', 'estimado', `${reference}.total_minutes`);
      let timeCost = unavailable('hourly_rate_not_provided');
      if (hourlyRate.status === 'available') {
        timeCost = calculateTimeCost(item.total_minutes, hourlyRate.value);
        timeCost.sources = [source(`${reference}.total_minutes`, preparationMinutes), source('input.hourly_rate_brl', hourlyRate)];
      }
      return { reference, preparation_minutes: preparationMinutes, time_cost_brl: timeCost };
    }) };

  const ready = output.ready.status === 'not_suggested'
    ? { status: 'not_suggested', reason: output.ready.reason, alternatives: [] }
    : { status: 'suggested', alternatives: output.ready.suggestions.map((item, index) => {
      const reference = `output.ready.suggestions.${index}`;
      const price = Object.hasOwn(item, 'estimated_price_brl')
        ? direct(cents(item.estimated_price_brl.value) / 100, 'BRL', 'estimado', `${reference}.estimated_price_brl.value`)
        : unavailable('ready_price_not_provided');
      return { reference, estimated_price_brl: price };
    }) };

  const pairs = [];
  for (const cookOption of cook.alternatives) for (const readyOption of ready.alternatives) {
    const cost = cookOption.time_cost_brl, price = readyOption.estimated_price_brl;
    const reasons = [];
    if (cost.status === 'unavailable') reasons.push(...cost.reason_codes);
    if (price.status === 'unavailable') reasons.push(...price.reason_codes);
    const difference = reasons.length ? unavailable(...reasons)
      : measurement((cents(price.value) - cents(cost.value)) / 100, 'BRL', 'calculado', [
        source(`${readyOption.reference}.estimated_price_brl.value`, price),
        source(`cook.alternatives.${cook.alternatives.indexOf(cookOption)}.time_cost_brl`, cost),
      ]);
    pairs.push({ cook_reference: cookOption.reference, ready_reference: readyOption.reference, difference_brl: difference });
  }
  const sideReasons = [];
  if (cook.status === 'not_suggested') sideReasons.push('cook_not_suggested');
  if (ready.status === 'not_suggested') sideReasons.push('ready_not_suggested');
  const availablePairs = pairs.filter(pair => pair.difference_brl.status === 'available').length;
  const reasons = [...new Set([...sideReasons, ...pairs.flatMap(pair => pair.difference_brl.reason_codes ?? [])])];
  return {
    hourly_rate_brl: hourlyRate, cook, ready,
    partial_comparison: {
      status: !availablePairs ? 'unavailable' : availablePairs === pairs.length ? 'available' : 'partially_available',
      scope: 'ready_price_minus_cook_time_cost',
      is_total_savings: false,
      excluded_costs: ['cook_ingredients', 'unknown_delivery_fees'],
      notice: 'Diferença parcial: preço estimado da refeição pronta menos custo do tempo de preparo. Não inclui ingredientes nem taxas de entrega desconhecidas e não representa economia total.',
      reason_codes: reasons, pairs,
    },
  };
}
