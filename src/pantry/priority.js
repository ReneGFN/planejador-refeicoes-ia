import { normalizePantryName, validatePantryItem } from '../contracts/pantry.js';

export const PANTRY_CONTEXT_LIMITS = Object.freeze({ items: 4, sharedCharacters: 400, soloCharacters: 800 });
const compareText = (a, b) => a < b ? -1 : a > b ? 1 : 0;

// A data informada pela pessoa define apenas ordem, nunca julgamento sanitário.
// Não afirmar alimento bom/estragado/seguro/impróprio nem orientar conservação, validade ou saúde.
// Datas civis YYYY-MM-DD não passam pelo fuso local; ontem permanece antes de hoje, sem descarte automático.
export function prioritizePantry(rows, input) {
  if (input.mode !== 'cook') return [];
  const allowed = new Set((input.ingredients ?? []).map(normalizePantryName));
  const candidates = [];
  for (const row of rows) {
    try {
      const item = validatePantryItem({ version: 1, name: row.name,
        ...(row.quantity !== undefined ? { quantity: row.quantity } : {}),
        ...(row.unit !== undefined ? { unit: row.unit } : {}),
        ...(row.expires_at !== undefined ? { expires_at: row.expires_at } : {}) });
      const name = normalizePantryName(item.name);
      if (item.quantity === 0 || (input.ingredient_policy === 'only_available' && !allowed.has(name))) continue;
      candidates.push({ item, name, id: typeof row.id === 'string' ? row.id : '' });
    } catch {
      // Registro inválido não vira alimento sem data e nunca recebe data inventada.
    }
  }
  return candidates.sort((a, b) => compareText(a.item.expires_at ?? '9999-99-99', b.item.expires_at ?? '9999-99-99')
    || compareText(a.name, b.name) || compareText(a.id, b.id))
    .slice(0, PANTRY_CONTEXT_LIMITS.items).map(({ item: { version, ...item } }) => item);
}
