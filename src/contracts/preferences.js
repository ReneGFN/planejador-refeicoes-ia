import { ContractError, validateGenerationInput, COOKING_CONSTRAINT_FIELDS } from './generation.js';

const DEFAULT_FIELDS = ['people', 'time_minutes', 'budget_brl', 'preferences', ...COOKING_CONSTRAINT_FIELDS];
export const emptyPreferences = () => ({ version: 1, use_history: false, defaults: {} });

export function validatePreferences(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)
      || Object.keys(raw).some(key => !['version', 'use_history', 'use_pantry', 'defaults'].includes(key))
      || raw.version !== 1 || typeof raw.use_history !== 'boolean') {
    throw new ContractError('preferences', 'informe versão 1 e permissão booleana explícita');
  }
  // Campo opcional retrocompatível: ausência NÃO concede permissão para enviar a despensa.
  if (Object.hasOwn(raw, 'use_pantry') && typeof raw.use_pantry !== 'boolean') {
    throw new ContractError('preferences.use_pantry', 'informe permissão booleana explícita');
  }
  const defaults = raw.defaults;
  if (!defaults || typeof defaults !== 'object' || Array.isArray(defaults)
      || Object.keys(defaults).some(key => !DEFAULT_FIELDS.includes(key))) {
    throw new ContractError('preferences.defaults', 'informe somente preferências reutilizáveis permitidas');
  }
  // Reutilizar limites/enums atuais sem alterar o contrato de geração ou duplicar suas regras.
  const validated = validateGenerationInput({ mode: 'cook', meal: 'Preferências', people: 1,
    time_minutes: 30, ingredient_policy: 'suggest', ingredients: [], ...defaults });
  return { version: 1, use_history: raw.use_history,
    ...(Object.hasOwn(raw, 'use_pantry') ? { use_pantry: raw.use_pantry } : {}),
    defaults: Object.fromEntries(Object.keys(defaults).map(key => [key, validated[key]])) };
}
