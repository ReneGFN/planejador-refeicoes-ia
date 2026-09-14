import { ContractError, LIMITS, UNIT_CHOICES } from './generation.js';
import { mealDate } from './meal-log.js';

export const PANTRY_LIMITS = Object.freeze({ items: LIMITS.ingredients, nameCharacters: LIMITS.ingredientCharacters, quantity: 100000 });
export const pantryInvalid = (field, message = 'valor inválido ou indisponível para esta sessão') => {
  throw new ContractError('pantry.' + field, message);
};
export function pantryId(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) pantryInvalid('id');
  return value.toLowerCase();
}
export function pantryObject(raw, fields) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) pantryInvalid('input');
  for (const key of Object.keys(raw)) if (!fields.includes(key)) pantryInvalid(key, 'campo não permitido');
  if (raw.version !== 1) pantryInvalid('version');
}
export function normalizePantryName(value) {
  if (typeof value !== 'string') pantryInvalid('name');
  const name = value.trim().normalize('NFC');
  if (!name || [...name].length > PANTRY_LIMITS.nameCharacters) pantryInvalid('name', 'use de 1 a 80 caracteres');
  return name.toLocaleLowerCase('pt-BR');
}
export function pantryRevision(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value >= Number.MAX_SAFE_INTEGER) pantryInvalid('revision');
  return value;
}
// Inteiros em milésimos para não arredondar uma baixa silenciosamente.
export function quantityMillis(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > PANTRY_LIMITS.quantity) return null;
  const scaled = value * 1000, rounded = Math.round(scaled);
  return Math.abs(scaled - rounded) <= 1e-7 ? rounded : null;
}
export function validatePantryItem(raw, { update = false } = {}) {
  pantryObject(raw, ['version', 'name', 'quantity', 'unit', 'expires_at', ...(update ? ['revision'] : [])]);
  normalizePantryName(raw.name);
  const result = { version: 1, name: raw.name.trim().normalize('NFC') };
  if (Object.hasOwn(raw, 'quantity')) {
    const scaled = quantityMillis(raw.quantity);
    if (scaled === null) pantryInvalid('quantity', 'informe de 0 a 100000, com até três casas decimais');
    result.quantity = scaled / 1000;
  }
  if (Object.hasOwn(raw, 'unit')) {
    if (!UNIT_CHOICES.includes(raw.unit)) pantryInvalid('unit');
    result.unit = raw.unit;
  }
  if (Object.hasOwn(raw, 'expires_at')) {
    if (typeof raw.expires_at !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(raw.expires_at)) pantryInvalid('expires_at');
    try { mealDate(raw.expires_at + 'T00:00:00Z', { now: Infinity }); }
    catch { pantryInvalid('expires_at', 'informe uma data de calendário válida'); }
    // Data declarada não é avaliação sanitária. Não inferir qualidade nem remover por validade.
    result.expires_at = raw.expires_at;
  }
  if (update) result.revision = pantryRevision(raw.revision);
  return result;
}
export function validatePantryDelete(raw) {
  pantryObject(raw, ['version', 'revision']); return { version: 1, revision: pantryRevision(raw.revision) };
}
export function validatePantryItems(values) {
  if (!Array.isArray(values) || values.length > PANTRY_LIMITS.items) pantryInvalid('items');
  const result = values.map(value => validatePantryItem(value));
  const seen = new Set();
  for (const item of result) {
    const name = normalizePantryName(item.name);
    if (seen.has(name)) pantryInvalid('name', 'nome duplicado após normalização');
    seen.add(name);
  }
  return result;
}
export function validateDeduction(raw) {
  pantryObject(raw, ['version', 'preview_id', 'confirmed_snapshot']);
  if (raw.confirmed_snapshot !== true) pantryInvalid('confirmed_snapshot', 'confirme os ingredientes e quantidades da prévia');
  if (typeof raw.preview_id !== 'string' || !/^[0-9a-f]{64}$/u.test(raw.preview_id)) pantryInvalid('preview_id');
  return { version: 1, preview_id: raw.preview_id, confirmed_snapshot: true };
}
