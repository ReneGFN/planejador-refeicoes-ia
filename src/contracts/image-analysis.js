// Contrato local: não faz upload, decodificação, chamadas à IA ou persistência.
import { ContractError, LIMITS } from './generation.js';

export const IMAGE_LIMITS = Object.freeze({
  fileBytes: 5 * 1024 * 1024,
  requestBytes: 6 * 1024 * 1024,
  responseBytes: 32 * 1024,
});
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const STATUSES = new Set(['recognized', 'no_ingredients', 'unreadable']);

export class ImageContractError extends ContractError {
  constructor(code, path, message) {
    super(path, message);
    this.name = 'ImageContractError';
    this.code = code;
  }
}

function invalid(path, message) {
  throw new ImageContractError('VISION_INVALID_RESPONSE', path, message);
}

function normalizeList(raw, path, rejectDuplicates) {
  if (!Array.isArray(raw) || raw.length > LIMITS.ingredients) {
    invalid(path, `use uma lista de até ${LIMITS.ingredients} ingredientes`);
  }
  const names = [];
  const seen = new Set();
  // for...of também verifica posições vazias de arrays, em vez de ignorá-las.
  for (const [index, item] of raw.entries()) {
    const itemPath = `${path}.${index}`;
    if (typeof item !== 'string') invalid(itemPath, 'deve ser texto');
    const name = item.trim().normalize('NFC');
    if (!name || [...name].length > LIMITS.ingredientCharacters) {
      invalid(itemPath, `use de 1 a ${LIMITS.ingredientCharacters} caracteres`);
    }
    const key = name.toLocaleLowerCase('pt-BR');
    if (seen.has(key)) {
      if (rejectDuplicates) invalid(itemPath, 'ingrediente duplicado');
      continue;
    }
    seen.add(key);
    names.push(name);
  }
  return names;
}

export function validateImageAnalysisOutput(raw) {
  const keys = ['version', 'status', 'ingredients'];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)
      || !keys.every(key => Object.hasOwn(raw, key))
      || Object.keys(raw).some(key => !keys.includes(key))) {
    invalid('output', 'objeto deve conter somente version, status e ingredients');
  }
  if (raw.version !== 1) invalid('output.version', 'versão esperada: 1');
  if (!STATUSES.has(raw.status)) invalid('output.status', 'estado não permitido');
  const ingredients = normalizeList(raw.ingredients, 'output.ingredients', true);
  if ((raw.status === 'recognized') !== (ingredients.length > 0)) {
    invalid('output.ingredients', 'lista incompatível com o estado informado');
  }
  return { version: 1, status: raw.status, ingredients };
}

// Limite de conteúdo já recebido. O futuro adaptador também deve limitar a
// leitura do envelope HTTP durante o streaming, antes de criar esta string.
export function parseImageAnalysisOutput(content) {
  if (typeof content !== 'string') invalid('output', 'resposta deve ser texto JSON');
  // Teste barato antes de alocar a representação UTF-8 de entradas enormes.
  if (content.length > IMAGE_LIMITS.responseBytes
      || new TextEncoder().encode(content).byteLength > IMAGE_LIMITS.responseBytes) {
    invalid('output', 'resposta excede o limite de bytes');
  }
  let raw;
  try { raw = JSON.parse(content); }
  catch { invalid('output', 'JSON inválido'); }
  return validateImageAnalysisOutput(raw);
}

// Usar SOMENTE depois da revisão explícita da pessoa. Esta função pura não
// comprova consentimento e não aplica respostas tardias ao estado da interface.
export function mergeConfirmedIngredients(existing, confirmed) {
  const previous = normalizeList(existing, 'draft.ingredients', false);
  const added = normalizeList(confirmed, 'confirmed.ingredients', false);
  const merged = [...previous];
  const seen = new Set(previous.map(name => name.toLocaleLowerCase('pt-BR')));
  for (const name of added) {
    const key = name.toLocaleLowerCase('pt-BR');
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(name);
    }
  }
  if (merged.length > LIMITS.ingredients) {
    throw new ImageContractError('INGREDIENT_LIMIT_REACHED', 'draft.ingredients',
      `revise a lista para manter até ${LIMITS.ingredients} ingredientes`);
  }
  return merged;
}

// Pré-verificação APENAS. Um Blob com MIME permitido pode conter bytes falsos.
// O fluxo da demo confere também assinatura e limites HTTP antes de encaminhar.
// Não comprova dimensões/animação/integridade e não remove metadados.
export function validateImageFilePreflight(file) {
  if (!(file instanceof Blob) || file.size === 0) {
    throw new ImageContractError('IMAGE_INVALID', 'image', 'selecione um arquivo não vazio');
  }
  if (file.size > IMAGE_LIMITS.fileBytes) {
    throw new ImageContractError('IMAGE_TOO_LARGE', 'image', 'arquivo excede 5 MiB');
  }
  if (!IMAGE_TYPES.has(file.type)) {
    throw new ImageContractError('IMAGE_UNSUPPORTED', 'image', 'use JPEG, PNG ou WebP');
  }
  return { size: file.size, type: file.type };
}
