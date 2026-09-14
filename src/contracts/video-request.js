import { ContractError } from './generation.js';
import { validateVideoInput, validateVideoOutput } from './video.js';

export const VIDEO_NOTICE = Object.freeze({ title: 'Vídeo de apoio',
  text: 'Este tutorial pode usar ingredientes, quantidades, equipamentos e tempos diferentes. Use-o para entender as técnicas; para manter as escolhas feitas no aplicativo, siga a receita escrita.' });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
export function validateVideoSelection(raw) {
  const fields = ['version', 'plan_id', 'side', 'suggestion_index'];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.getPrototypeOf(raw) !== Object.prototype
      || Object.keys(raw).length !== fields.length || fields.some(field => !Object.hasOwn(raw, field))) {
    throw new ContractError('input', 'informe somente a alternativa escolhida');
  }
  if (raw.version !== 1) throw new ContractError('input.version', 'versão esperada: 1');
  if (typeof raw.plan_id !== 'string' || !UUID.test(raw.plan_id)) throw new ContractError('input.plan_id', 'plano inválido');
  if (!['cook', 'ready'].includes(raw.side)) throw new ContractError('input.side', 'lado inválido');
  if (!Number.isInteger(raw.suggestion_index) || raw.suggestion_index < 0 || raw.suggestion_index > 2) {
    throw new ContractError('input.suggestion_index', 'alternativa inválida');
  }
  return { version: 1, plan_id: raw.plan_id, side: raw.side, suggestion_index: raw.suggestion_index };
}

export function videoReply(title, rawResult = null, { disabled = false } = {}) {
  const query = validateVideoInput({ title }).title;
  const result = disabled || rawResult === null ? null : validateVideoOutput(rawResult);
  const url = new URL('https://www.youtube.com/results');
  url.searchParams.set('search_query', query);
  return { version: 1, status: disabled ? 'disabled' : result?.status ?? 'unavailable',
    video: result?.video ?? null, notice: { ...VIDEO_NOTICE }, search: { query, url: url.href },
    message: result?.status === 'found' ? 'Vídeo de apoio relacionado ao nome do prato.'
      : 'Você pode buscar um tutorial no YouTube. Sua receita continua disponível.' };
}
