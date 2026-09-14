// Serviço interno ainda sem rota/flag. Nunca chamá-lo antes das proteções de acesso.
import { validateVideoInput } from '../contracts/video.js';
import { searchYouTubeVideo, VideoProviderError } from '../providers/youtube.js';
import { reserveVideoSearch, validateVideoContext, videoQuotaPolicy, videoWindows, VideoQuotaError } from '../security/video-quota.js';
import { readVideoCache, storeVideoResult, pruneVideoData } from './cache.js';

export async function getSupportVideo(raw, context, { DB, policyJson, apiKey, fetchImpl, timeoutMs, clock = Date.now } = {}) {
  const { title } = validateVideoInput(raw);
  const fallback = reason => ({ query: title, result: null, source: 'fallback', reason });
  const success = (result, source) => ({ query: title, result, source, reason: null });
  let now, windows, database;
  try {
    now = clock(); windows = videoWindows(now); validateVideoContext(context, now, windows);
    // Leituras iniciais no primário também quando houver replicação D1 habilitada.
    database = DB.withSession ? DB.withSession('first-primary') : DB;
    await pruneVideoData(database, now);
    const cached = await readVideoCache(database, title, now);
    if (cached) return success(cached, 'cache');
  } catch (error) { return fallback(error instanceof VideoQuotaError ? error.code : 'cache_error'); }
  let policy, reservation;
  try { policy = videoQuotaPolicy(policyJson); }
  catch { return fallback('config_error'); }
  try { reservation = await reserveVideoSearch(database, title, context, policy, now); }
  catch (error) {
    if (error instanceof VideoQuotaError && ['cached', 'busy'].includes(error.code)) {
      try { const cached = await readVideoCache(database, title, clock()); if (cached) return success(cached, 'cache'); }
      catch { return fallback('cache_error'); }
    }
    return fallback(error instanceof VideoQuotaError ? error.code : 'reservation_error');
  }
  let failureReason = 'authorization_error';
  try {
    const permitted = await database.prepare(`SELECT 1 AS allowed FROM video_claims claim
      JOIN video_usage_reservations receipt ON receipt.id = claim.attempt_id
      WHERE claim.title_key = ?1 AND claim.attempt_id = ?2 AND claim.expires_at > ?3
        AND receipt.status = 'reserved' AND receipt.expires_at > ?3
        AND NOT EXISTS (SELECT 1 FROM video_project_blocks WHERE id = 1 AND expires_at > ?3)`)
      .bind(title, reservation.id, clock()).first();
    if (!permitted) throw new VideoQuotaError('send_not_authorized');
    const sendingAt = clock();
    const sending = videoWindows(sendingAt);
    // Sem aproveitar reserva velha ou enviar junto à virada. Dez segundos são
    // margem de envio, não promessa sobre o relógio de recebimento do Google.
    if (sending.day !== reservation.day || sending.minute !== reservation.minute
        || sendingAt < now || sendingAt >= Date.parse(context.expiresAt)
        || sending.resetAt - sendingAt <= 10000 || sendingAt >= now + 50000) {
      throw new VideoQuotaError('window_changed');
    }
    const result = await searchYouTubeVideo({ title }, { apiKey, fetchImpl, timeoutMs });
    failureReason = 'cache_write_error';
    return success(await storeVideoResult(database, title, reservation, result, clock()), 'provider');
  } catch (error) {
    const code = error instanceof VideoProviderError ? error.code
      : error instanceof VideoQuotaError ? error.code : failureReason;
    try {
      const statements = [database.prepare("UPDATE video_usage_reservations SET status = 'failed' WHERE id = ?1 AND status = 'reserved'").bind(reservation.id)];
      if (code === 'VIDEO_QUOTA_EXCEEDED') {
        const until = videoWindows(clock()).resetAt;
        statements.push(database.prepare(`INSERT INTO video_project_blocks(id, expires_at) VALUES (1, ?1)
          ON CONFLICT(id) DO UPDATE SET expires_at = MAX(expires_at, excluded.expires_at)`).bind(until));
      }
      await database.batch(statements);
    } catch { /* Falha de registro não permite repetir, devolver saldo ou expor SQL. */ }
    return fallback(code);
  }
}
