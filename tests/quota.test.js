import test from 'node:test';
import assert from 'node:assert/strict';
import { quotaPolicy, requestKey, networkKey, quotaWindows } from '../src/security/quota.js';
import { readJsonBody } from '../src/http/json-body.js';
const policy = { visitorDay: 3, visitorMinute: 2, networkDay: 12, networkMinute: 6,
  globalDay: 80, globalMinute: 10, dayTokens: 160000, minuteTokens: 16000, reserveTokens: 8000 };
const env = { QUOTA_POLICY_JSON: JSON.stringify({ generation: policy }), IP_HASH_SECRET: 'fake-network-test-secret-never-production' };
const ipRequest = ip => new Request('https://test.example', { headers: ip ? { 'CF-Connecting-IP': ip } : {} });

test('cotas: configuração explícita, até cinco gerações, reservas de tokens e validação estrita', () => {
  assert.deepEqual(quotaPolicy(env, 'generation'), policy);
  assert.equal(quotaPolicy({ QUOTA_POLICY_JSON: JSON.stringify({ generation: { ...policy, visitorDay: 5 } }) }, 'generation').visitorDay, 5);
  for (const p of [{ ...policy, visitorDay: 6 }, { ...policy, reserveTokens: 1 }, { ...policy, minuteTokens: 1 },
    { ...policy, globalDay: -1 }, { ...policy, extra: 1 }, { ...policy, globalDay: '80' }, { ...policy, networkDay: 1 }]) {
    assert.throws(() => quotaPolicy({ QUOTA_POLICY_JSON: JSON.stringify({ generation: p }) }, 'generation'), { code: 'QUOTA_CONFIG_ERROR' });
  }
  for (const config of [{}, { QUOTA_POLICY_JSON: '{}' }, { QUOTA_POLICY_JSON: 'invalid' }]) {
    assert.throws(() => quotaPolicy(config, 'generation'), { code: 'QUOTA_CONFIG_ERROR' });
  }
});
test('cotas: chave de reenvio é UUID v4 e não aceita texto livre', () => {
  const id = crypto.randomUUID();
  assert.equal(requestKey(new Request('https://t.test', { headers: { 'Idempotency-Key': id.toUpperCase() } })), id);
  assert.throws(() => requestKey(ipRequest()), { code: 'INVALID_REQUEST_KEY' });
});
test('cotas: IP pseudonimizado por dia; IPv6 /64 e representações equivalentes', async () => {
  const hash = await networkKey(ipRequest('192.0.2.1'), env, '2026-09-11');
  assert.match(hash, /^[a-f0-9]{64}$/u);
  assert.equal(hash, await networkKey(ipRequest('::ffff:192.0.2.1'), env, '2026-09-11'));
  assert.notEqual(hash, await networkKey(ipRequest('192.0.2.1'), env, '2026-09-12'));
  assert.equal(await networkKey(ipRequest('2001:db8:1:2::1'), env, '2026-09-11'),
    await networkKey(ipRequest('2001:0db8:0001:0002::ffff'), env, '2026-09-11'));
  for (const ip of [null, 'unknown', '999.1.1.1', '192.00.2.1', '1.2.3.4, 1.2.3.5', '::1%eth0']) {
    await assert.rejects(networkKey(ipRequest(ip), env, '2026-09-11'), { code: 'NETWORK_UNAVAILABLE' });
  }
});
test('cotas: janelas de minuto e dia são UTC', () => {
  const w = quotaWindows(Date.parse('2026-09-11T23:59:59Z'));
  assert.equal(w.day, '2026-09-11'); assert.equal(w.minute, '2026-09-11T23:59');
  assert.equal(quotaWindows(Date.parse('2026-09-12T00:00:00Z')).day, '2026-09-12');
});
const jsonRequest = (body, headers = {}) => new Request('https://t.test', { method: 'POST', body, headers: { 'Content-Type': 'application/json', ...headers } });
test('corpo JSON: limites, formato, encoding e tamanho real, não só Content-Length', async () => {
  assert.deepEqual(await readJsonBody(jsonRequest('{"mode":"ready"}')), { mode: 'ready' });
  for (const [req, code] of [
    [jsonRequest('x'.repeat(16385)), 'BODY_TOO_LARGE'], [jsonRequest('{}', { 'Content-Length': '1' }), 'INVALID_INPUT'],
    [jsonRequest('{}', { 'Content-Length': '20000' }), 'BODY_TOO_LARGE'],
    [jsonRequest('{}', { 'Content-Type': 'text/plain' }), 'UNSUPPORTED_MEDIA'],
    [jsonRequest('{}', { 'Content-Encoding': 'gzip' }), 'UNSUPPORTED_MEDIA'],
    [jsonRequest('no JSON'), 'INVALID_INPUT'], [jsonRequest(new Uint8Array([255])), 'INVALID_INPUT'],
  ]) await assert.rejects(readJsonBody(req), { code });
});
test('corpo JSON: timeout cancela stream parado', async () => {
  let cancelled = false;
  const stream = new ReadableStream({ cancel() { cancelled = true; } });
  const req = new Request('https://t.test', { method: 'POST', body: stream, duplex: 'half', headers: { 'Content-Type': 'application/json' } });
  await assert.rejects(readJsonBody(req, { timeoutMs: 5 }), { code: 'UPLOAD_TIMEOUT' });
  assert.equal(cancelled, true);
});
