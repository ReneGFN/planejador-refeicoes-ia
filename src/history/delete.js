import { ContractError } from '../contracts/generation.js';
import { pantryIdentity } from './pantry.js';
import { pantryId } from '../contracts/pantry.js';
import { usageReservationId } from '../security/quota.js';
import { historyUnavailable } from './revision.js';

export function validateHistoryDeletion(raw) {
  if (!raw || Array.isArray(raw) || typeof raw !== 'object'
      || Object.keys(raw).some(key => !['version', 'confirmed'].includes(key))
      || raw.version !== 1 || raw.confirmed !== true) {
    throw new ContractError('history', 'confirme explicitamente a exclusão dos dados');
  }
  return { version: 1, confirmed: true };
}

export async function deleteHistory(env, visitor, raw, key, { now = Date.now() } = {}) {
  pantryIdentity(visitor, now); validateHistoryDeletion(raw); key = pantryId(key);
  const actionKey = await usageReservationId('history_delete', visitor.visitorId, key);
  const attempt = crypto.randomUUID(), timestamp = new Date(now).toISOString();
  // Manter visitante, recibos e contadores: apagar conteúdo não cria identidade nem cota nova.
  // O recibo desta exclusão também sobrevive; mesma chave não apaga cadastros posteriores.
  const receipt = env.DB.prepare(`INSERT INTO history_deletions
    (visitor_id, action_key, attempt_id, created_at, expires_at)
    SELECT ?1, ?2, ?3, ?4, ?5 WHERE EXISTS
      (SELECT 1 FROM visitors WHERE id = ?1 AND history_revision < 9007199254740991)
      AND NOT EXISTS (SELECT 1 FROM plans p JOIN meal_logs m ON m.plan_id = p.id
        WHERE p.visitor_id = ?1 AND m.visitor_id <> ?1)
    ON CONFLICT(visitor_id, action_key) DO NOTHING`)
    .bind(visitor.visitorId, actionKey, attempt, timestamp, visitor.expiresAt);
  const won = 'EXISTS (SELECT 1 FROM history_deletions WHERE visitor_id = ?1 AND action_key = ?2 AND attempt_id = ?3)';
  const bind = sql => env.DB.prepare(sql).bind(visitor.visitorId, actionKey, attempt);
  const statements = [receipt,
    bind(`UPDATE visitors SET history_revision = history_revision + 1 WHERE id = ?1 AND ${won}`),
    // Diário antes de planos; não usar DELETE visitors, que apagaria recibos por cascata.
    ...['meal_logs', 'plans', 'preferences', 'pantry_items'].map(table =>
      bind(`DELETE FROM ${table} WHERE visitor_id = ?1 AND ${won}`))];
  const results = await env.DB.batch(statements);
  if (results.some(result => !result.success)) throw historyUnavailable();
  if (results[0].meta?.changes === 0) {
    const previous = await env.DB.prepare('SELECT action_key FROM history_deletions WHERE visitor_id = ?1 AND action_key = ?2 LIMIT 1')
      .bind(visitor.visitorId, actionKey).first();
    if (!previous) throw historyUnavailable();
  } else if (results[1].meta?.changes !== 1) throw historyUnavailable();
  // Resultado da ação original, não promessa de que ninguém cadastrou algo após a transação.
  return { version: 1, deleted: true };
}
