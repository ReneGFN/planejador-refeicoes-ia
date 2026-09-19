import { assertSameOriginMutation, establishVisitorSession, requireVisitorSession, SessionError } from '../security/session.js';
import { quotaPolicy, requestKey, usageReservationId, reserveUsage, finishUsage, pruneUsage, QuotaError } from '../security/quota.js';
import { findPlan, savePlan, listPlans, deletePlan } from '../history/plans.js';
import { readPreferences, writePreferences } from '../history/preferences.js';
import { selectGenerationContext } from '../history/generation-context.js';
import { getMeal, listMeals, mutateMeal } from '../history/meal-logs.js';
import { mealId, validateMealQuery } from '../contracts/meal-log.js';
import { pantryId } from '../contracts/pantry.js';
import { listPantry, getPantryItem, mutatePantry } from '../history/pantry.js';
import { previewPantryDeduction, applyPantryDeduction } from '../history/pantry-deduction.js';
import { deleteHistory } from '../history/delete.js';
import { captureHistoryRevision } from '../history/revision.js';
import { readJsonBody, HttpInputError } from './json-body.js';
import { ContractError, validateGenerationInput } from '../contracts/generation.js';
import { ImageContractError } from '../contracts/image-analysis.js';
import { readImageUpload } from '../uploads/image-upload.js';
import { generateWithGroq } from '../providers/groq.js';
import { calculateComparison } from '../comparison/calculate.js';
import { analyzeImageWithGroq } from '../providers/groq-vision.js';
import { ProviderError, validateProviderOptions } from '../providers/groq-client.js';
import { observeContractFailure } from './contract-observability.js';

