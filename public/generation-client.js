const PENDING_KEY = "refeicao-facil:pending-generation";

export class GenerationError extends Error {
  constructor(message, { status = 0, code = "REQUEST_FAILED", retryable = false } = {}) {
    super(message);
    this.name = "GenerationError";
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

const parseJson = async (response) => response.json().catch(() => ({}));

export function createGenerationClient({ fetchImpl = globalThis.fetch?.bind(globalThis), storage = globalThis.sessionStorage, uuid = () => globalThis.crypto.randomUUID() } = {}) {
  if (!fetchImpl) throw new Error("fetch não está disponível.");

  async function ensureSession() {
    const response = await fetchImpl("/api/session", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "Idempotency-Key": uuid() }, body: "{}" });
    const data = await parseJson(response);
    if (!response.ok) throw new GenerationError(data.message || "Não foi possível iniciar sua sessão.", { status: response.status, code: data.code, retryable: response.status >= 500 });
  }

  function readPending(body) {
    try { const saved = JSON.parse(storage?.getItem(PENDING_KEY) || "null"); return saved?.body === body && saved?.key ? saved : null; }
    catch { return null; }
  }

  function pendingRequest(payload) {
    const body = JSON.stringify(payload), saved = readPending(body);
    if (saved) return saved;
    const pending = { body, key: uuid() };
    storage?.setItem(PENDING_KEY, JSON.stringify(pending));
    return pending;
  }

  function clearPending(key) {
    try { const saved = JSON.parse(storage?.getItem(PENDING_KEY) || "null"); if (!saved || saved.key === key) storage?.removeItem(PENDING_KEY); }
    catch { storage?.removeItem(PENDING_KEY); }
  }

  const postGeneration = pending => fetchImpl("/api/generate", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "Idempotency-Key": pending.key }, body: pending.body });

  async function generate(payload) {
    await ensureSession();
    const pending = pendingRequest(payload);
    let response;
    try {
      response = await postGeneration(pending);
      if (response.status === 401) { await ensureSession(); response = await postGeneration(pending); }
    } catch (error) {
      if (error instanceof GenerationError) throw error;
      throw new GenerationError("A conexão caiu durante o pedido. Tente novamente: não cobraremos uma segunda geração.", { code: "NETWORK_ERROR", retryable: true });
    }
    const data = await parseJson(response);
    if (response.status === 409 && data?.replay?.available && data.replay.plan) {
      clearPending(pending.key);
      return { data: data.replay.plan.data, plan_id: data.replay.plan.id, replayed: true };
    }
    if (!response.ok) {
      const retryable = response.status === 409 || response.status >= 500;
      if (!retryable) clearPending(pending.key);
      const message = response.status === 409 ? "Seu pedido ainda está sendo concluído. Aguarde um instante e tente novamente." : data.message || "Não foi possível gerar as sugestões agora.";
      throw new GenerationError(message, { status: response.status, code: data.code, retryable });
    }
    clearPending(pending.key);
    return data;
  }

  return { ensureSession, generate };
}

export { PENDING_KEY };
