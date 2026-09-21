import test from 'node:test';
import assert from 'node:assert/strict';
import { videoQuotaPolicy, videoWindows, validateVideoContext, reserveVideoSearch, VideoQuotaError } from '../src/security/video-quota.js';
import { videoDb } from './helpers/video-db.js';

// Valores fictícios de cenário, não política de produção nem quota medida.
const policy = { visitorDay: 4, visitorMinute: 2, networkDay: 6, networkMinute: 4,
  globalDay: 8, globalMinute: 5, projectDay: 12, otherDay: 2, marginDay: 2 };
const now = Date.parse('2026-09-12T15:00:00Z');
const context = () => ({ visitorId: crypto.randomUUID(), requestKey: crypto.randomUUID(),
  networkHash: 'a'.repeat(64), networkDay: '2026-09-12', expiresAt: new Date(now + 86400000).toISOString() });
const makeDB = t => { const DB = videoDb(); t.after(() => DB.sqlite.close()); return DB; };

test('vídeo cota: configuração explícita fechada, sem valores padrão', () => {
  assert.deepEqual(videoQuotaPolicy(JSON.stringify(policy)), policy);
  for (const input of [undefined, null, '', '{}', '[]', 'null', '{', ' '.repeat(2049),
    ...[{ ...policy, unknown: 1 }, { ...policy, globalDay: 9 }, { ...policy, visitorMinute: 5 },
      { ...policy, networkDay: 3 }, { ...policy, networkMinute: 1 }, { ...policy, globalMinute: 9 },
      { ...policy, projectDay: 0 }, { ...policy, otherDay: -1 }, { ...policy, marginDay: 0.5 },
      { ...policy, visitorDay: '4' }, { ...policy, globalDay: 0 }, { ...policy, projectDay: 10000001 }].map(JSON.stringify)]) {
    assert.throws(() => videoQuotaPolicy(input), VideoQuotaError);
  }
});

test('vídeo cota: Pacífico reinicia corretamente nos dias de 23 e 25 horas', () => {
  for (const [instant, day, reset] of [
    ['2026-03-08T08:00:00Z', '2026-03-08', '2026-03-09T07:00:00Z'],
    ['2026-11-01T07:00:00Z', '2026-11-01', '2026-11-02T08:00:00Z'],
    ['2026-09-12T06:59:59Z', '2026-09-11', '2026-09-12T07:00:00Z'],
    ['2026-09-12T07:00:00Z', '2026-09-12', '2026-09-13T07:00:00Z'],
    ['2026-12-31T20:00:00Z', '2026-12-31', '2027-01-01T08:00:00Z'],
  ]) {
    const actual = videoWindows(Date.parse(instant));
    assert.equal(actual.day, day); assert.equal(actual.resetAt, Date.parse(reset));
  }
  assert.notEqual(videoWindows(Date.parse('2026-11-01T08:30:00Z')).minute,
    videoWindows(Date.parse('2026-11-01T09:30:00Z')).minute);
  for (const value of [NaN, 0, -1, 1.5, '123']) assert.throws(() => videoWindows(value), VideoQuotaError);
});

test('vídeo cota: contexto deve ser sessão válida e pseudônimo do dia PT', () => {
  const valid = context(), windows = videoWindows(now);
  assert.equal(validateVideoContext(valid, now, windows), Date.parse(valid.expiresAt));
  for (const invalid of [null, {}, { ...valid, visitorId: 'arroz' }, { ...valid, requestKey: '' },
    { ...valid, networkHash: '127.0.0.1' }, { ...valid, networkDay: '2026-09-11' },
    { ...valid, expiresAt: new Date(now).toISOString() }, { ...valid, expiresAt: 'amanhã' },
    { ...valid, expiresAt: new Date(now + 31 * 86400000).toISOString() }]) {
    assert.throws(() => validateVideoContext(invalid, now, windows), VideoQuotaError);
  }
});

