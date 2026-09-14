// Política só do servidor. Nenhuma configuração/cota aceita do corpo do cliente.
const OPERATIONS = ['ingress', 'session', 'generation', 'vision'];
const FIELDS = ['visitorDay', 'visitorMinute', 'networkDay', 'networkMinute', 'globalDay', 'globalMinute', 'dayTokens', 'minuteTokens', 'reserveTokens'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class QuotaError extends Error {
  constructor(code) { super(code); this.name = 'QuotaError'; this.code = code; }
}
export function quotaPolicy(env, operation) {
  try {
    if (!OPERATIONS.includes(operation) || typeof env?.QUOTA_POLICY_JSON !== 'string' || env.QUOTA_POLICY_JSON.length > 4096) throw Error();
    const all = JSON.parse(env.QUOTA_POLICY_JSON);
    if (!all || Object.keys(all).some(key => !OPERATIONS.includes(key))) throw Error();
    const p = all[operation];
    if (!p || Object.keys(p).length !== FIELDS.length || !FIELDS.every(key => Number.isSafeInteger(p[key]) && p[key] >= 0 && p[key] <= 10_000_000)) throw Error();
    if (FIELDS.filter(key => !['reserveTokens', 'dayTokens', 'minuteTokens'].includes(key)).some(key => p[key] < 1)) throw Error();
    if (operation === 'generation' && p.visitorDay !== 3) throw Error();
    const ai = ['generation', 'vision'].includes(operation);
    if (ai && (p.reserveTokens < (operation === 'generation' ? 4096 : 1024) || p.dayTokens < p.reserveTokens || p.minuteTokens < p.reserveTokens)) throw Error();
    if (!ai && (p.reserveTokens || p.dayTokens || p.minuteTokens)) throw Error();
    if (p.networkDay < p.visitorDay || p.networkMinute < p.visitorMinute) throw Error();
    return p;
  } catch { throw new QuotaError('QUOTA_CONFIG_ERROR'); }
}
export function requestKey(request) {
  const key = request.headers.get('Idempotency-Key');
  if (!key || !UUID.test(key)) throw new QuotaError('INVALID_REQUEST_KEY');
  return key.toLowerCase();
}
function normalizeNetwork(ip) {
  if (typeof ip !== 'string' || ip.length > 45) throw Error();
  if (/^\d+\.\d+\.\d+\.\d+$/u.test(ip)) {
    if (!ip.split('.').every(n => /^(0|[1-9]\d{0,2})$/u.test(n) && Number(n) <= 255)) throw Error();
    return ip;
  }
  if (!/^[a-fA-F0-9:.]+$/u.test(ip) || !ip.includes(':')) throw Error();
  const canonical = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
  const [left, right] = canonical.split('::');
  const a = left ? left.split(':') : [];
  const b = right ? right.split(':') : [];
  const words = right === undefined ? a : [...a, ...Array(8 - a.length - b.length).fill('0'), ...b];
  if (words.length !== 8) throw Error();
  if (words.slice(0, 5).every(w => w === '0') && words[5] === 'ffff') {
    return words.slice(6).flatMap(w => [parseInt(w, 16) >> 8, parseInt(w, 16) & 255]).join('.');
  }
  return words.slice(0, 4).join(':') + '::/64';
}
const hex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
export async function networkKey(request, env, day) {
  try {
    const secret = env?.IP_HASH_SECRET;
    if (typeof secret !== 'string' || secret.trim().length < 32 || secret.length > 1024) throw Error();
    // Confiável apenas atrás da Cloudflare. Não fazer fallback para X-Forwarded-For.
    const network = normalizeNetwork(request.headers.get('CF-Connecting-IP'));
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(`rf-network:v1:${day}:${network}`)));
  } catch { throw new QuotaError('NETWORK_UNAVAILABLE'); }
}

export function quotaWindows(now = Date.now()) {
  if (!Number.isSafeInteger(now) || now < 0 || now > 4_000_000_000_000) throw new QuotaError('QUOTA_CONFIG_ERROR');
  const iso = new Date(now).toISOString();
  return { day: iso.slice(0, 10), minute: iso.slice(0, 16),
    bucketExpiry: new Date(Date.parse(iso.slice(0, 10)) + 2 * 86400000).toISOString(),
    receiptExpiry: new Date(now + 7 * 86400000).toISOString() };
}

