const base = process.argv[2]?.replace(/\/$/u, "");
if (!base || !process.argv.includes("--write-preview") || !base.startsWith("https://")) {
  console.error("Uso: node scripts/validate-preview-isolation.mjs https://URL --write-preview");
  process.exit(2);
}
const key = () => crypto.randomUUID();
async function call(path, { method = "GET", cookie, body } = {}) {
  const headers = { Origin: base, ...(cookie ? { Cookie: cookie } : {}), ...(method !== "GET" ? { "Idempotency-Key": key() } : {}), ...(body ? { "Content-Type": "application/json" } : {}) };
  const response = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, data: await response.json().catch(() => ({})), cookie: response.headers.get("set-cookie")?.split(";", 1)[0] };
}
async function session() { const value = await call("/api/session", { method: "POST", body: {} }); if (![200, 201].includes(value.status) || !value.cookie) throw Error(`session:${value.status}`); return value.cookie; }

const a = await session(), b = await session();
const pantry = await call("/api/pantry", { method: "POST", cookie: a, body: { version: 1, name: "ingrediente de teste", quantity: 1, unit: "unit" } });
const preferences = await call("/api/preferences", { method: "PUT", cookie: a, body: { version: 1, use_history: true, use_pantry: true, defaults: {} } });
if (pantry.status !== 201 || preferences.status !== 200) throw Error(`seed:${pantry.status}:${pantry.data?.code || "unknown"}:${preferences.status}:${preferences.data?.code || "unknown"}`);
const [aPreferences, bPreferences, aPantry, bPantry] = await Promise.all([
  call("/api/preferences", { cookie: a }), call("/api/preferences", { cookie: b }),
  call("/api/pantry", { cookie: a }), call("/api/pantry", { cookie: b }),
]);
if (aPreferences.data.data.use_history !== true || bPreferences.data.data.use_history !== false
    || aPantry.data.data.length !== 1 || bPantry.data.data.length !== 0) throw Error("isolation");
const erased = await call("/api/history", { method: "DELETE", cookie: a, body: { version: 1, confirmed: true } });
const [preferencesAfter, pantryAfter] = await Promise.all([call("/api/preferences", { cookie: a }), call("/api/pantry", { cookie: a })]);
if (erased.status !== 200 || preferencesAfter.data.data.use_history !== false || pantryAfter.data.data.length) throw Error("deletion");
console.log(JSON.stringify({ ok: true, isolation: { preferences: true, pantry: true }, deletion: { preferences: true, pantry: true } }));
