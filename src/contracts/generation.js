// Contrato interno v1. Sem chamadas de rede, persistência ou ativação da IA.
export class ContractError extends Error {
  constructor(path, message) {
    super(`${path}: ${message}`);
    this.name = 'ContractError';
    this.path = path;
  }
}

export const LIMITS = Object.freeze({
  mealCharacters: 80, people: 20, minutes: 240,
  ingredients: 40, ingredientCharacters: 80,
  preferencesCharacters: 400, budgetBrl: 100000,
  suggestions: 3, steps: 20, maxDishes: 20,
  compareSuggestions: 2, hourlyRateBrl: 100000, estimatedPriceBrl: 100000, reasonCharacters: 500,
});

export const EQUIPMENT_CHOICES = Object.freeze(['airfryer', 'microondas', 'fogao', 'forno', 'panela_de_pressao']);
export const UNIT_CHOICES = Object.freeze(['g', 'kg', 'ml', 'l', 'unit', 'teaspoon', 'tablespoon', 'cup', 'pinch']);
export const COOKING_CONSTRAINT_FIELDS = Object.freeze(['equipment', 'avoid_equipment', 'max_dishes']);

function fail(path, message) { throw new ContractError(path, message); }
function object(value, keys, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'deve ser objeto');
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) fail(`${path}.${key}`, 'campo não permitido');
  }
}
function text(value, max, path) {
  if (typeof value !== 'string') fail(path, 'deve ser texto');
  const normalized = value.trim();
  if (!normalized || [...normalized].length > max) fail(path, `use de 1 a ${max} caracteres`);
  return normalized;
}
function number(value, min, max, path, integer = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    fail(path, `número${integer ? ' inteiro' : ''} entre ${min} e ${max}`);
  }
  return value;
}
function choice(value, choices, path) {
  if (!choices.includes(value)) fail(path, `use ${choices.join(' ou ')}`);
  return value;
}
function list(value, min, max, path) {
  if (!Array.isArray(value) || value.length < min || value.length > max) fail(path, `lista com ${min} a ${max} itens`);
  return value;
}

export function validateGenerationInput(raw) {
  const mode = choice(raw?.mode, ['cook', 'ready', 'compare'], 'input.mode');
  const hasCooking = mode === 'cook' || mode === 'compare';
  object(raw, ['mode', 'meal', 'people', 'budget_brl', 'preferences', ...(hasCooking ? ['time_minutes', 'ingredients', 'ingredient_policy', ...COOKING_CONSTRAINT_FIELDS] : []), ...(mode === 'compare' ? ['hourly_rate_brl'] : [])], 'input');
  const result = {
    mode,
    meal: text(raw.meal, LIMITS.mealCharacters, 'input.meal'),
    people: number(raw.people, 1, LIMITS.people, 'input.people', true),
  };
  if (Object.hasOwn(raw, 'budget_brl')) {
    result.budget_brl = number(raw.budget_brl, 0.01, LIMITS.budgetBrl, 'input.budget_brl');
    if (Math.abs(raw.budget_brl * 100 - Math.round(raw.budget_brl * 100)) > 1e-7) fail('input.budget_brl', 'use até duas casas decimais');
  }
  if (Object.hasOwn(raw, 'preferences')) result.preferences = text(raw.preferences, LIMITS.preferencesCharacters, 'input.preferences');
  if (mode === 'compare' && Object.hasOwn(raw, 'hourly_rate_brl')) {
    result.hourly_rate_brl = money(raw.hourly_rate_brl, 0, LIMITS.hourlyRateBrl, 'input.hourly_rate_brl');
  }
  if (hasCooking) {
    result.time_minutes = number(raw.time_minutes, 1, LIMITS.minutes, 'input.time_minutes', true);
    result.ingredient_policy = choice(raw.ingredient_policy, ['only_available', 'can_buy_missing', 'suggest'], 'input.ingredient_policy');
    // suggest é a resposta explícita “Pode sugerir ingredientes”, não um campo esquecido.
    result.ingredients = list(raw.ingredients, result.ingredient_policy === 'suggest' ? 0 : 1, LIMITS.ingredients, 'input.ingredients')
      .map((item, i) => text(item, LIMITS.ingredientCharacters, `input.ingredients.${i}`));
    if (result.ingredient_policy === 'suggest' && result.ingredients.length) fail('input.ingredients', 'deve estar vazia quando a política é suggest');
    const unique = new Set(result.ingredients.map(item => item.normalize('NFC').toLocaleLowerCase('pt-BR')));
    if (unique.size !== result.ingredients.length) fail('input.ingredients', 'remova ingredientes duplicados');
    Object.assign(result, validateCookingConstraints(raw));
  }
  return result;
}

// Recorte interno de campos, não substitui validateGenerationInput.
// compare e cook reutilizam as mesmas regras; ready não aceita essas opções.
export function validateCookingConstraints(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('input', 'deve ser objeto');
  const result = {};
  for (const field of ['equipment', 'avoid_equipment']) {
    if (!Object.hasOwn(raw, field)) continue;
    const path = `input.${field}`;
    const values = list(raw[field], 0, EQUIPMENT_CHOICES.length, path);
    const seen = new Set();
    result[field] = [];
    // Iterar posições também rejeita buracos em arrays, sem normalizar enums.
    for (const [index, value] of values.entries()) {
      choice(value, EQUIPMENT_CHOICES, `${path}.${index}`);
      if (seen.has(value)) fail(`${path}.${index}`, 'remova equipamentos duplicados');
      seen.add(value); result[field].push(value);
    }
  }
  for (const [index, value] of (result.avoid_equipment ?? []).entries()) {
    if (result.equipment?.includes(value)) fail(`input.avoid_equipment.${index}`, 'equipamento também consta como disponível');
  }
  if (Object.hasOwn(raw, 'max_dishes')) result.max_dishes = number(raw.max_dishes, 0, LIMITS.maxDishes, 'input.max_dishes', true);
  return result;
}

