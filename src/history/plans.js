import { validateGenerationInput, validateGenerationOutput } from '../contracts/generation.js';
import { calculateComparison } from '../comparison/calculate.js';
import { captureHistoryRevision, historyGuard } from './revision.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const HASH = /^[a-f0-9]{64}$/u;

function unavailable() { return new Error('Não foi possível acessar o plano salvo.'); }
function identity(visitor, generationKey) {
  // visitor é sempre obtido pela sessão no chamador HTTP, nunca pelo corpo.
  if (!UUID.test(visitor?.visitorId ?? '') || !HASH.test(generationKey ?? '')) throw unavailable();
}
function metadataOf(raw) {
  if (typeof raw?.model !== 'string' || !raw.model || raw.model.length > 120
      || !Number.isSafeInteger(raw.elapsed_ms) || raw.elapsed_ms < 0) throw unavailable();
  const usage = {};
  for (const field of ['prompt_tokens', 'completion_tokens', 'total_tokens', 'reasoning_tokens']) {
    const value = raw.usage?.[field];
    if (value !== null && (!Number.isSafeInteger(value) || value < 0)) throw unavailable();
    usage[field] = value;
  }
  return { model: raw.model, usage, elapsed_ms: raw.elapsed_ms };
}

export function planDocument(input, result) {
  const request = validateGenerationInput(input);
  const output = validateGenerationOutput(result.data, request);
  // Apenas conteúdo canônico e metadados permitidos; sem foto, envelope bruto ou segredos.
  // Não guardar comparison: v1 é recalculada com as mesmas fontes e ordem originais.
  return { version: 1, contract_version: 1, calculation_version: 1,
    request, output, metadata: metadataOf(result.metadata) };
}

export function restorePlan(row) {
  try {
    const saved = JSON.parse(row.data_json);
    // Uma versão futura precisa de compatibilidade explícita, nunca recálculo silencioso.
    if (saved.version !== 1 || saved.contract_version !== 1 || saved.calculation_version !== 1
        || !UUID.test(row.id) || row.model !== saved.metadata?.model) throw unavailable();
    const document = planDocument(saved.request, { data: saved.output, metadata: saved.metadata });
    const comparison = document.request.mode === 'compare'
      ? calculateComparison(document.request, document.output) : null;
    return { id: row.id, status: 'draft', version: document.version,
      contract_version: document.contract_version, calculation_version: document.calculation_version,
      created_at: row.created_at, expires_at: row.expires_at,
      request: document.request, data: document.output, metadata: document.metadata,
      ...(comparison ? { comparison } : {}) };
  } catch { throw unavailable(); }
}

export async function findPlan(env, visitor, generationKey, { now = Date.now() } = {}) {
  identity(visitor, generationKey);
  try {
    const row = await env.DB.prepare(`SELECT id, model, data_json, created_at, expires_at FROM plans
      WHERE visitor_id = ?1 AND generation_key = ?2 AND expires_at > ?3 LIMIT 1`)
      .bind(visitor.visitorId, generationKey, new Date(now).toISOString()).first();
    return row ? restorePlan(row) : null;
  } catch { throw unavailable(); }
}

export async function listPlans(env, visitor, { now = Date.now(), limit = 30 } = {}) {
  identity(visitor, 'a'.repeat(64));
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw unavailable();
  try {
    const result = await env.DB.prepare(`SELECT id, model, data_json, created_at, expires_at FROM plans
      WHERE visitor_id = ?1 AND expires_at > ?2 ORDER BY created_at DESC, id ASC LIMIT ?3`)
      .bind(visitor.visitorId, new Date(now).toISOString(), limit).all();
    if (!result.success || !Array.isArray(result.results)) throw unavailable();
    return result.results.map(restorePlan);
  } catch { throw unavailable(); }
}

export async function deletePlan(env, visitor, id, { now = Date.now() } = {}) {
  identity(visitor, 'a'.repeat(64));
  if (!UUID.test(id ?? '')) throw unavailable();
  try {
    const result = await env.DB.prepare(`DELETE FROM plans WHERE visitor_id = ?1 AND id = ?2 AND expires_at > ?3`)
      .bind(visitor.visitorId, id.toLowerCase(), new Date(now).toISOString()).run();
    if (!result.success || result.meta?.changes !== 1) throw unavailable();
    return { id: id.toLowerCase(), operation: 'delete', applied: true };
  } catch { throw unavailable(); }
}

export async function savePlan(env, visitor, generationKey, input, result, { now = Date.now(), historyRevision } = {}) {
  identity(visitor, generationKey);
  try {
    const revision = historyRevision ?? await captureHistoryRevision(env, visitor);
    if (!Number.isSafeInteger(revision) || revision < 0) throw unavailable();
    const document = planDocument(input, result);
    const createdAt = new Date(now).toISOString();
    if (!Number.isFinite(Date.parse(visitor.expiresAt)) || Date.parse(visitor.expiresAt) <= now) throw unavailable();
    const id = crypto.randomUUID();
    // Gravação aguardada antes do HTTP 200. Não sobrescrever rascunho de uma ação anterior.
    const saved = await env.DB.prepare(`INSERT INTO plans
      (id, visitor_id, model, data_json, created_at, generation_key, expires_at)
      SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7 WHERE ${historyGuard('?8', '?2')}`)
      .bind(id, visitor.visitorId, document.metadata.model, JSON.stringify(document), createdAt,
        generationKey, visitor.expiresAt, revision).run();
    if (!saved.success || saved.meta?.changes !== 1) throw unavailable();
    return id;
  } catch { throw unavailable(); }
}
