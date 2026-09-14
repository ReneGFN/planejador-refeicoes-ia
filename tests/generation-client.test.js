import test from "node:test";
import assert from "node:assert/strict";
import { createGenerationClient, PENDING_KEY } from "../public/generation-client.js";

const response = (status, data) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
const storage = () => { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }; };

test("generation client establishes a session and sends credentials", async () => {
  const calls = [], store = storage();
  const client = createGenerationClient({ storage: store, uuid: (() => { let n = 0; return () => `key-${++n}`; })(), fetchImpl: async (url, init) => {
    calls.push([url, init]);
    return url === "/api/session" ? response(200, {}) : response(200, { data: { mode: "cook", suggestions: [{}] }, plan_id: "plan-1" });
  }});
  const result = await client.generate({ mode: "cook" });
  assert.equal(result.plan_id, "plan-1");
  assert.deepEqual(calls.map(([url]) => url), ["/api/session", "/api/generate"]);
  assert.ok(calls.every(([, init]) => init.credentials === "same-origin"));
  assert.equal(store.getItem(PENDING_KEY), null);
});

test("generation client reuses the same idempotency key after a network failure", async () => {
  const keys = [], store = storage(); let generationAttempts = 0, ids = 0;
  const client = createGenerationClient({ storage: store, uuid: () => `id-${++ids}`, fetchImpl: async (url, init) => {
    if (url === "/api/session") return response(200, {});
    keys.push(init.headers["Idempotency-Key"]); generationAttempts++;
    if (generationAttempts === 1) throw new TypeError("network");
    return response(200, { data: { mode: "cook", suggestions: [{}] } });
  }});
  await assert.rejects(client.generate({ mode: "cook" }), error => error.retryable);
  await client.generate({ mode: "cook" });
  assert.deepEqual(keys, ["id-2", "id-2"]);
  assert.equal(store.getItem(PENDING_KEY), null);
});

test("generation client restores a completed plan from duplicate replay", async () => {
  const store = storage(); let ids = 0;
  const client = createGenerationClient({ storage: store, uuid: () => `id-${++ids}`, fetchImpl: async url => url === "/api/session" ? response(200, {}) : response(409, { replay: { available: true, plan: { id: "saved-plan", data: { mode: "ready", suggestions: [{ title: "Prato" }] } } } }) });
  const result = await client.generate({ mode: "ready" });
  assert.equal(result.replayed, true);
  assert.equal(result.plan_id, "saved-plan");
  assert.equal(result.data.suggestions[0].title, "Prato");
});
