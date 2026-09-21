// Contratos puros do apoio em vídeo; não autenticam, consultam banco ou usam IA.
import { ContractError } from './generation.js';

export const VIDEO_LIMITS = Object.freeze({ titleCharacters: 100, candidates: 5,
  videoTitleCharacters: 200, channelTitleCharacters: 100, responseBytes: 16 * 1024 });
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/u;
const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/u;
const fail = (path, message) => { throw new ContractError(path, message); };

function object(raw, required, optional, path) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) fail(path, 'deve ser objeto simples');
  for (const key of Object.keys(raw)) {
    if (![...required, ...optional].includes(key)) fail(path, 'campo não permitido');
  }
  for (const key of required) if (!Object.hasOwn(raw, key)) fail(`${path}.${key}`, 'campo obrigatório');
}
function text(raw, max, path) {
  if (typeof raw !== 'string' || raw.length > max * 2 || !raw.trim()
      || [...raw].length > max || /[\p{C}]/u.test(raw)) fail(path, 'texto inválido ou muito longo');
  return raw;
}
function id(raw, pattern, path) {
  if (typeof raw !== 'string' || !pattern.test(raw)) fail(path, 'identificador inválido');
  return raw;
}

// Aceita só o título extraído da alternativa pelo futuro chamador autenticado.
// A lista permitida reduz operadores/URLs; não comprova ausência de dado pessoal.
export function validateVideoInput(raw) {
  object(raw, ['title'], [], 'input');
  if (typeof raw.title !== 'string' || raw.title.length > VIDEO_LIMITS.titleCharacters * 4) {
    fail('input.title', 'informe somente o nome do prato');
  }
  const title = raw.title.normalize('NFC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('pt-BR');
  if (!title || [...title].length > VIDEO_LIMITS.titleCharacters
      || !/^[\p{L}\p{M}\p{N} '’\-]+$/u.test(title)
      || !/\p{L}/u.test(title) || /(?:^| )-/u.test(title)) {
    fail('input.title', 'use um nome de prato sem links ou operadores de busca');
  }
  return { title };
}

function video(raw, path) {
  object(raw, ['id', 'title', 'channel_id', 'channel_title'], [], path);
  return { id: id(raw.id, VIDEO_ID, `${path}.id`),
    title: text(raw.title, VIDEO_LIMITS.videoTitleCharacters, `${path}.title`),
    channel_id: id(raw.channel_id, CHANNEL_ID, `${path}.channel_id`),
    channel_title: text(raw.channel_title, VIDEO_LIMITS.channelTitleCharacters, `${path}.channel_title`) };
}

export function validateVideoOutput(raw) {
  object(raw, ['version', 'status', 'video'], [], 'output');
  if (raw.version !== 1) fail('output.version', 'versão esperada: 1');
  if (!['found', 'not_found'].includes(raw.status)) fail('output.status', 'estado não permitido');
  if (raw.status === 'not_found') {
    if (raw.video !== null) fail('output.video', 'deve ser nulo quando não há candidato');
    return { version: 1, status: 'not_found', video: null };
  }
  return { version: 1, status: 'found', video: video(raw.video, 'output.video') };
}

const words = value => value.normalize('NFC').toLocaleLowerCase('pt-BR').match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];
function containsDish(title, dish) {
  const actual = words(title), expected = words(dish);
  return actual.some((_, start) => expected.every((word, offset) => actual[start + offset] === word));
}

// Valida TODOS os candidatos antes de escolher; campo extra não é descartado
// silenciosamente, mesmo depois do primeiro candidato utilizável.
export function validateYouTubeSearchResponse(raw, input) {
  const { title } = validateVideoInput(input);
  object(raw, ['items'], [], 'provider');
  if (!Array.isArray(raw.items) || raw.items.length > VIDEO_LIMITS.candidates) {
    fail('provider.items', 'lista de candidatos inválida');
  }
  const candidates = [];
  for (const [index, item] of raw.items.entries()) {
    const path = `provider.items.${index}`;
    object(item, ['id', 'snippet'], [], path);
    object(item.id, ['kind', 'videoId'], [], `${path}.id`);
    if (item.id.kind !== 'youtube#video') fail(`${path}.id.kind`, 'recurso deve ser vídeo');
    object(item.snippet, ['title', 'channelId', 'channelTitle'], [], `${path}.snippet`);
    candidates.push(video({ id: item.id.videoId, title: item.snippet.title,
      channel_id: item.snippet.channelId, channel_title: item.snippet.channelTitle }, path));
  }
  // Correspondência lexical, não avaliação de técnica, idioma ou qualidade.
  const selected = candidates.find(candidate => containsDish(candidate.title, title));
  return validateVideoOutput({ version: 1, status: selected ? 'found' : 'not_found', video: selected ?? null });
}

// O corpo de erro só serve à classificação; nenhuma mensagem externa sai daqui.
export function validateYouTubeError(raw, httpStatus) {
  object(raw, ['error'], [], 'provider');
  object(raw.error, ['code', 'message', 'errors'], ['status'], 'provider.error');
  if (raw.error.code !== httpStatus) fail('provider.error.code', 'código incompatível');
  text(raw.error.message, 2000, 'provider.error.message');
  if (Object.hasOwn(raw.error, 'status')) text(raw.error.status, 100, 'provider.error.status');
  if (!Array.isArray(raw.error.errors) || !raw.error.errors.length || raw.error.errors.length > 10) {
    fail('provider.error.errors', 'lista de erros inválida');
  }
  const reasons = [];
  for (const [index, item] of raw.error.errors.entries()) {
    const path = `provider.error.errors.${index}`;
    object(item, ['domain', 'reason', 'message'], ['location', 'locationType'], path);
    for (const key of Object.keys(item)) text(item[key], 2000, `${path}.${key}`);
    reasons.push(item.reason);
  }
  if (httpStatus === 403 && reasons.every(reason => reason === 'quotaExceeded')) return 'quota_exceeded';
  if ([403, 429].includes(httpStatus)
      && reasons.every(reason => ['rateLimitExceeded', 'userRateLimitExceeded'].includes(reason))) return 'rate_limited';
  return 'unclassified';
}