// Metadados de tokens/modelo serão adicionados pelo servidor a partir do provedor,
// nunca aceitos como verdade porque a LLM os escreveu no conteúdo.
export function validateGenerationOutput(raw, input) {
  const request = validateGenerationInput(input);
  if (request.mode === 'compare') {
    object(raw, ['version', 'mode', 'cook', 'ready'], 'output');
    if (raw.version !== 1) fail('output.version', 'versão esperada: 1');
    if (raw.mode !== 'compare') fail('output.mode', 'deve corresponder ao pedido');
    return { version: 1, mode: 'compare',
      cook: compareSide(raw.cook, request, 'cook'),
      ready: compareSide(raw.ready, request, 'ready') };
  }
  object(raw, ['version', 'mode', 'suggestions'], 'output');
  if (raw.version !== 1) fail('output.version', 'versão esperada: 1');
  if (raw.mode !== request.mode) fail('output.mode', 'deve corresponder ao pedido');
  const suggestions = list(raw.suggestions, 1, LIMITS.suggestions, 'output.suggestions')
    .map((item, i) => suggestion(item, request, request.mode, `output.suggestions.${i}`));
  return { version: 1, mode: request.mode, suggestions };
}

function compareSide(raw, request, mode) {
  const path = `output.${mode}`;
  object(raw, ['status', 'suggestions', 'reason'], path);
  const status = choice(raw.status, ['suggested', 'not_suggested'], `${path}.status`);
  if (status === 'not_suggested') {
    // O transporte estrito usa null; a forma canônica omite o campo inativo.
    // Só null é ausência explícita: não limpar lista vazia, undefined ou conteúdo.
    if (Object.hasOwn(raw, 'suggestions') && raw.suggestions !== null) fail(`${path}.suggestions`, 'campo inativo deve ser null ou omitido');
    return { status, reason: text(raw.reason, LIMITS.reasonCharacters, `${path}.reason`) };
  }
  if (Object.hasOwn(raw, 'reason') && raw.reason !== null) fail(`${path}.reason`, 'campo inativo deve ser null ou omitido');
  return { status, suggestions: Array.from(list(raw.suggestions, 1, LIMITS.compareSuggestions, `${path}.suggestions`),
    (item, i) => suggestion(item, request, mode, `${path}.suggestions.${i}`, mode === 'ready')) };
}

// Mesmas regras de receita/busca dos modos isolados, com caminhos de erro do lado.
// Preço rotulado é permitido somente no lado ready de compare.
function suggestion(item, request, mode, path, allowPrice = false) {
  if (mode === 'ready') {
    object(item, ['title', 'description', 'search_term', 'servings', ...(allowPrice ? ['estimated_price_brl'] : [])], path);
    return {
      title: text(item.title, 100, `${path}.title`),
      description: text(item.description, 500, `${path}.description`),
      search_term: text(item.search_term, 120, `${path}.search_term`),
      servings: servings(item.servings, request, path),
      ...(allowPrice && Object.hasOwn(item, 'estimated_price_brl') && item.estimated_price_brl !== null
        ? { estimated_price_brl: estimatedPrice(item.estimated_price_brl, `${path}.estimated_price_brl`) } : {}),
    };
  }
  object(item, ['title', 'servings', 'total_minutes', 'ingredients', 'steps'], path);
  return {
    title: text(item.title, 100, `${path}.title`),
    servings: servings(item.servings, request, path),
    total_minutes: number(item.total_minutes, 1, request.time_minutes, `${path}.total_minutes`, true),
    ingredients: list(item.ingredients, 1, LIMITS.ingredients, `${path}.ingredients`).map((ingredient, j) => {
      const p = `${path}.ingredients.${j}`;
      object(ingredient, ['name', 'quantity', 'unit'], p);
      return {
        name: text(ingredient.name, LIMITS.ingredientCharacters, `${p}.name`),
        quantity: number(ingredient.quantity, 0.001, 100000, `${p}.quantity`),
        unit: choice(ingredient.unit, UNIT_CHOICES, `${p}.unit`),
      };
    }),
    steps: list(item.steps, 1, LIMITS.steps, `${path}.steps`).map((step, j) => text(step, 600, `${path}.steps.${j}`)),
  };
}

function money(value, min, max, path) {
  number(value, min, max, path);
  if (Math.abs(value * 100 - Math.round(value * 100)) > 1e-7) fail(path, 'use até duas casas decimais');
  return value;
}

function estimatedPrice(raw, path) {
  object(raw, ['value', 'origin'], path);
  return { value: money(raw.value, 0.01, LIMITS.estimatedPriceBrl, `${path}.value`),
    origin: choice(raw.origin, ['estimado'], `${path}.origin`) };
}

function servings(value, input, path) {
  if (value !== input.people) fail(`${path}.servings`, 'deve corresponder ao número de pessoas');
  return value;
}
