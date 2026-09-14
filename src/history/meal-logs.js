import { ContractError } from '../contracts/generation.js';
import { mealId, mealDate, mealSnapshot, validateMealCreate, validateMealUpdate, validateMealDelete, validateMealQuery } from '../contracts/meal-log.js';
import { restorePlan } from './plans.js';
import { usageReservationId } from '../security/quota.js';
import { captureHistoryRevision, historyGuard } from './revision.js';

const unavailable = () => new Error('O diário está temporariamente indisponível.');
const missing = () => new ContractError('meal_log.id', 'registro ou sugestão indisponível para esta sessão');
function identity(visitor, now) {
  if (!visitor || mealId(visitor.visitorId) !== visitor.visitorId || !(Date.parse(visitor.expiresAt) > now)) throw unavailable();
}
export function restoreMeal(row, now) {
  try {
    const raw = JSON.parse(row.data_json);
    const edited = validateMealUpdate({ version: raw.version, description: raw.description, eaten_at: row.eaten_at,
      ...(Object.hasOwn(raw, 'servings_consumed') ? { servings_consumed: raw.servings_consumed } : {}) }, { now });
    if (!['manual', 'plan_suggestion'].includes(raw.source)) throw unavailable();
    const selection = raw.source === 'plan_suggestion' ? {
      side: raw.side, suggestion_index: raw.suggestion_index, snapshot: mealSnapshot(raw.snapshot),
    } : {};
    if (raw.source === 'plan_suggestion' && (!['cook', 'ready'].includes(raw.side)
        || selection.snapshot.side !== raw.side || !Number.isInteger(raw.suggestion_index)
        || raw.suggestion_index < 0 || raw.suggestion_index > 2)) throw unavailable();
    return { id: mealId(row.id), ...edited, source: raw.source, plan_id: row.plan_id ? mealId(row.plan_id) : null,
      ...selection, created_at: mealDate(row.created_at, { now }), updated_at: mealDate(row.updated_at, { now }), expires_at: row.expires_at };
  } catch { throw unavailable(); }
}
async function rowById(env, visitor, id, now) {
  // O vínculo também é filtrado pelo dono: nunca devolver ID de plano alheio, mesmo em linha inconsistente.
  return env.DB.prepare(`SELECT m.id, p.id AS plan_id, m.eaten_at, m.data_json, m.created_at, m.updated_at, m.expires_at
    FROM meal_logs m LEFT JOIN plans p ON p.id = m.plan_id AND p.visitor_id = ?1
    WHERE m.visitor_id = ?1 AND m.id = ?2 AND m.expires_at > ?3 LIMIT 1`)
    .bind(visitor.visitorId, id, new Date(now).toISOString()).first();
}
export async function getMeal(env, visitor, id, { now = Date.now() } = {}) {
  identity(visitor, now); id = mealId(id);
  const row = await rowById(env, visitor, id, now);
  if (!row) throw missing();
  return restoreMeal(row, now);
}
export async function listMeals(env, visitor, query = {}, { now = Date.now() } = {}) {
  identity(visitor, now);
  query = validateMealQuery(new URLSearchParams(query), { now });
  const result = await env.DB.prepare(`SELECT m.id, p.id AS plan_id, m.eaten_at, m.data_json, m.created_at, m.updated_at, m.expires_at
    FROM meal_logs m LEFT JOIN plans p ON p.id = m.plan_id AND p.visitor_id = ?1
    WHERE m.visitor_id = ?1 AND m.expires_at > ?2
      AND (?3 IS NULL OR m.eaten_at < ?3 OR (m.eaten_at = ?3 AND m.id > ?4))
    ORDER BY m.eaten_at DESC, m.id ASC LIMIT ?5`)
    .bind(visitor.visitorId, new Date(now).toISOString(), query.before ?? null, query.before_id ?? null, query.limit + 1).all();
  if (!result.success || !Array.isArray(result.results)) throw unavailable();
  const data = result.results.slice(0, query.limit).map(row => restoreMeal(row, now));
  const last = data.at(-1);
  return { data, next_cursor: result.results.length > query.limit
    ? { before: last.eaten_at, before_id: last.id } : null };
}
async function receipt(env, visitor, key) {
  return env.DB.prepare('SELECT operation, target_id FROM meal_log_mutations WHERE visitor_id = ?1 AND action_key = ?2 LIMIT 1')
    .bind(visitor.visitorId, key).first();
}
const duplicate = row => ({ duplicate: true, receipt: { operation: row.operation, meal_log_id: row.target_id } });

