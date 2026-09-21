import { groqRequestInit, technicalCategory, validateProviderOptions } from './groq-client.js';

export async function modelsProbe(apiKey, redirect, fetchImpl = fetch) {
  const started = Date.now(), controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  let phase = 'request';
  try {
    validateProviderOptions({ apiKey });
    const init = groqRequestInit(apiKey, controller.signal, undefined);
    // Únicas diferenças intencionais: endpoint de metadados, GET sem corpo e célula 3 follow.
    init.method = 'GET'; delete init.body; init.redirect = redirect;
    phase = 'fetch';
    const response = await fetchImpl('https://api.groq.com/openai/v1/models', init);
    const result = { code: response.status === 200 ? 'OK' : [401, 403].includes(response.status) ? 'AUTH_ERROR' : 'HTTP_ERROR',
      http_status: response.status, redirected: response.redirected, diagnostic: null };
    phase = 'response_body';
    await response.body?.cancel();
    return { ...result, elapsed_ms: Date.now() - started };
  } catch (error) {
    return { code: error.code ?? (controller.signal.aborted ? 'TIMEOUT' : phase === 'fetch' ? 'NETWORK_ERROR' : 'PROBE_ERROR'),
      http_status: null, diagnostic: technicalCategory(error, phase), elapsed_ms: Date.now() - started };
  } finally { clearTimeout(timer); }
}
