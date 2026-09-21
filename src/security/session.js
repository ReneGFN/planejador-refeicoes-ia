// Base de sessão usada pela rota protegida; flags desligadas por padrão. Não registrar cookies/tokens.
export const SESSION_COOKIE = '__Host-rf_session';
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // Provisório; expiração absoluta.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/u; // 32 bytes base64url canônicos.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export class SessionError extends Error {
  constructor(code) { super(code); this.name = 'SessionError'; this.code = code; }
}

function requireHttps(request) {
  const url = new URL(request.url);
  if (url.protocol !== 'https:') throw new SessionError('ORIGIN_FORBIDDEN');
  return url;
}

// Defesa de navegador/CSRF, não substitui sessão, cotas ou proteção contra bots.
export function assertSameOriginMutation(request) {
  const url = requireHttps(request);
  const site = request.headers.get('Sec-Fetch-Site');
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)
      || request.headers.get('Origin') !== url.origin
      || (site !== null && site !== 'same-origin')) {
    throw new SessionError('ORIGIN_FORBIDDEN');
  }
}

function validateEnvironment(env) {
  const secret = env?.SESSION_SECRET;
  // Checagem de configuração, não medição de entropia. Usar segredo aleatório.
  if (typeof secret !== 'string' || secret.trim().length < 32 || secret.length > 1024
      || typeof env?.DB?.prepare !== 'function') {
    throw new SessionError('SESSION_CONFIG_ERROR');
  }
}

function clock(now) {
  if (!Number.isSafeInteger(now) || now < SESSION_TTL_SECONDS * 1000 || now > 253402300799000) {
    throw new SessionError('SESSION_CONFIG_ERROR');
  }
  return Math.floor(now / 1000) * 1000;
}
const sqlDate = ms => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');

function cookieToken(request) {
  const header = request.headers.get('Cookie');
  if (!header || header.length > 8192) return null;
  const values = [];
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (part.slice(0, separator < 0 ? undefined : separator).trim() === SESSION_COOKIE) {
      values.push(separator < 0 ? '' : part.slice(separator + 1).trim());
    }
  }
  // Não escolher um de dois cookies conflitantes nem decodificar entrada livre.
  return values.length === 1 && TOKEN_PATTERN.test(values[0]) ? values[0] : null;
}

async function tokenHash(token, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signed = await crypto.subtle.sign('HMAC', key, encoder.encode(`rf-session:v1:${token}`));
  return Array.from(new Uint8Array(signed), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function lookup(request, env, now) {
  const token = cookieToken(request);
  if (!token) return null;
  const hash = await tokenHash(token, env.SESSION_SECRET);
  // Binding direto: sem Sessions API, D1 consulta o primário. Não usar réplica
  // eventualmente consistente para autenticar um token já revogado/removido.
  const row = await env.DB.prepare(`SELECT id, created_at FROM visitors
    WHERE session_token_hash = ?1 AND created_at > ?2 AND created_at <= ?3 LIMIT 1`)
    .bind(hash, sqlDate(now - SESSION_TTL_SECONDS * 1000), sqlDate(now)).first();
  if (!row) return null;
  const created = Date.parse(`${row.created_at.replace(' ', 'T')}Z`);
  if (!UUID_PATTERN.test(row.id) || !Number.isFinite(created)
      || created > now || created + SESSION_TTL_SECONDS * 1000 <= now) {
    throw new SessionError('SESSION_UNAVAILABLE');
  }
  return { visitorId: row.id, expiresAt: new Date(created + SESSION_TTL_SECONDS * 1000).toISOString() };
}

// now é injeção de relógio para testes; nunca aceitar esse valor do cliente.
export async function resolveVisitorSession(request, env, { now = Date.now() } = {}) {
  requireHttps(request);
  validateEnvironment(env);
  const instant = clock(now);
  try { return await lookup(request, env, instant); }
  catch { throw new SessionError('SESSION_UNAVAILABLE'); }
}

export async function requireVisitorSession(request, env, options) {
  const session = await resolveVisitorSession(request, env, options);
  if (!session) throw new SessionError('SESSION_REQUIRED');
  return session;
}

// Chamador futuro DEVE limitar a criação por rede/global ANTES desta função.
// O retorno é interno: setCookie vai só para o header, nunca JSON/logs.
export async function establishVisitorSession(request, env, { now = Date.now() } = {}) {
  assertSameOriginMutation(request);
  if (request.method !== 'POST') throw new SessionError('ORIGIN_FORBIDDEN');
  validateEnvironment(env);
  const instant = clock(now);
  try {
    const existing = await lookup(request, env, instant);
    if (existing) return { ...existing, setCookie: null, created: false };
    const token = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
      .replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
    const hash = await tokenHash(token, env.SESSION_SECRET);
    const visitorId = crypto.randomUUID();
    const result = await env.DB.prepare(`INSERT INTO visitors
      (id, session_token_hash, created_at, last_seen_at) VALUES (?1, ?2, ?3, ?3)`)
      .bind(visitorId, hash, sqlDate(instant)).run();
    if (!result.success || result.meta?.changes !== 1) throw new Error('insert failed');
    return {
      visitorId, created: true,
      expiresAt: new Date(instant + SESSION_TTL_SECONDS * 1000).toISOString(),
      setCookie: `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`,
    };
  } catch { throw new SessionError('SESSION_UNAVAILABLE'); }
}