export async function mutateMeal(env, visitor, operation, id, raw, key, { now = Date.now() } = {}) {
  identity(visitor, now); mealId(key);
  const revision = await captureHistoryRevision(env, visitor);
  const input = operation === 'create' ? validateMealCreate(raw, { now })
    : operation === 'update' ? validateMealUpdate(raw, { now })
      : operation === 'delete' ? validateMealDelete(raw) : null;
  if (!input) throw missing();
  const target = operation === 'create' ? crypto.randomUUID() : mealId(id);
  // Espaço de chaves compartilhado entre as três mutações, separado de geração/visão.
  const actionKey = await usageReservationId('meal_log', visitor.visitorId, key.toLowerCase());
  const previous = await receipt(env, visitor, actionKey);
  if (previous) return duplicate(previous);
  if (operation === 'update') await getMeal(env, visitor, target, { now });

  let document, planId = null;
  if (operation === 'create') {
    document = { version: 1, source: input.source, description: input.description,
      ...(Object.hasOwn(input, 'servings_consumed') ? { servings_consumed: input.servings_consumed } : {}) };
    if (input.source === 'plan_suggestion') {
      const row = await env.DB.prepare(`SELECT id, model, data_json, created_at, expires_at FROM plans
        WHERE visitor_id = ?1 AND id = ?2 AND expires_at > ?3 LIMIT 1`)
        .bind(visitor.visitorId, input.plan_id, new Date(now).toISOString()).first();
      if (!row) throw missing();
      const plan = restorePlan(row);
      if (plan.data.mode !== 'compare' && input.side !== plan.data.mode) throw missing();
      const side = plan.data.mode === 'compare' ? plan.data[input.side] : plan.data;
      const suggestion = side.status === 'not_suggested' ? null : side.suggestions?.[input.suggestion_index];
      if (!suggestion) throw missing();
      const snapshot = mealSnapshot({ ...suggestion, side: input.side });
      document = { ...document, description: snapshot.title, side: input.side, suggestion_index: input.suggestion_index, snapshot };
      planId = input.plan_id;
    }
  }
  const attempt = crypto.randomUUID(), timestamp = new Date(now).toISOString();
  // A condição é repetida DENTRO da transação; uma exclusão concorrente não produz recibo de sucesso sem mutação.
  const eligible = operation === 'create' ? `(?8 IS NULL OR EXISTS
    (SELECT 1 FROM plans WHERE visitor_id = ?1 AND id = ?8 AND expires_at > ?6))`
    : `EXISTS (SELECT 1 FROM meal_logs WHERE visitor_id = ?1 AND id = ?4 AND expires_at > ?6)`;
  const insertReceipt = env.DB.prepare(`INSERT INTO meal_log_mutations
    (visitor_id, action_key, operation, target_id, attempt_id, created_at, expires_at)
    SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7 WHERE ${eligible}
      AND ${historyGuard(operation === 'create' ? '?9' : '?8')}
    ON CONFLICT(visitor_id, action_key) DO NOTHING`).bind(visitor.visitorId, actionKey, operation, target,
      attempt, timestamp, visitor.expiresAt, ...(operation === 'create' ? [planId] : []), revision);
  const won = 'EXISTS (SELECT 1 FROM meal_log_mutations WHERE visitor_id = ?1 AND action_key = ?2 AND attempt_id = ?3)';
  let mutation;
  if (operation === 'create') {
    mutation = env.DB.prepare(`INSERT INTO meal_logs (id, visitor_id, plan_id, eaten_at, data_json, created_at, updated_at, expires_at)
      SELECT ?4, ?1, ?5, ?6, ?7, ?8, ?8, ?9 WHERE ${won}`)
      .bind(visitor.visitorId, actionKey, attempt, target, planId, input.eaten_at, JSON.stringify(document), timestamp, visitor.expiresAt);
  } else if (operation === 'update') {
    // Substituição dos campos editáveis, preservando origem/instantâneo. Ausência de porções continua desconhecida.
    mutation = env.DB.prepare(`UPDATE meal_logs SET eaten_at = ?5, updated_at = ?6,
      data_json = json_patch(json_remove(data_json, '$.servings_consumed'), ?7)
      WHERE visitor_id = ?1 AND id = ?4 AND ${won}`)
      .bind(visitor.visitorId, actionKey, attempt, target, input.eaten_at, timestamp,
        JSON.stringify({ description: input.description, ...(Object.hasOwn(input, 'servings_consumed') ? { servings_consumed: input.servings_consumed } : {}) }));
  } else {
    // Só conteúdo de produto; o recibo permanece para que reenvio não ressuscite uma refeição apagada.
    mutation = env.DB.prepare(`DELETE FROM meal_logs WHERE visitor_id = ?1 AND id = ?4 AND ${won}`)
      .bind(visitor.visitorId, actionKey, attempt, target);
  }
  const results = await env.DB.batch([insertReceipt, mutation]);
  if (results.some(result => !result.success)) throw unavailable();
  if (results[0].meta?.changes === 0) {
    const existing = await receipt(env, visitor, actionKey);
    if (existing) return duplicate(existing);
    throw missing();
  }
  if (results[1].meta?.changes !== 1) throw unavailable();
  // Não presumir consumo de todas as porções nem dar baixa na despensa neste item.
  return { duplicate: false, data: { id: target, operation, applied: true } };
}
