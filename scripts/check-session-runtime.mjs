// Diagnóstico descartável: workerd + D1 locais, sem endpoint publicado.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

const migration = await readFile(new URL('../migrations/0001_initial.sql', import.meta.url), 'utf8');
const { outputFiles } = await build({
  stdin: {
    contents: `import { establishVisitorSession, requireVisitorSession } from './src/security/session.js';
      export default { async fetch(request, env) {
        try {
          if (request.method === 'POST') {
            const session = await establishVisitorSession(request, env);
            const headers = { 'Cache-Control': 'no-store' };
            if (session.setCookie) headers['Set-Cookie'] = session.setCookie;
            return Response.json({ visitorId: session.visitorId, created: session.created }, { headers });
          }
          const session = await requireVisitorSession(request, env);
          return Response.json({ visitorId: session.visitorId }, { headers: { 'Cache-Control': 'no-store' } });
        } catch (error) {
          return Response.json({ code: error.code ?? 'UNEXPECTED' }, { status: 400 });
        }
      }};`, resolveDir: process.cwd(),
  }, bundle: true, write: false, format: 'esm', platform: 'browser',
});
const mf = new Miniflare(convertV4MiniflareOptions({ host: '127.0.0.1', port: 0, workers: [{
  name: 'session-test', modules: true, script: outputFiles[0].text,
  compatibilityDate: '2026-09-06',
  bindings: { SESSION_SECRET: 'fake-runtime-secret-never-use-in-production' },
  d1Databases: { DB: 'session-test-disposable' },
}] }));
let checks = 0;
try {
  const db = await mf.getD1Database('DB', 'session-test');
  // Aplica o esquema só no banco efêmero desta instância Miniflare.
  const statements = migration.replace(/--[^\n]*/gu, '').split(';').map(sql => sql.trim()).filter(Boolean);
  for (const sql of statements) await db.prepare(sql).run();
  const call = (method = 'GET', cookie = '', origin = 'https://local.test') => mf.dispatchFetch('https://local.test/session', {
    method, headers: { Origin: origin, Cookie: cookie },
  });

  const first = await call('POST');
  const a = await first.json();
  assert.equal(first.status, 200);
  assert.equal(a.created, true);
  assert.equal(first.headers.get('Cache-Control'), 'no-store');
  const cookieA = first.headers.get('Set-Cookie').split(';')[0];
  const stored = await db.prepare('SELECT session_token_hash FROM visitors WHERE id = ?1').bind(a.visitorId).first();
  assert.match(stored.session_token_hash, /^[a-f0-9]{64}$/u);
  assert.notEqual(stored.session_token_hash, cookieA.split('=')[1]);
  checks++;

  const reused = await call('POST', cookieA);
  assert.deepEqual(await reused.json(), { visitorId: a.visitorId, created: false });
  assert.equal(reused.headers.get('Set-Cookie'), null);
  checks++;

  const second = await call('POST');
  const b = await second.json();
  const cookieB = second.headers.get('Set-Cookie').split(';')[0];
  assert.notEqual(a.visitorId, b.visitorId);
  assert.deepEqual(await (await call('GET', cookieA)).json(), { visitorId: a.visitorId });
  assert.deepEqual(await (await call('GET', cookieB)).json(), { visitorId: b.visitorId });
  checks++;

  for (const cookie of ['', `${cookieA}; ${cookieA}`, cookieA + 'invalid']) {
    assert.deepEqual(await (await call('GET', cookie)).json(), { code: 'SESSION_REQUIRED' });
  }
  checks++;

  assert.deepEqual(await (await call('POST', cookieA, 'https://elsewhere.test')).json(), { code: 'ORIGIN_FORBIDDEN' });
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM visitors').first()).n, 2);
  checks++;

  await db.prepare("UPDATE visitors SET created_at = datetime('now', '-30 days') WHERE id = ?1").bind(a.visitorId).run();
  assert.deepEqual(await (await call('GET', cookieA)).json(), { code: 'SESSION_REQUIRED' });
  checks++;

  await db.prepare('DELETE FROM visitors WHERE id = ?1').bind(b.visitorId).run();
  assert.deepEqual(await (await call('GET', cookieB)).json(), { code: 'SESSION_REQUIRED' });
  checks++;

  console.log(`Workers/D1 locais: ${checks} cenários de sessão aprovados; sem Groq ou banco remoto.`);
} finally { await mf.dispose(); }
