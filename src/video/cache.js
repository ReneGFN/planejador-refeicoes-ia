import { validateVideoInput, validateVideoOutput } from '../contracts/video.js';

export const VIDEO_CACHE_TTL = Object.freeze({ found: 86400000, not_found: 3600000 });

export async function readVideoCache(DB, title, now) {
  const row = await DB.prepare(`SELECT title_key, status, video_id, video_title, channel_id,
    channel_title, fetched_at, expires_at FROM video_cache WHERE title_key = ?1`).bind(title).first();
  if (!row) return null; // Nunca buscado, ou resultado já removido.
  if (row.title_key !== validateVideoInput({ title }).title || !Number.isSafeInteger(row.fetched_at)
      || !Number.isSafeInteger(row.expires_at) || row.fetched_at > now || row.expires_at <= row.fetched_at
      || !Object.hasOwn(VIDEO_CACHE_TTL, row.status)
      || row.expires_at - row.fetched_at > VIDEO_CACHE_TTL[row.status]) throw new Error('Cache de vídeo inválido.');
  if (row.expires_at <= now) {
    await DB.prepare('DELETE FROM video_cache WHERE title_key = ?1 AND expires_at <= ?2').bind(title, now).run();
    return null;
  }
  if (row.status === 'not_found' && [row.video_id, row.video_title, row.channel_id, row.channel_title].some(v => v !== null)) {
    throw new Error('Cache de vídeo inválido.');
  }
  return validateVideoOutput({ version: 1, status: row.status, video: row.status === 'not_found' ? null
    : { id: row.video_id, title: row.video_title, channel_id: row.channel_id, channel_title: row.channel_title } });
}

export async function storeVideoResult(DB, title, reservation, raw, now) {
  const result = validateVideoOutput(raw);
  const video = result.video;
  // Só o dono da trava ainda válida pode publicar; resposta atrasada não sobrescreve outra.
  const statements = [DB.prepare(`INSERT INTO video_cache
    (title_key, status, video_id, video_title, channel_id, channel_title, fetched_at, expires_at)
    SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8 WHERE EXISTS
      (SELECT 1 FROM video_claims WHERE title_key = ?1 AND attempt_id = ?9 AND expires_at > ?7)
    ON CONFLICT(title_key) DO UPDATE SET status = excluded.status, video_id = excluded.video_id,
      video_title = excluded.video_title, channel_id = excluded.channel_id, channel_title = excluded.channel_title,
      fetched_at = excluded.fetched_at, expires_at = excluded.expires_at`)
    .bind(title, result.status, video?.id ?? null, video?.title ?? null, video?.channel_id ?? null,
      video?.channel_title ?? null, now, now + VIDEO_CACHE_TTL[result.status], reservation.id),
  DB.prepare(`UPDATE video_usage_reservations SET status = 'succeeded' WHERE id = ?1 AND status = 'reserved'
    AND EXISTS (SELECT 1 FROM video_claims WHERE title_key = ?2 AND attempt_id = ?1 AND expires_at > ?3)`)
    .bind(reservation.id, title, now),
  DB.prepare('DELETE FROM video_claims WHERE title_key = ?1 AND attempt_id = ?2').bind(title, reservation.id)];
  const results = await DB.batch(statements);
  if (results[0]?.meta?.changes !== 1) throw new Error('Resultado de vídeo não persistido.');
  return result;
}

// Limpeza efetiva e limitada, apenas das tabelas de vídeo. Agendamento obrigatório
// antes de ativar em produção; tráfego eventual não garante retenção máxima.
export async function pruneVideoData(DB, now) {
  if (!Number.isSafeInteger(now) || now < 0) throw new Error('Data de limpeza inválida.');
  return DB.batch([
    DB.prepare('DELETE FROM video_cache WHERE title_key IN (SELECT title_key FROM video_cache WHERE expires_at <= ?1 ORDER BY expires_at LIMIT 100)').bind(now),
    DB.prepare('DELETE FROM video_claims WHERE title_key IN (SELECT title_key FROM video_claims WHERE expires_at <= ?1 ORDER BY expires_at LIMIT 100)').bind(now),
    DB.prepare('DELETE FROM video_usage_reservations WHERE id IN (SELECT id FROM video_usage_reservations WHERE expires_at <= ?1 ORDER BY expires_at LIMIT 100)').bind(now),
    DB.prepare('DELETE FROM video_usage_buckets WHERE rowid IN (SELECT rowid FROM video_usage_buckets WHERE expires_at <= ?1 ORDER BY expires_at LIMIT 100)').bind(now),
    DB.prepare('DELETE FROM video_project_blocks WHERE expires_at <= ?1').bind(now),
  ]);
}
