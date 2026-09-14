import { assertSameOriginMutation, requireVisitorSession, SessionError } from '../security/session.js';
import { requestKey, networkKey, reserveUsage, finishUsage, pruneUsage, QuotaError } from '../security/quota.js';
import { HttpInputError, readJsonBody } from './json-body.js';
import { ContractError } from '../contracts/generation.js';
import { validateVideoSelection, videoReply } from '../contracts/video-request.js';
import { selectedVideoTitle } from '../video/selection.js';
import { getSupportVideo } from '../video/service.js';
import { videoWindows } from '../security/video-quota.js';

const ERRORS = Object.freeze({
  ORIGIN_FORBIDDEN: [403, 'Abra o aplicativo pelo endereço original e tente novamente.'],
  SESSION_REQUIRED: [401, 'Sua sessão não está disponível. Inicie uma sessão para continuar.'],
  INVALID_REQUEST_KEY: [400, 'O pedido precisa de um identificador válido.'],
  INVALID_INPUT: [400, 'Confira a alternativa escolhida.'],
  UNSUPPORTED_MEDIA: [415, 'Envie o pedido no formato esperado.'],
  BODY_TOO_LARGE: [413, 'O pedido excede o tamanho permitido.'],
  REQUEST_CANCELLED: [400, 'O envio foi cancelado.'],
  UPLOAD_TIMEOUT: [408, 'O envio demorou demais.'],
  LIMIT_REACHED: [429, 'Um dos limites de acesso da demo foi atingido. Tente mais tarde.'],
  SERVICE_UNAVAILABLE: [503, 'Não foi possível acessar esta seleção agora. Sua receita continua disponível.'],
});
const json = (data, status = 200) => Response.json(data, { status,
  headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
function failure(error) {
  const known = error instanceof SessionError || error instanceof QuotaError || error instanceof HttpInputError;
  const proposed = error instanceof ContractError ? 'INVALID_INPUT' : known ? error.code : '';
  const code = Object.hasOwn(ERRORS, proposed) ? proposed : 'SERVICE_UNAVAILABLE';
  const [status, message] = ERRORS[code];
  return json({ code, message }, status);
}
async function access(request, env, now) {
  if (env?.SESSIONS_ENABLED !== 'true') throw new HttpInputError('SERVICE_UNAVAILABLE');
  await pruneUsage(env, { now });
  const ingress = await reserveUsage(request, env, 'ingress', null, { now });
  await finishUsage(env, ingress.id, true);
  return requireVisitorSession(request, env, { now });
}

// Dependências injetáveis só por código de teste. Headers/env nunca selecionam
// autenticação, relógio ou transporte alternativos; a rota pública usa os padrões.
export function createVideoHandler({ fetchImpl, clock = Date.now, authorize = access, deriveNetwork = networkKey, timeoutMs } = {}) {
  return async function video({ request, env }) {
    let title, visitor, key;
    try {
      assertSameOriginMutation(request);
      if (request.method !== 'POST' || new URL(request.url).search) throw new HttpInputError('INVALID_INPUT');
      visitor = await authorize(request, env, clock());
      key = requestKey(request);
      const input = validateVideoSelection(await readJsonBody(request, { maxBytes: 512 }));
      title = await selectedVideoTitle(env, visitor, input, clock());
    } catch (error) { return failure(error); }

    // Flag desligada permite somente alternativa autorizada: sem cache ou Google.
    if (env?.VIDEO_ENABLED !== 'true') return json({ data: videoReply(title, null, { disabled: true }) });
    try {
      const now = clock(), day = videoWindows(now).day;
      const networkHash = await deriveNetwork(request, env, day);
      const result = await getSupportVideo({ title }, { ...visitor, requestKey: key, networkHash, networkDay: day },
        { DB: env.DB, policyJson: env.VIDEO_QUOTA_POLICY_JSON, apiKey: env.YOUTUBE_API_KEY,
          fetchImpl, clock, timeoutMs });
      return json({ data: videoReply(title, result.result) });
    } catch { return json({ data: videoReply(title) }); }
  };
}
