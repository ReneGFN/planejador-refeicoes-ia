export class ApiError extends Error {
  constructor(message: string, readonly status = 0, readonly code = "CLIENT_ERROR") { super(message); }
}

const key = () => crypto.randomUUID();
let sessionAttempt: Promise<boolean> | null = null;

async function parse(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(body.message || "Não foi possível concluir esta ação.", response.status, body.code);
  return body;
}

export async function ensureSession() {
  if (!sessionAttempt) sessionAttempt = fetch("/api/session", {
    method: "POST", credentials: "same-origin",
    headers: { "Content-Type": "application/json", "Idempotency-Key": key() }, body: "{}",
  }).then(response => parse(response).then(() => true)).catch(() => false);
  return sessionAttempt;
}

async function request(path: string, init: RequestInit = {}) {
  if (!await ensureSession()) throw new ApiError("Servidor local ainda não ativado; mantendo os dados nesta sessão.", 503, "NOT_READY");
  const headers = new Headers(init.headers);
  if (init.method && init.method !== "GET") headers.set("Idempotency-Key", key());
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  return parse(await fetch(path, { ...init, headers, credentials: "same-origin" }));
}

export type MealRecord = { id: string; description: string; eaten_at: string; servings_consumed?: number };
export type PantryRecord = { id: string; name: string; quantity?: number; unit?: string; expires_at?: string; revision: number };
export type PreferencesRecord = { version: 1; use_history: boolean; use_pantry?: boolean; defaults: Record<string, unknown> };
export type PlanRecord = { id: string; request: { mode: "cook" | "ready" }; data: { mode: "cook" | "ready"; suggestions: Array<Record<string, unknown>> } };

export const api = {
  meals: {
    list: async () => (await request("/api/meal-logs?limit=50")).data as MealRecord[],
    create: async (description: string) => request("/api/meal-logs", { method: "POST", body: JSON.stringify({ version: 1, source: "manual", description, eaten_at: new Date().toISOString(), confirmed_consumed: true }) }),
    update: async (meal: MealRecord, description: string) => request(`/api/meal-logs/${meal.id}`, { method: "PUT", body: JSON.stringify({ version: 1, description, eaten_at: meal.eaten_at, ...(meal.servings_consumed ? { servings_consumed: meal.servings_consumed } : {}) }) }),
    remove: async (id: string) => request(`/api/meal-logs/${id}`, { method: "DELETE", body: JSON.stringify({ version: 1 }) }),
  },
  pantry: {
    list: async () => (await request("/api/pantry")).data as PantryRecord[],
    create: async (item: Omit<PantryRecord, "id" | "revision">) => request("/api/pantry", { method: "POST", body: JSON.stringify({ version: 1, ...item }) }),
    remove: async (item: PantryRecord) => request(`/api/pantry/${item.id}`, { method: "DELETE", body: JSON.stringify({ version: 1, revision: item.revision }) }),
  },
  preferences: {
    get: async () => (await request("/api/preferences")).data as PreferencesRecord,
    save: async (value: { history: boolean; pantry: boolean }) => (await request("/api/preferences", { method: "PUT", body: JSON.stringify({ version: 1, use_history: value.history, use_pantry: value.pantry, defaults: {} }) })).data as PreferencesRecord,
  },
  plans: {
    list: async () => (await request("/api/plans")).data as PlanRecord[],
    remove: async (id: string) => request(`/api/plans/${id}`, { method: "DELETE" }),
  },
  analyze: async (file: File) => {
    const form = new FormData(); form.append("image", file);
    return (await request("/api/analyze-ingredients", { method: "POST", body: form })).data as { version: 1; status: "recognized" | "no_ingredients" | "unreadable"; ingredients: string[] };
  },
};