const ERRORS = {
  PROVIDER_REDIRECT_REJECTED: [503, 'O serviço está temporariamente indisponível.', 'SERVICE_UNAVAILABLE'],
  AUTH_ERROR: [503, 'O serviço está temporariamente indisponível.', 'SERVICE_UNAVAILABLE'],
  NETWORK_ERROR: [503, 'O serviço está temporariamente indisponível.', 'SERVICE_UNAVAILABLE'],
  PROVIDER_UNAVAILABLE: [503, 'O serviço está temporariamente indisponível.', 'SERVICE_UNAVAILABLE'],
  INVALID_PROVIDER_RESPONSE: [503, 'O serviço está temporariamente indisponível.', 'SERVICE_UNAVAILABLE'],
  UNEXPECTED_MODEL: [503, 'O serviço está temporariamente indisponível.', 'SERVICE_UNAVAILABLE'],
  INVALID_API_KEY: [503, 'O serviço está temporariamente indisponível.', 'SERVICE_UNAVAILABLE'],
  NOT_READY: [503, 'Esta função está em preparação. Nenhuma chamada à IA foi iniciada.'],
  ORIGIN_FORBIDDEN: [403, 'Abra o aplicativo pelo endereço original e tente novamente.'],
  SESSION_REQUIRED: [401, 'Sua sessão não está disponível. Inicie uma sessão para continuar.'],
  INVALID_REQUEST_KEY: [400, 'O pedido precisa de um identificador válido.'],
  INVALID_INPUT: [400, 'Confira os campos do pedido.'],
  UNSUPPORTED_MEDIA: [415, 'Envie o pedido no formato esperado.'],
  BODY_TOO_LARGE: [413, 'O pedido excede o tamanho permitido.'],
  REQUEST_CANCELLED: [400, 'O envio foi cancelado.'],
  UPLOAD_TIMEOUT: [408, 'O envio demorou demais.'],
  IMAGE_INVALID: [400, 'Não foi possível receber essa imagem. Confira o arquivo.'],
  IMAGE_TOO_LARGE: [413, 'A imagem excede o tamanho permitido.'],
  IMAGE_UNSUPPORTED: [415, 'Use uma imagem JPEG, PNG ou WebP.'],
  IMAGE_UPLOAD_TIMEOUT: [408, 'O envio da imagem demorou demais.'],
  LIMIT_REACHED: [429, 'Um dos limites de uso da demo foi atingido. Tente mais tarde.'],
  DUPLICATE_REQUEST: [409, 'Este pedido já foi recebido. Não será feita outra chamada à IA.'],
  RATE_LIMITED: [429, 'O provedor de IA atingiu um limite temporário. Tente mais tarde.'],
  TIMEOUT: [504, 'A IA não respondeu dentro do prazo.'],
  INVALID_OUTPUT: [502, 'A IA não devolveu uma resposta válida para este pedido.'],
  // Mesmo status de INVALID_OUTPUT, mas código distinto e não elegível à cortesia.
  PROVIDER_SCHEMA_REJECTED: [502, 'O provedor rejeitou o formato da resposta gerada pela IA.'],
  TRUNCATED: [502, 'A resposta da IA veio incompleta.'],
  REFUSED: [503, 'A IA não conseguiu atender a este pedido.'],
  PROVIDER_REJECTED_REQUEST: [422, 'O provedor não aceitou esta solicitação.'],
  SERVICE_UNAVAILABLE: [503, 'O serviço está temporariamente indisponível.'],
};
export const jsonResponse = (data, status = 200, extra = {}) => Response.json(data, {
  status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra },
});
function failure(error, reserved = false) {
  observeContractFailure(error, 'api');
  const known = error instanceof SessionError || error instanceof QuotaError || error instanceof HttpInputError || error instanceof ProviderError || error instanceof ImageContractError;
  const proposed = error instanceof ContractError && !(error instanceof ImageContractError) ? 'INVALID_INPUT' : known ? error.code : '';
  const code = Object.hasOwn(ERRORS, proposed) ? proposed : 'SERVICE_UNAVAILABLE';
  const [status, message, publicCode = code] = ERRORS[code];
  return jsonResponse({ code: publicCode, message, quotaReserved: reserved }, status);
}
function observeAi(operation, outcome, { code = null, elapsedMs = null, usage = null, diagnostic = null } = {}) {
  // Evento operacional fechado, composto somente pelas métricas agregadas abaixo.
  const event = { event: 'ai_operation', operation, outcome,
    code: typeof code === 'string' && code.length <= 40 ? code : 'UNEXPECTED',
    elapsed_ms: Number.isSafeInteger(elapsedMs) && elapsedMs >= 0 ? elapsedMs : null,
    total_tokens: Number.isSafeInteger(usage?.total_tokens) && usage.total_tokens >= 0 ? usage.total_tokens : null };
  if (diagnostic) event.diagnostic = diagnostic;
  console.log(JSON.stringify(event));
}
class ConfigurationError extends Error {
  constructor(reason) {
    super('A configuração da operação não está disponível.');
    this.name = 'ConfigurationError'; this.code = 'CONFIG_ERROR'; this.reason = reason;
  }
}
function duplicateGeneration(plan) {
  const [status, message] = ERRORS.DUPLICATE_REQUEST;
  return jsonResponse({ code: 'DUPLICATE_REQUEST', message, quotaReserved: false,
    replay: { available: Boolean(plan), plan,
      message: plan ? 'Plano recuperado sem outra chamada à IA.'
        : 'Não há plano salvo disponível para este pedido. Nenhuma nova geração foi iniciada.' } }, status);
}
function checkSecret(value, minimum = 1, maximum = Infinity) {
  if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) {
    throw new ConfigurationError('secret_missing');
  }
  if (typeof value !== 'string' || value.trim().length < minimum || value.length > maximum) {
    throw new ConfigurationError('secret_invalid');
  }
}
function checkConfig(env, operation) {
  const policy = env?.QUOTA_POLICY_JSON;
  if (policy === undefined || policy === null || (typeof policy === 'string' && !policy.trim())) {
    throw new ConfigurationError('policy_empty');
  }
  if (typeof policy !== 'string' || policy.length > 4096) throw new ConfigurationError('policy_invalid');
  let parsed;
  try { parsed = JSON.parse(policy); }
  catch { throw new ConfigurationError('policy_invalid'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new ConfigurationError('policy_invalid');
  if (!Object.keys(parsed).length) throw new ConfigurationError('policy_empty');
  try {
    // A mesma regra de cotas atende health e rotas; não manter um segundo validador.
    quotaPolicy(env, operation);
    if (operation !== 'session') quotaPolicy(env, 'ingress');
  } catch (error) {
    if (error instanceof QuotaError) throw new ConfigurationError('policy_invalid');
    throw error;
  }
  checkSecret(env?.SESSION_SECRET, 32, 1024);
  checkSecret(env?.IP_HASH_SECRET, 32, 1024);
  if (operation !== 'session' && operation !== 'ingress') {
    checkSecret(env?.GROQ_API_KEY);
    validateProviderOptions({ apiKey: env.GROQ_API_KEY });
  }
  // Verifica a presença da interface, sem consultar o banco nem consumir cota.
  if (typeof env?.DB?.prepare !== 'function' || typeof env.DB.batch !== 'function') {
    throw new ConfigurationError('db_unbound');
  }
}

export function apiConfigurationReason(env, operation) {
  try {
    if (!['session', 'generation', 'vision'].includes(operation)) return 'config_error';
    if (env?.SESSIONS_ENABLED !== 'true' || (operation !== 'session' && env?.AI_ENABLED !== 'true')
        || (operation === 'vision' && env?.VISION_ENABLED !== 'true')) return 'flag_off';
    checkConfig(env, operation);
    return 'ok';
  } catch (error) {
    // Apenas categorias fixas: nunca serializar mensagem, política ou valor de env.
    return error instanceof ConfigurationError ? error.reason
      : error instanceof ProviderError && error.code === 'INVALID_API_KEY' ? 'secret_invalid' : 'config_error';
  }
}

export function apiConfigured(env, operation) {
  return apiConfigurationReason(env, operation) === 'ok';
}

// Injeção de fetch somente por código de teste; nunca pelo request ou env.
export function createApiHandlers({ fetchImpl } = {}) {
  async function plans({ request, env, params = {} }) {
    if (env?.SESSIONS_ENABLED !== 'true') return failure(new HttpInputError('NOT_READY'));
    try {
      const url = new URL(request.url);
      if (request.method === 'GET') {
        if (url.protocol !== 'https:' || url.search || (request.headers.has('Origin') && request.headers.get('Origin') !== url.origin)) throw new HttpInputError('ORIGIN_FORBIDDEN');
      } else {
        assertSameOriginMutation(request); requestKey(request);
        if (request.method !== 'DELETE' || url.search || !params.id) throw new HttpInputError('INVALID_INPUT');
      }
      checkConfig(env, 'ingress'); await pruneUsage(env);
      const ingress = await reserveUsage(request, env, 'ingress'); await finishUsage(env, ingress.id, true);
      const visitor = await requireVisitorSession(request, env);
      return jsonResponse({ data: request.method === 'GET'
        ? await listPlans(env, visitor, { includeMealLogs: env?.DIARY_ENABLED === 'true' }) : await deletePlan(env, visitor, params.id) });
    } catch (error) { return failure(error); }
  }
  async function history({ request, env }) {
    if (env?.SESSIONS_ENABLED !== 'true' || env?.HISTORY_DELETION_ENABLED !== 'true') {
      return failure(new HttpInputError('NOT_READY'));
    }
    try {
      assertSameOriginMutation(request);
      if (request.method !== 'DELETE' || new URL(request.url).search) throw new HttpInputError('INVALID_INPUT');
      checkConfig(env, 'ingress');
      // Não executar pruneUsage aqui: exclusão de produto não apaga nem recibos técnicos expirados.
      const ingress = await reserveUsage(request, env, 'ingress');
      await finishUsage(env, ingress.id, true);
      const visitor = await requireVisitorSession(request, env), key = requestKey(request);
      const data = await deleteHistory(env, visitor, await readJsonBody(request, { maxBytes: 256 }), key);
      return jsonResponse({ data });
    } catch (error) { return failure(error); }
  }
  async function pantryAccess(request, env, deduction = false) {
    if (env?.SESSIONS_ENABLED !== 'true' || env?.PANTRY_ENABLED !== 'true'
        || (deduction && env?.DIARY_ENABLED !== 'true')) throw new HttpInputError('NOT_READY');
    const url = new URL(request.url);
    if (request.method === 'GET') {
      if (url.protocol !== 'https:'
          || (request.headers.has('Origin') && request.headers.get('Origin') !== url.origin)
          || (request.headers.has('Sec-Fetch-Site') && request.headers.get('Sec-Fetch-Site') !== 'same-origin')) {
        throw new HttpInputError('ORIGIN_FORBIDDEN');
      }
    } else assertSameOriginMutation(request);
    checkConfig(env, 'ingress');
    await pruneUsage(env);
    const ingress = await reserveUsage(request, env, 'ingress');
    await finishUsage(env, ingress.id, true);
    const visitor = await requireVisitorSession(request, env);
    if (url.search) throw new HttpInputError('INVALID_INPUT');
    return visitor;
  }
  function pantryResult(result, status = 200) {
    if (!result.duplicate) return jsonResponse({ data: result.data }, status);
    const [duplicateStatus, message] = ERRORS.DUPLICATE_REQUEST;
    return jsonResponse({ code: 'DUPLICATE_REQUEST', message, quotaReserved: false, receipt: result.receipt,
      note: 'A ação ou baixa desta refeição já foi aplicada. Nenhum desconto foi repetido. Consulte o estado atual da despensa.' }, duplicateStatus);
  }
  async function pantry({ request, env, params = {} }) {
    try {
      const visitor = await pantryAccess(request, env);
      const id = params.id === undefined ? null : pantryId(params.id);
      if (request.method === 'GET') return jsonResponse({ data: id
        ? await getPantryItem(env, visitor, id) : await listPantry(env, visitor) });
      const operation = !id && request.method === 'POST' ? 'create' : id && request.method === 'PUT' ? 'update'
        : id && request.method === 'DELETE' ? 'delete' : null;
      if (!operation) throw new HttpInputError('INVALID_INPUT');
      const key = requestKey(request);
      return pantryResult(await mutatePantry(env, visitor, operation, id, await readJsonBody(request), key),
        operation === 'create' ? 201 : 200);
    } catch (error) { return failure(error); }
  }
  async function pantryDeduction({ request, env, params = {} }) {
    try {
      const visitor = await pantryAccess(request, env, true), id = pantryId(params.id);
      if (request.method === 'GET') return jsonResponse({ data: await previewPantryDeduction(env, visitor, id) });
      if (request.method !== 'POST') throw new HttpInputError('INVALID_INPUT');
      const key = requestKey(request);
      return pantryResult(await applyPantryDeduction(env, visitor, id, await readJsonBody(request), key));
    } catch (error) { return failure(error); }
  }
  async function mealLogs({ request, env, params = {} }) {
    if (env?.SESSIONS_ENABLED !== 'true' || env?.DIARY_ENABLED !== 'true') {
      return failure(new HttpInputError('NOT_READY'));
    }
    try {
      const url = new URL(request.url);
      if (request.method === 'GET') {
        if (url.protocol !== 'https:'
            || (request.headers.has('Origin') && request.headers.get('Origin') !== url.origin)
            || (request.headers.has('Sec-Fetch-Site') && request.headers.get('Sec-Fetch-Site') !== 'same-origin')) {
          throw new HttpInputError('ORIGIN_FORBIDDEN');
        }
      } else assertSameOriginMutation(request);
      checkConfig(env, 'ingress');
      await pruneUsage(env);
      const ingress = await reserveUsage(request, env, 'ingress');
      await finishUsage(env, ingress.id, true);
      const visitor = await requireVisitorSession(request, env);
      const id = params.id === undefined ? null : mealId(params.id);
      if (request.method === 'GET') {
        if (id && url.search) throw new HttpInputError('INVALID_INPUT');
        return id ? jsonResponse({ data: await getMeal(env, visitor, id) })
          : jsonResponse(await listMeals(env, visitor, validateMealQuery(url.searchParams)));
      }
      const operation = !id && request.method === 'POST' ? 'create'
        : id && request.method === 'PUT' ? 'update' : id && request.method === 'DELETE' ? 'delete' : null;
      if (!operation || url.search) throw new HttpInputError('INVALID_INPUT');
      const key = requestKey(request);
      const result = await mutateMeal(env, visitor, operation, id, await readJsonBody(request), key);
      if (result.duplicate) {
        const [status, message] = ERRORS.DUPLICATE_REQUEST;
        return jsonResponse({ code: 'DUPLICATE_REQUEST', message, quotaReserved: false, receipt: result.receipt,
          ...(result.alreadyRegistered ? { already_registered: true,
            note: 'Esta opção já está registrada no diário.' }
            : { note: 'Esta ação não foi repetida. Consulte o diário para ver o estado atual; o registro pode ter sido editado ou excluído.' }) }, status);
      }
      return jsonResponse({ data: result.data }, operation === 'create' ? 201 : 200);
    } catch (error) { return failure(error); }
  }
  async function preferences({ request, env }) {
    if (env?.SESSIONS_ENABLED !== 'true' || env?.PERSONALIZATION_ENABLED !== 'true') {
      return failure(new HttpInputError('NOT_READY'));
    }
    try {
      if (request.method === 'PUT') assertSameOriginMutation(request);
      else if (request.method !== 'GET' || new URL(request.url).protocol !== 'https:'
          || (request.headers.has('Origin') && request.headers.get('Origin') !== new URL(request.url).origin)
          || (request.headers.has('Sec-Fetch-Site') && request.headers.get('Sec-Fetch-Site') !== 'same-origin')) {
        throw new HttpInputError('ORIGIN_FORBIDDEN');
      }
      // Preferências não dependem de chave Groq/AI_ENABLED e não reservam geração ou visão.
      checkConfig(env, 'ingress');
      await pruneUsage(env);
      const ingress = await reserveUsage(request, env, 'ingress');
      await finishUsage(env, ingress.id, true);
      const visitor = await requireVisitorSession(request, env);
      if (request.method === 'GET') return jsonResponse({ data: await readPreferences(env, visitor) });
      requestKey(request);
      const data = await writePreferences(env, visitor, await readJsonBody(request));
      return jsonResponse({ data });
    } catch (error) { return failure(error); }
  }
  async function session({ request, env }) {
    if (env?.SESSIONS_ENABLED !== 'true') return failure(new HttpInputError('NOT_READY'));
    let reservation;
    try {
      assertSameOriginMutation(request); checkConfig(env, 'session'); requestKey(request);
      await pruneUsage(env);
      reservation = await reserveUsage(request, env, 'session');
      const input = await readJsonBody(request, { maxBytes: 256 });
      if (!input || Array.isArray(input) || typeof input !== 'object' || Object.keys(input).length) throw new HttpInputError('INVALID_INPUT');
      const result = await establishVisitorSession(request, env);
      await finishUsage(env, reservation.id, true);
      return jsonResponse({ authenticated: true, expiresAt: result.expiresAt }, result.created ? 201 : 200,
        result.setCookie ? { 'Set-Cookie': result.setCookie } : {});
    } catch (error) {
      if (reservation) await finishUsage(env, reservation.id, false).catch(() => {});
      return failure(error); // Limite de sessão não é cota da IA.
    }
  }
  async function ai(operation, { request, env }) {
    if (env?.AI_ENABLED !== 'true' || env?.SESSIONS_ENABLED !== 'true'
        || (operation === 'vision' && env?.VISION_ENABLED !== 'true')) return failure(new HttpInputError('NOT_READY'));
    let reservation, actualTokens = null;
    const operationStarted = Date.now();
    try {
      assertSameOriginMutation(request); checkConfig(env, operation);
      await pruneUsage(env);
      const ingress = await reserveUsage(request, env, 'ingress');
      await finishUsage(env, ingress.id, true);
      const key = requestKey(request);
      const visitor = await requireVisitorSession(request, env);
      const input = operation === 'generation'
        ? validateGenerationInput(await readJsonBody(request)) : (await readImageUpload(request)).file;
      if (request.signal.aborted) throw new HttpInputError('REQUEST_CANCELLED');
      const generationKey = operation === 'generation'
        ? await usageReservationId(operation, visitor.visitorId, key) : null;
      if (generationKey) {
        // O plano vive até a sessão expirar, mesmo que o recibo de sete dias já tenha sido limpo.
        const plan = await findPlan(env, visitor, generationKey);
        if (plan) return duplicateGeneration(plan);
      }
      try {
        reservation = await reserveUsage(request, env, operation, visitor.visitorId);
      } catch (error) {
        if (generationKey && error instanceof QuotaError && error.code === 'DUPLICATE_REQUEST') {
          // Outra requisição pode ter terminado desde a primeira consulta. Sem aguardar/repetir IA.
          return duplicateGeneration(await findPlan(env, visitor, generationKey));
        }
        throw error;
      }
      const options = { apiKey: env.GROQ_API_KEY, ...(fetchImpl ? { fetchImpl } : {}) };
      // Capturar ANTES do contexto/provedor: resposta antiga não pode recriar histórico excluído.
      const historyRevision = generationKey ? await captureHistoryRevision(env, visitor) : null;
      // Ler consentimento em cada geração nova, nunca copiar preferências do corpo como autorização.
      if (operation === 'generation' && ['cook', 'ready'].includes(input.mode)) {
        options.historyContext = await selectGenerationContext(env, visitor, input);
      }
      const result = operation === 'generation' ? await generateWithGroq(input, options) : await analyzeImageWithGroq(input, options);
      actualTokens = result.metadata.usage.total_tokens;
      // A IA devolve apenas dados validados. As contas ficam separadas e locais.
      const comparison = operation === 'generation' && input.mode === 'compare'
        ? calculateComparison(input, result.data) : null;
      await finishUsage(env, reservation.id, true, actualTokens);
      // Falhas anteriores (inclusive saída inválida/truncada/timeout) nunca chegam a esta gravação.
      // Recibo técnico finalizado não equivale a plano salvo: falha no D1 permanece 503, sem estorno.
      const planId = generationKey ? await savePlan(env, visitor, generationKey, input, result, { historyRevision }) : null;
      observeAi(operation, 'succeeded', { code: 'OK', elapsedMs: Date.now() - operationStarted, usage: result.metadata.usage });
      return jsonResponse({ ...result, ...(comparison ? { comparison } : {}),
        ...(planId ? { plan_id: planId } : {}),
        quota: { reserved: true, reservedTokens: reservation.reservedTokens } });
    } catch (error) {
      if (reservation) await finishUsage(env, reservation.id, false, error instanceof ProviderError ? error.usage?.total_tokens : actualTokens).catch(() => {});
      observeAi(operation, 'failed', { code: error?.code, elapsedMs: Date.now() - operationStarted,
        usage: error instanceof ProviderError ? error.usage : null,
        diagnostic: error instanceof ProviderError ? error.diagnostic : null });
      return failure(error, Boolean(reservation));
    }
  }
  return { session, history, plans, preferences, mealLogs, pantry, pantryDeduction, generate: context => ai('generation', context), analyze: context => ai('vision', context) };
}
