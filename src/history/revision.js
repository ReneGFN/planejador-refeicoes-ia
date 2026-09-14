const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
export const historyUnavailable = () => new Error('Os dados estão temporariamente indisponíveis.');
export async function captureHistoryRevision(env, visitor) {
  if (!UUID.test(visitor?.visitorId ?? '')) throw historyUnavailable();
  const row = await env.DB.prepare('SELECT history_revision FROM visitors WHERE id = ?1 LIMIT 1')
    .bind(visitor.visitorId).first();
  if (!Number.isSafeInteger(row?.history_revision) || row.history_revision < 0) throw historyUnavailable();
  return row.history_revision;
}

// Parâmetros definidos somente pelo código; nunca aceitar SQL ou revisão do cliente.
// Conferir na própria escrita, não numa consulta anterior sujeita a corrida.
export const historyGuard = (revisionParameter, ownerParameter = '?1') =>
  `EXISTS (SELECT 1 FROM visitors WHERE id = ${ownerParameter} AND history_revision = ${revisionParameter})`;
