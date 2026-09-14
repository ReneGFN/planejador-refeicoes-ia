import { pantryId, pantryInvalid, validateDeduction } from '../contracts/pantry.js';
import { restoreMeal } from './meal-logs.js';
import { pantryIdentity, pantryUnavailable, listPantry, pantryReceipt, duplicatePantry } from './pantry.js';
import { planPantryDeduction } from '../pantry/deduction.js';
import { usageReservationId } from '../security/quota.js';
import { captureHistoryRevision, historyGuard } from './revision.js';

async function prepareDeduction(env, visitor, id, now) {
  const row = await env.DB.prepare(`SELECT m.id, p.id AS plan_id, m.eaten_at, m.data_json, m.created_at, m.updated_at, m.expires_at
    FROM meal_logs m LEFT JOIN plans p ON p.id = m.plan_id AND p.visitor_id = ?1
    WHERE m.visitor_id = ?1 AND m.id = ?2 AND m.expires_at > ?3 LIMIT 1`)
    .bind(visitor.visitorId, id, new Date(now).toISOString()).first();
  if (!row) pantryInvalid('meal_log_id');
  const meal = restoreMeal(row, now), pantry = await listPantry(env, visitor, { now });
  const report = planPantryDeduction(meal, pantry);
  // Impressão de versão, não autorização: dono/sessão continuam obrigatórios. Sem salvar o conteúdo do relatório.
  const preview_id = await usageReservationId('pantry_preview_v1', visitor.visitorId, JSON.stringify({ row, pantry }));
  return { row, report, preview_id };
}
export async function previewPantryDeduction(env, visitor, id, { now = Date.now() } = {}) {
  pantryIdentity(visitor, now); id = pantryId(id);
  const previous = await pantryReceipt(env, visitor, '', id);
  if (previous) return { status: 'already_applied', receipt: duplicatePantry(previous).receipt };
  const { report, preview_id } = await prepareDeduction(env, visitor, id, now);
  return { ...report, preview_id, meal_log_id: id,
    notice: 'Confira se usou estes ingredientes e quantidades. A sugestão original não comprova o preparo. Itens ignorados não serão descontados.' };
}
export async function applyPantryDeduction(env, visitor, id, raw, key, { now = Date.now() } = {}) {
  pantryIdentity(visitor, now); id = pantryId(id); key = pantryId(key);
  const historyRevision = await captureHistoryRevision(env, visitor);
  const input = validateDeduction(raw);
  const actionKey = await usageReservationId('pantry', visitor.visitorId, key);
  const previous = await pantryReceipt(env, visitor, actionKey, id);
  if (previous) return duplicatePantry(previous);
  const prepared = await prepareDeduction(env, visitor, id, now);
  // Outra confirmação pode ter terminado durante as leituras; devolva recibo, não erro de prévia velha.
  const completed = await pantryReceipt(env, visitor, actionKey, id);
  if (completed) return duplicatePantry(completed);
  if (prepared.preview_id !== input.preview_id) pantryInvalid('preview_id', 'dados alterados; consulte e confirme uma nova prévia');
  const eligible = prepared.report.items.filter(item => item.status === 'eligible');
  if (!eligible.length) return { duplicate: false, data: { applied: false, ...prepared.report } };
  const attempt = crypto.randomUUID(), timestamp = new Date(now).toISOString();
  const args = [visitor.visitorId, actionKey, id, attempt, eligible.length, timestamp, visitor.expiresAt,
    prepared.row.data_json, prepared.row.eaten_at, prepared.row.updated_at];
  const bind = value => { args.push(value); return '?' + args.length; };
  // Revalidar a refeição e todas as revisões dentro da transação: nenhuma baixa parcial por estado obsoleto.
  let condition = `EXISTS (SELECT 1 FROM meal_logs WHERE visitor_id = ?1 AND id = ?3 AND expires_at > ?6
    AND data_json = ?8 AND eaten_at = ?9 AND updated_at = ?10)`;
  for (const item of eligible) condition += ` AND EXISTS (SELECT 1 FROM pantry_items WHERE visitor_id = ?1
    AND id = ${bind(item.pantry_item_id)} AND revision = ${bind(item.revision)})`;
  condition += ' AND ' + historyGuard(bind(historyRevision));
  const receipt = env.DB.prepare(`INSERT INTO pantry_mutations
    (visitor_id, action_key, operation, target_id, attempt_id, applied_count, created_at, expires_at)
    SELECT ?1, ?2, 'deduct', ?3, ?4, ?5, ?6, ?7 WHERE ${condition} ON CONFLICT DO NOTHING`).bind(...args);
  const statements = eligible.map(item => env.DB.prepare(`UPDATE pantry_items SET quantity = ?5, revision = revision + 1
    WHERE visitor_id = ?1 AND id = ?4 AND revision = ?6 AND EXISTS
      (SELECT 1 FROM pantry_mutations WHERE visitor_id = ?1 AND action_key = ?2 AND attempt_id = ?3)`)
    .bind(visitor.visitorId, actionKey, attempt, item.pantry_item_id, item.quantity_after, item.revision));
  const results = await env.DB.batch([receipt, ...statements]);
  if (results.some(result => !result.success)) throw pantryUnavailable();
  if (results[0].meta?.changes === 0) {
    const existing = await pantryReceipt(env, visitor, actionKey, id);
    if (existing) return duplicatePantry(existing);
    pantryInvalid('preview_id', 'dados alterados; consulte e confirme uma nova prévia');
  }
  if (results.slice(1).some(result => result.meta?.changes !== 1)) throw pantryUnavailable();
  // Uma baixa por refeição, mesmo com outra chave. Edição/exclusão do diário não repõe estoque automaticamente.
  // Saldo zero permanece cadastrado; validade não decide baixa nem julgamento sanitário.
  return { duplicate: false, data: { applied: true, meal_log_id: id, applied_count: eligible.length,
    items: prepared.report.items.map(item => item.status === 'eligible' ? { ...item, status: 'deducted' } : item) } };
}
