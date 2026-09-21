// Adaptador interno de servidor, sem rota, cota, cache, banco ou chamada à LLM.
import { VIDEO_LIMITS, validateVideoInput, validateYouTubeSearchResponse, validateYouTubeError } from '../contracts/video.js';

const ENDPOINT = 'https://www.googleapis.com/youtube/v3/search';
const MESSAGES = Object.freeze({
  VIDEO_REDIRECT_REJECTED: 'O vídeo de apoio está indisponível no momento.',
  VIDEO_CONFIG_ERROR: 'O vídeo de apoio está indisponível no momento.',
  VIDEO_TIMEOUT: 'A busca do vídeo demorou mais que o esperado.',
  VIDEO_RESPONSE_TOO_LARGE: 'Não foi possível consultar o vídeo de apoio.',
  VIDEO_INVALID_RESPONSE: 'Não foi possível consultar o vídeo de apoio.',
  VIDEO_QUOTA_EXCEEDED: 'Você pode buscar um tutorial diretamente no YouTube.',
  VIDEO_RATE_LIMITED: 'Você pode buscar um tutorial diretamente no YouTube.',
  VIDEO_ACCESS_DENIED: 'O vídeo de apoio está indisponível no momento.',
  VIDEO_REQUEST_REJECTED: 'Não foi possível consultar o vídeo de apoio.',
  VIDEO_UNAVAILABLE: 'O vídeo de apoio está indisponível no momento.',
  VIDEO_NETWORK_ERROR: 'Não foi possível consultar o vídeo de apoio.',
});
export class VideoProviderError extends Error {
  constructor(code) {
    const safeCode = Object.hasOwn(MESSAGES, code) ? code : 'VIDEO_UNAVAILABLE';
    super(MESSAGES[safeCode]); this.name = 'VideoProviderError'; this.code = safeCode;
  }
}
const error = code => new VideoProviderError(code);

// Prazo único cobre cabeçalhos, corpo e cancelamento, inclusive fetch simulado
// que não respeite AbortSignal. Rejeição tardia também tem um observador.
function untilAbort(promise, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => reject(error('VIDEO_TIMEOUT'));
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    if (signal.aborted) abort();
  });
}
async function cancelBody(body, signal) {
  try { if (body) await untilAbort(body.cancel(), signal); } catch { /* Não expor falha de cancelamento. */ }
}
async function readJson(response, signal) {
  if (!response.body) throw error('VIDEO_INVALID_RESPONSE');
  const reader = response.body.getReader();
  const bytes = new Uint8Array(VIDEO_LIMITS.responseBytes);
  let size = 0, complete = false;
  try {
    while (true) {
      const { done, value } = await untilAbort(reader.read(), signal);
      if (signal.aborted) throw error('VIDEO_TIMEOUT');
      if (done) { complete = true; break; }
      if (!(value instanceof Uint8Array)) throw error('VIDEO_INVALID_RESPONSE');
      if (size + value.byteLength > bytes.length) throw error('VIDEO_RESPONSE_TOO_LARGE');
      bytes.set(value, size); size += value.byteLength;
    }
  } finally {
    if (!complete) await cancelBody(reader, signal);
    reader.releaseLock();
  }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, size))); }
  catch { throw error('VIDEO_INVALID_RESPONSE'); }
}

async function httpError(response, signal) {
  let code = response.status === 429 ? 'VIDEO_RATE_LIMITED'
    : [401, 403].includes(response.status) ? 'VIDEO_ACCESS_DENIED'
      : response.status >= 400 && response.status < 500 ? 'VIDEO_REQUEST_REJECTED' : 'VIDEO_UNAVAILABLE';
  if (response.status === 403) {
    try {
      const classification = validateYouTubeError(await readJson(response, signal), response.status);
      if (classification === 'quota_exceeded') code = 'VIDEO_QUOTA_EXCEEDED';
      if (classification === 'rate_limited') code = 'VIDEO_RATE_LIMITED';
    } catch {
      // Diagnóstico desconhecido/malformado mantém o HTTP sanitizado, não ausência.
      if (signal.aborted) return error('VIDEO_TIMEOUT');
    }
  } else await cancelBody(response.body, signal);
  return error(code);
}

export async function searchYouTubeVideo(raw, { apiKey, fetchImpl = fetch, timeoutMs = 5000 } = {}) {
  const input = validateVideoInput(raw);
  if (typeof apiKey !== 'string' || !/^[\x21-\x7e]{1,1024}$/u.test(apiKey)
      || typeof fetchImpl !== 'function' || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000) {
    throw error('VIDEO_CONFIG_ERROR');
  }
  const url = new URL(ENDPOINT);
  const params = { part: 'snippet', type: 'video', videoEmbeddable: 'true', videoSyndicated: 'true',
    relevanceLanguage: 'pt', regionCode: 'BR', safeSearch: 'strict', order: 'relevance',
    maxResults: String(VIDEO_LIMITS.candidates),
    fields: 'items(id(kind,videoId),snippet(title,channelId,channelTitle))', q: input.title };
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const pending = Promise.resolve(fetchImpl(url.href, { method: 'GET', redirect: 'manual',
      signal: controller.signal, headers: { Accept: 'application/json', 'X-Goog-Api-Key': apiKey } }))
      .then(async response => {
        if (controller.signal.aborted) {
          await cancelBody(response.body, controller.signal); throw error('VIDEO_TIMEOUT');
        }
        return response;
      });
    const response = await untilAbort(pending, controller.signal);
    if (response.status >= 300 && response.status < 400) {
      await cancelBody(response.body, controller.signal); throw error('VIDEO_REDIRECT_REJECTED');
    }
    if (!response.ok) throw await httpError(response, controller.signal);
    const rawResponse = await readJson(response, controller.signal);
    try { return validateYouTubeSearchResponse(rawResponse, input); }
    catch { throw error('VIDEO_INVALID_RESPONSE'); }
  } catch (caught) {
    if (controller.signal.aborted) throw error('VIDEO_TIMEOUT');
    if (caught instanceof VideoProviderError) throw caught;
    throw error('VIDEO_NETWORK_ERROR');
  } finally { clearTimeout(timer); }
}