test('vídeo cota: seis contadores sem tokens; rollback integral ao esgotar', async t => {
  const DB = makeDB(t), ctx = context();
  const p = videoQuotaPolicy(JSON.stringify({ ...policy, visitorDay: 1, visitorMinute: 1 }));
  await reserveVideoSearch(DB, 'arroz', ctx, p, now);
  await assert.rejects(reserveVideoSearch(DB, 'feijão', { ...ctx, requestKey: crypto.randomUUID() }, p, now), { code: 'quota_exceeded' });
  assert.equal(DB.sqlite.prepare('SELECT count(*) n FROM video_usage_buckets').get().n, 6);
  assert.equal(DB.sqlite.prepare('SELECT sum(requests) n FROM video_usage_buckets').get().n, 6);
  assert.equal(DB.sqlite.prepare('SELECT count(*) n FROM video_claims').get().n, 1);
  const receipt = DB.sqlite.prepare('SELECT * FROM video_usage_reservations').get();
  assert.equal(receipt.expires_at, Date.parse(ctx.expiresAt));
  assert.equal(JSON.stringify(receipt).includes('arroz'), false);
  assert.equal(JSON.stringify(receipt).includes('tokens'), false);
  assert.equal(DB.sqlite.prepare('SELECT count(*) n FROM usage_reservations').get().n, 0);
});

for (const scope of ['visitor', 'network', 'global']) for (const period of ['Day', 'Minute']) {
  test(`vídeo cota: limite ${scope}/${period} impede nova reserva`, async t => {
    const DB = makeDB(t), first = context();
    const p = { ...policy, visitorDay: 20, visitorMinute: 20, networkDay: 20,
      networkMinute: 20, globalDay: 20, globalMinute: 20, projectDay: 30 };
    p[scope + period] = 1;
    if (period === 'Day') p[scope + 'Minute'] = 1;
    if (scope === 'network') { p['visitor' + period] = 1; if (period === 'Day') p.visitorMinute = 1; }
    const parsed = videoQuotaPolicy(JSON.stringify(p));
    await reserveVideoSearch(DB, 'arroz', first, parsed, now);
    const second = { ...first, requestKey: crypto.randomUUID() };
    if (scope !== 'visitor') second.visitorId = crypto.randomUUID();
    if (scope === 'global') second.networkHash = 'b'.repeat(64);
    // Para isolar o teto diário, a segunda chamada ocorre no minuto seguinte.
    await assert.rejects(reserveVideoSearch(DB, 'feijão', second, parsed, now + (period === 'Day' ? 60000 : 0)), { code: 'quota_exceeded' });
    assert.equal(DB.sqlite.prepare('SELECT count(*) n FROM video_usage_reservations').get().n, 1);
  });
}

test('vídeo cota: duas disputas simultâneas pela última vaga têm somente um vencedor', async t => {
  const DB = makeDB(t), p = videoQuotaPolicy(JSON.stringify({ ...policy, globalDay: 1, globalMinute: 1 }));
  const results = await Promise.allSettled(['arroz', 'feijão'].map(title => reserveVideoSearch(DB, title, context(), p, now)));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.code, 'quota_exceeded');
  assert.equal(DB.sqlite.prepare("SELECT requests FROM video_usage_buckets WHERE scope = 'global' AND window LIKE 'day:%'").get().requests, 1);
});

test('vídeo cota: duplicata não ganha nova autorização após expiração da trava', async t => {
  const DB = makeDB(t), ctx = context();
  await reserveVideoSearch(DB, 'arroz', ctx, policy, now);
  await assert.rejects(reserveVideoSearch(DB, 'arroz', ctx, policy, now + 60001), { code: 'replay' });
  await assert.rejects(reserveVideoSearch(DB, 'feijão', ctx, policy, now + 60001), { code: 'replay' });
  assert.equal(DB.sqlite.prepare('SELECT count(*) n FROM video_usage_reservations').get().n, 1);
});
