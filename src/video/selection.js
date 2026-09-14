import { ContractError } from '../contracts/generation.js';
import { validateVideoSelection } from '../contracts/video-request.js';
import { validateVideoInput } from '../contracts/video.js';
import { restorePlan } from '../history/plans.js';

// Leitura do histórico existente, sem atualização, cópia de receita ou gravação.
export async function selectedVideoTitle(env, visitor, raw, now) {
  const input = validateVideoSelection(raw);
  const row = await env.DB.prepare(`SELECT id, model, data_json, created_at, expires_at FROM plans
    WHERE visitor_id = ?1 AND id = ?2 AND expires_at > ?3 LIMIT 1`)
    .bind(visitor.visitorId, input.plan_id, new Date(now).toISOString()).first();
  const unavailable = () => new ContractError('input.plan_id', 'alternativa indisponível para esta sessão');
  if (!row) throw unavailable();
  const plan = restorePlan(row);
  if (plan.data.mode !== 'compare' && input.side !== plan.data.mode) throw unavailable();
  const side = plan.data.mode === 'compare' ? plan.data[input.side] : plan.data;
  const suggestion = side?.status === 'not_suggested' ? null : side?.suggestions?.[input.suggestion_index];
  if (!suggestion) throw unavailable();
  return validateVideoInput({ title: suggestion.title }).title;
}
