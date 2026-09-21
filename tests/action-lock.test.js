import test from 'node:test';
import assert from 'node:assert/strict';
import { createActionLock } from '../frontend/action-lock.js';

test('trava de ação recusa dois toques imediatos e libera após falha', () => {
  const lock = createActionLock();
  assert.equal(lock.start('consume:plan:0'), true);
  assert.equal(lock.start('consume:plan:0'), false);
  lock.finish('consume:plan:0');
  assert.equal(lock.start('consume:plan:0'), true);
});

test('dois cliques imediatos executam uma única gravação', async () => {
  const lock = createActionLock();
  let writes = 0, release;
  const pending = new Promise(resolve => { release = resolve; });
  const click = async () => {
    const key = 'consume:plan:cook:0';
    if (!lock.start(key)) return false;
    try { writes++; await pending; return true; }
    finally { lock.finish(key); }
  };
  const first = click(), second = click();
  assert.equal(writes, 1);
  assert.equal(await second, false);
  release();
  assert.equal(await first, true);
  assert.equal(writes, 1);
});