// Mesma derivação para recibo e plano, sem guardar a chave original ou duplicar a regra.
export async function usageReservationId(operation, actor, key) {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${operation}:${actor}:${key}`)));
}

export async function reserveUsage(request, env, operation, visitorId = null, { now = Date.now() } = {}) {
  const policy = quotaPolicy(env, operation);
  const key = operation === 'ingress' ? crypto.randomUUID() : requestKey(request);
  const ai = ['generation', 'vision'].includes(operation);
  if (ai && !UUID.test(visitorId ?? '')) throw new QuotaError('QUOTA_CONFIG_ERROR');
  const windows = quotaWindows(now);
  const network = await networkKey(request, env, windows.day);
  const actor = ai ? visitorId : network;
  const id = await usageReservationId(operation, actor, key);
  const buckets = [];
  for (const [scope, subject] of [['visitor', visitorId], ['network', network], ['global', 'all']]) {
    if (scope === 'visitor' && !ai) continue;
    for (const [period, window] of [['Day', windows.day], ['Minute', windows.minute]]) {
      buckets.push({ scope, key: `${operation}:${period}:${subject}`, window,
        requestsLimit: policy[scope + period], tokens: scope === 'global' ? policy.reserveTokens : 0,
        tokensLimit: scope === 'global' ? policy[period === 'Day' ? 'dayTokens' : 'minuteTokens'] : 0,
        expiresAt: windows.bucketExpiry });
    }
  }
  try {
    const row = await env.DB.prepare(`INSERT INTO usage_reservations
      (id, operation, buckets_json, expires_at) VALUES (?1, ?2, ?3, ?4) RETURNING id`)
      .bind(id, operation, JSON.stringify(buckets), windows.receiptExpiry).first();
    if (row?.id !== id) throw Error();
    return { id, reservedTokens: policy.reserveTokens };
  } catch (error) {
    // Nunca repassar SQL, IP, parâmetros ou mensagem bruta para resposta/log.
    if (error?.message?.includes('RF_DUPLICATE_REQUEST')) throw new QuotaError('DUPLICATE_REQUEST');
    if (error?.message?.includes('RF_QUOTA_EXCEEDED')) throw new QuotaError('LIMIT_REACHED');
    throw new QuotaError('QUOTA_UNAVAILABLE');
  }
}

export async function finishUsage(env, id, succeeded, actualTokens = null) {
  try {
    const actual = Number.isSafeInteger(actualTokens) && actualTokens >= 0 ? actualTokens : 0;
    const results = await env.DB.batch([
      env.DB.prepare(`UPDATE usage_buckets SET reserved_tokens = reserved_tokens + COALESCE((
        SELECT MAX(0, ?1 - json_extract(candidate.value, '$.tokens'))
        FROM usage_reservations AS receipt, json_each(receipt.buckets_json) AS candidate
        WHERE receipt.id = ?2 AND receipt.status = 'reserved'
          AND json_extract(candidate.value, '$.scope') = 'global'
          AND usage_buckets.scope = 'global'
          AND usage_buckets.bucket_key = json_extract(candidate.value, '$.key')
          AND usage_buckets.day_utc = json_extract(candidate.value, '$.window')
      ), 0) WHERE scope = 'global' AND (bucket_key, day_utc) IN (
        SELECT json_extract(value, '$.key'), json_extract(value, '$.window')
        FROM usage_reservations, json_each(buckets_json) WHERE usage_reservations.id = ?2 AND status = 'reserved'
          AND json_extract(value, '$.scope') = 'global'
      )`).bind(actual, id),
      env.DB.prepare("UPDATE usage_reservations SET status = ?1 WHERE id = ?2 AND status = 'reserved'")
        .bind(succeeded ? 'succeeded' : 'failed', id),
    ]);
    if (results.some(result => !result.success)) throw Error();
  } catch { throw new QuotaError('QUOTA_UNAVAILABLE'); }
}

// Limpeza limitada e independente: não apaga janelas ativas nem devolve cota.
export async function pruneUsage(env, { now = Date.now() } = {}) {
  quotaWindows(now);
  const instant = new Date(now).toISOString();
  try {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM usage_reservations WHERE id IN (SELECT id FROM usage_reservations WHERE expires_at <= ?1 ORDER BY expires_at LIMIT 100)').bind(instant),
      env.DB.prepare('DELETE FROM usage_buckets WHERE rowid IN (SELECT rowid FROM usage_buckets WHERE expires_at <= ?1 ORDER BY expires_at LIMIT 100)').bind(instant),
    ]);
  } catch { throw new QuotaError('QUOTA_UNAVAILABLE'); }
}
