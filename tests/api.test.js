import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet } from '../functions/api/health.js';
import { onRequestPost } from '../functions/api/generate.js';

test('health não anuncia geração disponível nesta fase', async () => {
  const response = onRequestGet();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).generationAvailable, false);
});

test('geração permanece bloqueada mesmo com configuração habilitada', async () => {
  const response = await onRequestPost({ env: { AI_ENABLED: 'true' } });
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal((await response.json()).code, 'NOT_READY');
});
