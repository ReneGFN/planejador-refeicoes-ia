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
