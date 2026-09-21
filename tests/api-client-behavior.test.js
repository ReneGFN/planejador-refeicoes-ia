import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import { readFileSync } from 'node:fs';

test('cliente deixa o servidor cravar o horário no diário manual e no consumo do plano', async () => {
  const calls = [];
  const fetch = async (path, init = {}) => {
    calls.push({ path, init });
    if (path === '/api/session') return Response.json({ data: { ok: true } }, { status: 201 });
    return Response.json({ data: {
      id: crypto.randomUUID(), operation: 'create', applied: true,
      meal: { id: crypto.randomUUID(), description: 'Jantar', eaten_at: '2026-09-20T20:00:00.000Z' },
      plan_meal_log: { id: crypto.randomUUID(), side: 'cook', suggestion_index: 0, rating: null },
    } }, { status: 201 });
  };
  const source = readFileSync(new URL('../frontend/api-client.ts', import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
  } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, { module, exports: module.exports, fetch, Response, Headers, FormData, crypto });
  const { api } = module.exports;

  await api.meals.create('Jantar');
  await api.meals.consume({ plan_id: crypto.randomUUID(), side: 'cook', suggestion_index: 0 });

  const payloads = calls.filter(call => call.path === '/api/meal-logs').map(call => JSON.parse(call.init.body));
  assert.equal(payloads.length, 2);
  assert.deepEqual(payloads.map(payload => payload.source), ['manual', 'plan_suggestion']);
  assert.equal(payloads.every(payload => !Object.hasOwn(payload, 'eaten_at')), true);
  assert.equal(payloads.every(payload => payload.confirmed_consumed === true), true);
});
