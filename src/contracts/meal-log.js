import { ContractError, LIMITS, UNIT_CHOICES } from './generation.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const invalid = (field, message = 'valor inválido') => { throw new ContractError('meal_log.' + field, message); };
export function mealId(value) {
  if (typeof value !== 'string' || !UUID.test(value)) invalid('id', 'informe UUID v4');
  return value.toLowerCase();
}
function object(raw, fields) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) invalid('input', 'informe um objeto');
  for (const key of Object.keys(raw)) if (!fields.includes(key)) invalid(key, 'campo não permitido');
  if (raw.version !== 1) invalid('version', 'informe versão 1');
}
function description(value) {
  if (typeof value !== 'string' || !value.trim() || [...value.trim()].length > LIMITS.preferencesCharacters) {
    invalid('description', 'use de 1 a 400 caracteres');
  }
  return value.trim();
}
// Exige fuso e calendário real; Date.parse sozinho normaliza 30 de fevereiro silenciosamente.
export function mealDate(value, { now = Date.now() } = {}) {
  const parts = typeof value === 'string'
    ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/u.exec(value) : null;
  if (!parts) invalid('eaten_at', 'informe data e hora com fuso');
  const [, y, m, d, h, minute, second, zone] = parts;
  const year = Number(y), month = Number(m), day = Number(d);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]
      || Number(h) > 23 || Number(minute) > 59 || Number(second) > 59
      || (zone !== 'Z' && (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4)) > 59))) invalid('eaten_at');
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || timestamp > now || timestamp < -62135596800000) {
    invalid('eaten_at', 'informe consumo ocorrido, não data futura');
  }
  return new Date(timestamp).toISOString();
}
function servings(raw) {
  if (!Object.hasOwn(raw, 'servings_consumed')) return {};
  const value = raw.servings_consumed;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > LIMITS.people) {
    invalid('servings_consumed', 'informe quantidade maior que zero e até 20');
  }
  return { servings_consumed: value };
}
export function validateMealCreate(raw, options) {
  const common = ['version', 'source', 'eaten_at', 'confirmed_consumed', 'servings_consumed'];
  object(raw, raw?.source === 'manual' ? [...common, 'description']
    : [...common, 'plan_id', 'side', 'suggestion_index']);
  if (raw.confirmed_consumed !== true) invalid('confirmed_consumed', 'confirme explicitamente que consumiu');
  const result = { version: 1, source: raw.source, eaten_at: mealDate(raw.eaten_at, options), ...servings(raw) };
  if (raw.source === 'manual') return { ...result, description: description(raw.description) };
  if (raw.source !== 'plan_suggestion') invalid('source');
  if (!['cook', 'ready'].includes(raw.side)) invalid('side');
  if (!Number.isInteger(raw.suggestion_index) || raw.suggestion_index < 0 || raw.suggestion_index >= LIMITS.suggestions) invalid('suggestion_index');
  return { ...result, plan_id: mealId(raw.plan_id), side: raw.side, suggestion_index: raw.suggestion_index };
}
export function validateMealUpdate(raw, options) {
  object(raw, ['version', 'description', 'eaten_at', 'servings_consumed']);
  return { version: 1, description: description(raw.description), eaten_at: mealDate(raw.eaten_at, options), ...servings(raw) };
}
export function validateMealRatingUpdate(raw) {
  object(raw, ['version', 'rating']);
  if (!Object.hasOwn(raw, 'rating')) invalid('rating', 'informe uma nota de 1 a 5 ou null para remover');
  if (raw.rating !== null && (!Number.isInteger(raw.rating) || raw.rating < 1 || raw.rating > 5)) {
    invalid('rating', 'informe inteiro de 1 a 5 ou null para remover');
  }
  return { version: 1, rating: raw.rating };
}
export function validateMealDelete(raw) { object(raw, ['version']); return { version: 1 }; }

export function validateMealQuery(searchParams, options) {
  const entries = [...searchParams];
  if (entries.some(([key]) => !['limit', 'before', 'before_id'].includes(key))
      || new Set(entries.map(([key]) => key)).size !== entries.length) invalid('query');
  const value = searchParams.get('limit') ?? '20';
  if (!/^[1-9]\d?$/u.test(value) || Number(value) > 50) invalid('limit', 'use de 1 a 50');
  if (searchParams.has('before') !== searchParams.has('before_id')) invalid('cursor');
  return { limit: Number(value), ...(searchParams.has('before') ? {
    before: mealDate(searchParams.get('before'), options), before_id: mealId(searchParams.get('before_id')),
  } : {}) };
}
// Instantâneo mínimo: nunca copiar passos, preço, comparação, descrição de delivery ou receita enviada pelo cliente.
export function mealSnapshot(raw) {
  if (!raw || typeof raw !== 'object' || !['cook', 'ready'].includes(raw.side)
      || typeof raw.title !== 'string' || !raw.title.trim() || [...raw.title].length > 100
      || !Number.isInteger(raw.servings) || raw.servings < 1 || raw.servings > LIMITS.people) invalid('snapshot');
  const result = { side: raw.side, title: raw.title, servings: raw.servings };
  if (raw.side === 'cook') {
    if (!Array.isArray(raw.ingredients) || !raw.ingredients.length || raw.ingredients.length > LIMITS.ingredients) invalid('snapshot.ingredients');
    result.ingredients = raw.ingredients.map(item => {
      if (!item || typeof item.name !== 'string' || !item.name.trim() || [...item.name].length > LIMITS.ingredientCharacters
          || typeof item.quantity !== 'number' || !Number.isFinite(item.quantity) || item.quantity < 0.001 || item.quantity > 100000
          || !UNIT_CHOICES.includes(item.unit)) invalid('snapshot.ingredients');
      return { name: item.name, quantity: item.quantity, unit: item.unit };
    });
  }
  return result;
}
