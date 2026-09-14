// Transporte exclusivo de servidor, compartilhado pelos dois modelos.
const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const MAX_RESPONSE_BYTES = 256 * 1024;

export class ProviderError extends Error {
  constructor(code, usage = null) {
    super(code); this.name = 'ProviderError'; this.code = code; this.usage = usage;
  }
}

export function validateProviderOptions({ apiKey, timeoutMs = 30000 } = {}) {
  if (typeof apiKey !== 'string' || !apiKey.trim()) throw new ProviderError('MISSING_API_KEY');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) throw new ProviderError('INVALID_TIMEOUT');
}

function usageOf(raw) {
  const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
  return {
    prompt_tokens: count(raw?.prompt_tokens), completion_tokens: count(raw?.completion_tokens),
    total_tokens: count(raw?.total_tokens), reasoning_tokens: count(raw?.completion_tokens_details?.reasoning_tokens),
  };
}

async function readJson(response, signal) {
  if (!response.body) throw new ProviderError('INVALID_PROVIDER_RESPONSE');
  const reader = response.body.getReader();
  const bytes = new Uint8Array(MAX_RESPONSE_BYTES);
  let size = 0;
  let cancellation;
  const abort = () => { cancellation = reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (signal.aborted) throw new ProviderError('TIMEOUT');
      if (done) break;
      if (size + value.byteLength > MAX_RESPONSE_BYTES) {
        await reader.cancel(); throw new ProviderError('RESPONSE_TOO_LARGE');
      }
      bytes.set(value, size); size += value.byteLength;
    }
  } finally {
    signal.removeEventListener('abort', abort);
    if (cancellation) await cancellation;
    reader.releaseLock();
  }
  try { return JSON.parse(new TextDecoder().decode(bytes.subarray(0, size))); }
  catch { throw new ProviderError('INVALID_PROVIDER_RESPONSE'); }
}

async function rejectedRequestCode(response, signal) {
  try {
    // Mesmo limite de bytes/prazo do transporte; nunca analisar failed_generation.
    const body = await readJson(response, signal);
    const error = body?.error;
    if (error && typeof error === 'object' && !Array.isArray(error) && error.code === 'json_validate_failed') {
      // Não elegível à cortesia: injeção pode induzir este erro. Não usar INVALID_OUTPUT
      // como sinônimo nem HTTP 502 como critério de crédito; elegibilidade é por código.
      return 'PROVIDER_SCHEMA_REJECTED';
    }
  } catch {
    // O HTTP 400 já é conhecido. Diagnóstico incompleto não vira TIMEOUT elegível.
  }
  return 'PROVIDER_REJECTED_REQUEST';
}

// Sem repetição, redirecionamento ou exposição do envelope bruto ao chamador.
export async function completeWithGroq(body, validateContent, { apiKey, fetchImpl = fetch, timeoutMs = 30000 } = {}) {
  validateProviderOptions({ apiKey, timeoutMs });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const response = await fetchImpl(ENDPOINT, {
      method: 'POST', redirect: 'error', signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey.trim()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      if (response.status === 400) throw new ProviderError(await rejectedRequestCode(response, controller.signal));
      await response.body?.cancel();
      const code = response.status === 429 ? 'RATE_LIMITED'
        : [401, 403].includes(response.status) ? 'AUTH_ERROR'
          : [413, 415, 422].includes(response.status) ? 'PROVIDER_REJECTED_REQUEST' : 'PROVIDER_UNAVAILABLE';
      throw new ProviderError(code);
    }
    const envelope = await readJson(response, controller.signal);
    const usage = usageOf(envelope?.usage);
    const choice = envelope?.choices?.[0];
    if (choice?.message?.refusal) throw new ProviderError('REFUSED', usage);
    if (choice?.finish_reason === 'length') throw new ProviderError('TRUNCATED', usage);
    if (choice?.finish_reason !== 'stop') throw new ProviderError('INVALID_PROVIDER_RESPONSE', usage);
    if (envelope.model !== body.model) throw new ProviderError('UNEXPECTED_MODEL', usage);
    let data;
    try { data = validateContent(choice.message.content); }
    catch { throw new ProviderError('INVALID_OUTPUT', usage); }
    return { data, metadata: { model: envelope.model, usage, elapsed_ms: Date.now() - started } };
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError(controller.signal.aborted ? 'TIMEOUT' : 'NETWORK_ERROR');
  } finally { clearTimeout(timer); }
}
