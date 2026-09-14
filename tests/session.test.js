import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { establishVisitorSession as establish, resolveVisitorSession as resolve,
  requireVisitorSession as requireSession, assertSameOriginMutation, SESSION_COOKIE, SESSION_TTL_SECONDS } from '../src/security/session.js';

const now = Date.parse('2026-09-10T12:00:00Z');
const time = { now };
const cookieOf = result => result.setCookie.split(';')[0];
const request = (cookie = '', init = {}) => new Request('https://demo.example/api/session', {
  method: 'POST', ...init,
  headers: { Origin: 'https://demo.example', Cookie: cookie, ...init.headers },
});

function environment() {
  const rows = [];
  const statements = [];
  return { rows, statements, SESSION_SECRET: 'fake-unit-test-secret-not-for-production', DB: {
    prepare(sql) {
      return { bind(...params) {
        statements.push({ sql, params });
        return {
          async first() {
            const row = rows.find(r => r.session_token_hash === params[0] && r.created_at > params[1] && r.created_at <= params[2]);
            return row ? { id: row.id, created_at: row.created_at } : null;
          },
          async run() {
            rows.push({ id: params[0], session_token_hash: params[1], created_at: params[2] });
            return { success: true, meta: { changes: 1 } };
          },
        };
      } };
    },
  } };
}

test('sessão: cria token aleatório, grava HMAC e configura cookie protegido', async () => {
  const env = environment();
  const session = await establish(request(), env, time);
  const token = cookieOf(session).split('=')[1];
  assert.equal(Buffer.from(token, 'base64url').length, 32);
  assert.equal(session.created, true);
  assert.equal(session.expiresAt, '2026-10-10T12:00:00.000Z');
  assert.match(session.setCookie, /; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000$/u);
  assert.ok(!session.setCookie.includes('Domain='));
  assert.equal(env.rows[0].session_token_hash, createHmac('sha256', env.SESSION_SECRET).update(`rf-session:v1:${token}`).digest('hex'));
  assert.ok(!JSON.stringify(env.rows).includes(token));
  assert.equal(env.rows[0].id, session.visitorId);
});

test('sessão: volta ao mesmo visitante sem renovar prazo nem escrever novamente', async () => {
  const env = environment();
  const first = await establish(request(), env, time);
  const later = await establish(request(cookieOf(first)), env, { now: now + 10000 });
  assert.deepEqual(later, { visitorId: first.visitorId, expiresAt: first.expiresAt, setCookie: null, created: false });
  assert.equal(env.rows.length, 1);
  assert.deepEqual(await requireSession(request(cookieOf(first)), env, time), { visitorId: first.visitorId, expiresAt: first.expiresAt });
});

test('sessão: visitantes separados e ID enviado pelo cliente não autentica', async () => {
  const env = environment();
  const a = await establish(request(), env, time);
  const b = await establish(request(), env, time);
  assert.notEqual(a.visitorId, b.visitorId);
  assert.notEqual(cookieOf(a), cookieOf(b));
  assert.equal((await resolve(request(cookieOf(a), { headers: { 'X-Visitor-Id': b.visitorId }, body: JSON.stringify({ visitorId: b.visitorId }) }), env, time)).visitorId, a.visitorId);
  await assert.rejects(requireSession(request('', { headers: { 'X-Visitor-Id': a.visitorId } }), env, time), { code: 'SESSION_REQUIRED' });
});

test('sessão: cookie ausente, adulterado, duplicado ou malformado não autentica', async () => {
  const env = environment();
  const session = await establish(request(), env, time);
  const valid = cookieOf(session);
  const token = valid.split('=')[1];
  for (const cookie of ['', `${SESSION_COOKIE}=${session.visitorId}`, `${valid}; ${valid}`, `${valid}; ${SESSION_COOKIE}`,
    `${SESSION_COOKIE}="${token}"`, `${SESSION_COOKIE}=%20${token}`, `${valid}=`, 'x'.repeat(8193),
    `${SESSION_COOKIE}=${token[0] === 'A' ? 'B' : 'A'}${token.slice(1)}`]) {
    assert.equal(await resolve(request(cookie), env, time), null);
  }
  assert.equal((await resolve(request(`other=value; ${valid}`), env, time)).visitorId, session.visitorId);
});

test('sessão: expira no prazo absoluto e falha com registro removido ou futuro', async () => {
  const env = environment();
  const session = await establish(request(), env, time);
  const req = request(cookieOf(session));
  assert.ok(await resolve(req, env, { now: now + SESSION_TTL_SECONDS * 1000 - 1 }));
  assert.equal(await resolve(req, env, { now: now + SESSION_TTL_SECONDS * 1000 }), null);
  assert.equal(await resolve(req, env, { now: now - 1000 }), null);
  env.rows.length = 0;
  assert.equal(await resolve(req, env, time), null);
});

test('sessão: exige HTTPS e origem exata antes de escrever no banco', async () => {
  const env = environment();
  for (const req of [
    new Request('http://demo.example/api/session', { method: 'POST', headers: { Origin: 'http://demo.example' } }),
    request('', { method: 'GET' }), request('', { headers: { Origin: '' } }),
    request('', { headers: { Origin: 'null' } }), request('', { headers: { Origin: 'https://evil.example' } }),
    request('', { headers: { Origin: 'https://demo.example.evil.test' } }),
    request('', { headers: { 'Sec-Fetch-Site': 'same-site' } }),
    request('', { headers: { 'Sec-Fetch-Site': 'cross-site' } }),
  ]) await assert.rejects(establish(req, env, time), { code: 'ORIGIN_FORBIDDEN' });
  assert.equal(env.statements.length, 0);
  assert.doesNotThrow(() => assertSameOriginMutation(request('', { method: 'DELETE', headers: { 'Sec-Fetch-Site': 'same-origin' } })));
});

test('sessão: segredo/binding/relógio inválidos bloqueiam sem escrita', async () => {
  const env = environment();
  for (const config of [{}, { ...env, SESSION_SECRET: 'short' }, { ...env, DB: null },
    { ...env, SESSION_SECRET: ' '.repeat(32) }, { ...env, SESSION_SECRET: 'x'.repeat(1025) }]) {
    await assert.rejects(establish(request(), config, time), { code: 'SESSION_CONFIG_ERROR' });
  }
  for (const invalid of [NaN, Infinity, -1, 'now', 1.2]) {
    await assert.rejects(establish(request(), env, { now: invalid }), { code: 'SESSION_CONFIG_ERROR' });
  }
  assert.equal(env.statements.length, 0);
});

test('sessão: troca do segredo invalida tokens existentes', async () => {
  const env = environment();
  const session = await establish(request(), env, time);
  env.SESSION_SECRET = 'different-fake-unit-test-secret-not-for-production';
  assert.equal(await resolve(request(cookieOf(session)), env, time), null);
});

test('sessão: erro de banco é sanitizado e não devolve cookie após falha', async () => {
  const env = environment();
  const session = await establish(request(), env, time);
  env.DB.prepare = () => { throw Error('PRIVATE SQL OR TOKEN'); };
  await assert.rejects(establish(request(), env, time), { code: 'SESSION_UNAVAILABLE', message: 'SESSION_UNAVAILABLE' });
  await assert.rejects(resolve(request(cookieOf(session)), env, time), { code: 'SESSION_UNAVAILABLE', message: 'SESSION_UNAVAILABLE' });
});
