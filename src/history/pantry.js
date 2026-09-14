import { PANTRY_LIMITS, pantryId, pantryInvalid, pantryRevision, normalizePantryName, validatePantryItem, validatePantryDelete, validatePantryItems } from '../contracts/pantry.js';
import { usageReservationId } from '../security/quota.js';
import { captureHistoryRevision, historyGuard } from './revision.js';

export const pantryUnavailable = () => new Error('A despensa está temporariamente indisponível.');
export function pantryIdentity(visitor, now = Date.now()) {
  if (!visitor || pantryId(visitor.visitorId) !== visitor.visitorId || !(Date.parse(visitor.expiresAt) > now)) throw pantryUnavailable();
}
function restoreItem(row) {
  try {
    const item = validatePantryItem({ version: 1, name: row.name,
      ...(row.quantity === null ? {} : { quantity: row.quantity }),
      ...(row.unit === null ? {} : { unit: row.unit }),
      ...(row.expires_at === null ? {} : { expires_at: row.expires_at }) });
    if (row.normalized_name !== normalizePantryName(item.name)) throw pantryUnavailable();
    return { id: pantryId(row.id), ...item, added_at: row.added_at, revision: pantryRevision(row.revision) };
  } catch { throw pantryUnavailable(); }
}
export async function listPantry(env, visitor, { now = Date.now() } = {}) {
  pantryIdentity(visitor, now);
  const result = await env.DB.prepare(`SELECT id, name, normalized_name, quantity, unit, added_at, expires_at, revision
    FROM pantry_items WHERE visitor_id = ?1 ORDER BY added_at DESC, id ASC LIMIT ?2`)
    .bind(visitor.visitorId, PANTRY_LIMITS.items + 1).all();
  if (!result.success || !Array.isArray(result.results)) throw pantryUnavailable();
  const items = result.results.map(restoreItem);
  // Não truncar silenciosamente uma despensa inconsistente nem aceitar duplicatas vindas de linha inválida.
  try { validatePantryItems(items.map(({ id, added_at, revision, ...item }) => item)); }
  catch { throw pantryUnavailable(); }
  return items;
}
export async function getPantryItem(env, visitor, id, { now = Date.now() } = {}) {
  pantryIdentity(visitor, now); id = pantryId(id);
  const row = await env.DB.prepare(`SELECT id, name, normalized_name, quantity, unit, added_at, expires_at, revision
    FROM pantry_items WHERE visitor_id = ?1 AND id = ?2 LIMIT 1`).bind(visitor.visitorId, id).first();
  if (!row) pantryInvalid('id');
  return restoreItem(row);
}
export async function pantryReceipt(env, visitor, key, mealId = null) {
  return env.DB.prepare(`SELECT operation, target_id, applied_count FROM pantry_mutations
    WHERE visitor_id = ?1 AND (action_key = ?2 OR (operation = 'deduct' AND target_id = ?3))
    ORDER BY CASE WHEN action_key = ?2 THEN 0 ELSE 1 END LIMIT 1`)
    .bind(visitor.visitorId, key, mealId).first();
}
export const duplicatePantry = row => ({ duplicate: true,
  receipt: { operation: row.operation, target_id: row.target_id, applied_count: row.applied_count } });

export async function mutatePantry(env, visitor, operation, id, raw, key, { now = Date.now() } = {}) {
  pantryIdentity(visitor, now); key = pantryId(key);
  const historyRevision = await captureHistoryRevision(env, visitor);
  const input = operation === 'delete' ? validatePantryDelete(raw)
    : validatePantryItem(raw, { update: operation === 'update' });
  if (!['create', 'update', 'delete'].includes(operation)) pantryInvalid('operation');
  const actionKey = await usageReservationId('pantry', visitor.visitorId, key);
  const existing = await pantryReceipt(env, visitor, actionKey);
  if (existing) return duplicatePantry(existing);
  const target = operation === 'create' ? crypto.randomUUID() : pantryId(id), attempt = crypto.randomUUID();
  const timestamp = new Date(now).toISOString();
  const args = [visitor.visitorId, actionKey, operation, target, attempt, 1, timestamp, visitor.expiresAt];
  const bind = value => { args.push(value); return '?' + args.length; };
  let eligible;
  if (operation === 'create') {
    eligible = `(SELECT COUNT(*) FROM pantry_items WHERE visitor_id = ?1) < ${bind(PANTRY_LIMITS.items)}
      AND NOT EXISTS (SELECT 1 FROM pantry_items WHERE visitor_id = ?1 AND normalized_name = ${bind(normalizePantryName(input.name))})`;
  } else {
    eligible = `EXISTS (SELECT 1 FROM pantry_items WHERE visitor_id = ?1 AND id = ?4 AND revision = ${bind(input.revision)})`;
    if (operation === 'update') eligible += ` AND NOT EXISTS
      (SELECT 1 FROM pantry_items WHERE visitor_id = ?1 AND id <> ?4 AND normalized_name = ${bind(normalizePantryName(input.name))})`;
  }
  const insertReceipt = env.DB.prepare(`INSERT INTO pantry_mutations
    (visitor_id, action_key, operation, target_id, attempt_id, applied_count, created_at, expires_at)
    SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8 WHERE ${eligible}
      AND ${historyGuard(bind(historyRevision))} ON CONFLICT DO NOTHING`).bind(...args);
  const won = 'EXISTS (SELECT 1 FROM pantry_mutations WHERE visitor_id = ?1 AND action_key = ?2 AND attempt_id = ?3)';
  let mutation;
  if (operation === 'delete') {
    mutation = env.DB.prepare(`DELETE FROM pantry_items WHERE visitor_id = ?1 AND id = ?4 AND ${won}`)
      .bind(visitor.visitorId, actionKey, attempt, target);
  } else {
    const common = [visitor.visitorId, actionKey, attempt, target, input.name, normalizePantryName(input.name),
      input.quantity ?? null, input.unit ?? null, input.expires_at ?? null];
    mutation = operation === 'create'
      ? env.DB.prepare(`INSERT INTO pantry_items (visitor_id, id, name, normalized_name, quantity, unit, expires_at, added_at)
          SELECT ?1, ?4, ?5, ?6, ?7, ?8, ?9, ?10 WHERE ${won}`).bind(...common, timestamp)
      : env.DB.prepare(`UPDATE pantry_items SET name = ?5, normalized_name = ?6, quantity = ?7, unit = ?8,
          expires_at = ?9, revision = revision + 1 WHERE visitor_id = ?1 AND id = ?4 AND ${won}`).bind(...common);
  }
  const results = await env.DB.batch([insertReceipt, mutation]);
  if (results.some(result => !result.success)) throw pantryUnavailable();
  if (results[0].meta?.changes === 0) {
    const previous = await pantryReceipt(env, visitor, actionKey);
    if (previous) return duplicatePantry(previous);
    pantryInvalid('item', 'confira nome duplicado, limite de itens ou revisão desatualizada');
  }
  if (results[1].meta?.changes !== 1) throw pantryUnavailable();
  return { duplicate: false, data: { id: target, operation, applied: true } };
}
