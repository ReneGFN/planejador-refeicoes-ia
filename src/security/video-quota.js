// Política exclusiva de buscas; não altera cotas de geração, visão ou ingress.
import { usageReservationId } from './quota.js';

const DAY_MS = 86400000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const FIELDS = Object.freeze(['visitorDay', 'visitorMinute', 'networkDay', 'networkMinute',
  'globalDay', 'globalMinute', 'projectDay', 'otherDay', 'marginDay']);
const pacific = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
const parts = instant => Object.fromEntries(pacific.formatToParts(instant).map(p => [p.type, p.value]));
export class VideoQuotaError extends Error {
  constructor(code) { super('A busca do vídeo está indisponível no momento.'); this.name = 'VideoQuotaError'; this.code = code; }
}
const fail = code => { throw new VideoQuotaError(code); };

export function videoQuotaPolicy(raw) {
  let policy;
  try {
    if (typeof raw !== 'string' || raw.length > 2048) throw new Error();
    policy = JSON.parse(raw);
    if (!policy || Array.isArray(policy) || Object.keys(policy).length !== FIELDS.length
        || FIELDS.some(key => !Object.hasOwn(policy, key) || !Number.isSafeInteger(policy[key])
          || policy[key] < (['otherDay', 'marginDay'].includes(key) ? 0 : 1) || policy[key] > 10000000)) throw new Error();
    for (const scope of ['visitor', 'network', 'global']) {
      if (policy[scope + 'Minute'] > policy[scope + 'Day']) throw new Error();
    }
    if (policy.networkDay < policy.visitorDay || policy.networkMinute < policy.visitorMinute
        || policy.globalDay > policy.projectDay - policy.otherDay - policy.marginDay) throw new Error();
  } catch { fail('config_error'); }
  return Object.freeze(policy);
}

export function videoWindows(now) {
  if (!Number.isSafeInteger(now) || now < DAY_MS * 30 || now > 253402214400000) fail('config_error');
  const p = parts(now);
  const day = `${p.year}-${p.month}-${p.day}`;
  // Converte a próxima meia-noite civil pelo fuso, sem assumir UTC-8 fixo.
  const target = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day) + 1);
  let resetAt = target;
  for (let i = 0; i < 3; i++) {
    const q = parts(resetAt);
    const civil = Date.UTC(Number(q.year), Number(q.month) - 1, Number(q.day), Number(q.hour));
    resetAt += target - civil;
  }
  return { day, minute: new Date(now).toISOString().slice(0, 16), resetAt,
    minuteResetAt: Math.floor(now / 60000) * 60000 + 60000 };
}

// Contexto exclusivamente interno: a Fase 3 deverá obtê-lo da sessão e do IP
// confiável, com networkKey(request, env, videoWindows(now).day), nunca do JSON.
export function validateVideoContext(context, now, windows) {
  if (!context || !UUID.test(context.visitorId) || !UUID.test(context.requestKey)
      || !/^[0-9a-f]{64}$/u.test(context.networkHash) || context.networkDay !== windows.day) fail('context_error');
  const expiresAt = Date.parse(context.expiresAt);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now || expiresAt > now + 30 * DAY_MS) fail('context_error');
  return expiresAt;
}

export async function reserveVideoSearch(DB, title, context, policy, now) {
  const windows = videoWindows(now);
  const expiresAt = validateVideoContext(context, now, windows);
  const id = await usageReservationId('video_search', context.visitorId, context.requestKey);
  const buckets = [];
  for (const [scope, subject] of [['visitor', context.visitorId], ['network', context.networkHash], ['global', 'project']]) {
    buckets.push({ scope, subject, window: `day:${windows.day}`, limit: policy[scope + 'Day'], expiresAt: windows.resetAt + DAY_MS });
    buckets.push({ scope, subject, window: `minute:${windows.minute}`, limit: policy[scope + 'Minute'], expiresAt: windows.minuteResetAt + DAY_MS });
  }
  try {
    await DB.batch([
      DB.prepare(`INSERT INTO video_claims(title_key, attempt_id, started_at, expires_at) VALUES (?1, ?2, ?3, ?4)
        ON CONFLICT(title_key) DO UPDATE SET attempt_id = excluded.attempt_id,
          started_at = excluded.started_at, expires_at = excluded.expires_at`)
        .bind(title, id, now, now + 60000),
      DB.prepare('INSERT INTO video_usage_reservations(id, buckets_json, expires_at) VALUES (?1, ?2, ?3)')
        .bind(id, JSON.stringify(buckets), expiresAt),
    ]);
  } catch (error) {
    const mapping = { RF_VIDEO_REPLAY: 'replay', RF_VIDEO_CACHED: 'cached', RF_VIDEO_BLOCKED: 'project_blocked',
      RF_VIDEO_BUSY: 'busy', RF_VIDEO_LIMIT: 'quota_exceeded' };
    for (const [marker, code] of Object.entries(mapping)) if (String(error?.message).includes(marker)) fail(code);
    fail('reservation_error');
  }
  return { id, ...windows };
}
