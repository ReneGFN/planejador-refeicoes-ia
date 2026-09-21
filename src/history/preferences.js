import { emptyPreferences, validatePreferences } from '../contracts/preferences.js';
import { captureHistoryRevision, historyGuard } from './revision.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
function owner(visitor) {
  if (!UUID.test(visitor?.visitorId ?? '')) throw new Error('Sessão inválida para preferências.');
  return visitor.visitorId;
}

export async function readPreferences(env, visitor) {
  const visitorId = owner(visitor);
  try {
    const row = await env.DB.prepare('SELECT data_json FROM preferences WHERE visitor_id = ?1 LIMIT 1')
      .bind(visitorId).first();
    return row ? validatePreferences(JSON.parse(row.data_json)) : emptyPreferences();
  } catch { throw new Error('Não foi possível consultar suas preferências.'); }
}

export async function writePreferences(env, visitor, raw, { now = Date.now() } = {}) {
  const visitorId = owner(visitor), data = validatePreferences(raw);
  try {
    const revision = await captureHistoryRevision(env, visitor);
    // PUT substitui o documento inteiro; reenviar o mesmo estado não duplica registros.
    // Preferências não apagam diário nem recibos e não implicam registrar consumo.
    const saved = await env.DB.prepare(`INSERT INTO preferences (visitor_id, data_json, updated_at)
      SELECT ?1, ?2, ?3 WHERE ${historyGuard('?4')} ON CONFLICT(visitor_id) DO UPDATE SET
      data_json = excluded.data_json, updated_at = excluded.updated_at WHERE preferences.visitor_id = ?1`)
      .bind(visitorId, JSON.stringify(data), new Date(now).toISOString(), revision).run();
    if (!saved.success || saved.meta?.changes !== 1) throw Error();
    return data;
  } catch { throw new Error('Não foi possível salvar suas preferências.'); }
}
