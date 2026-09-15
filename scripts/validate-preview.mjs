import { performance } from "node:perf_hooks";

const base = process.argv[2]?.replace(/\/$/u, "");
if (!base || !process.argv.includes("--send-real") || !base.startsWith("https://")) {
  console.error("Uso: node scripts/validate-preview.mjs https://URL --send-real");
  process.exit(2);
}

const key = () => crypto.randomUUID();
async function call(path, { method = "GET", cookie, body, form } = {}) {
  const headers = { Origin: base };
  if (cookie) headers.Cookie = cookie;
  if (method !== "GET") headers["Idempotency-Key"] = key();
  if (body) headers["Content-Type"] = "application/json";
  const started = performance.now();
  const response = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : form });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data, elapsedMs: Math.round(performance.now() - started), setCookie: response.headers.get("set-cookie")?.split(";", 1)[0] };
}

async function session() {
  const result = await call("/api/session", { method: "POST", body: {} });
  if (![200, 201].includes(result.status) || !result.setCookie) throw Error(`session:${result.status}`);
  return result.setCookie;
}

const userA = await session(), userB = await session();
const generated = await call("/api/generate", { method: "POST", cookie: userA, body: {
  mode: "cook", meal: "jantar", people: 2, time_minutes: 30,
  ingredient_policy: "only_available", ingredients: ["arroz", "feijão", "ovo"],
  preferences: "comida brasileira simples", equipment: ["fogao"], max_dishes: 3,
} });
if (generated.status !== 200) throw Error(`generation:${generated.status}:${generated.data?.code || "unknown"}`);

const plansA = await call("/api/plans", { cookie: userA });
const plansB = await call("/api/plans", { cookie: userB });
if (plansA.status !== 200 || plansB.status !== 200) throw Error(`plans:${plansA.status}:${plansB.status}`);
if (plansA.data?.data?.length !== 1 || plansB.data?.data?.length !== 0) throw Error("isolation:plans");

const erased = await call("/api/history", { method: "DELETE", cookie: userA, body: { version: 1, confirmed: true } });
const afterDelete = await call("/api/plans", { cookie: userA });
if (erased.status !== 200 || afterDelete.data?.data?.length !== 0) throw Error("deletion:history");

const usage = generated.data?.metadata?.usage || {};
const input = Number.isSafeInteger(usage.prompt_tokens) ? usage.prompt_tokens : null;
const output = Number.isSafeInteger(usage.completion_tokens) ? usage.completion_tokens : null;
const costUsd = input === null || output === null ? null : input * 0.075 / 1_000_000 + output * 0.30 / 1_000_000;
console.log(JSON.stringify({
  ok: true,
  generation: { status: generated.status, elapsed_ms: generated.elapsedMs, model: generated.data?.metadata?.model || null,
    tokens: { input, output, reasoning: usage.reasoning_tokens ?? null, total: usage.total_tokens ?? null },
    estimated_cost_usd: costUsd === null ? null : Number(costUsd.toFixed(8)) },
  isolation: { user_a_plan_count: plansA.data.data.length, user_b_plan_count: plansB.data.data.length, passed: true },
  deletion: { remaining_plan_count: afterDelete.data.data.length, passed: true },
}, null, 2));
