import { IMAGE_LIMITS, ImageContractError, validateImageFilePreflight } from '../contracts/image-analysis.js';

function fail(code, message) { throw new ImageContractError(code, 'image', message); }

// Este módulo NÃO é um endpoint e não autentica visitantes. Chamar apenas após
// sessão/controles de abuso. Na demo, pixels serão interpretados pelo provedor.
export async function readImageUpload(request, { timeoutMs = 15_000 } = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) {
    throw new TypeError('timeoutMs deve estar entre 1 e 30000');
  }
  if (request.method !== 'POST' || !request.body || request.bodyUsed) {
    fail('IMAGE_INVALID', 'envie um upload POST não vazio');
  }
  const encoding = request.headers.get('content-encoding');
  if (encoding && encoding.toLowerCase() !== 'identity') {
    fail('IMAGE_UNSUPPORTED', 'upload comprimido não é aceito');
  }
  const contentType = request.headers.get('content-type') ?? '';
  // Aceitar apenas boundary simples/entre aspas, sem parâmetros duplicados.
  const match = /^multipart\/form-data\s*;\s*boundary=(?:"([A-Za-z0-9'()+_,./:=? -]{1,70})"|([A-Za-z0-9'()+_,./:=?-]{1,70}))\s*$/i.exec(contentType);
  if (!match) fail('IMAGE_INVALID', 'envie multipart/form-data com boundary válido');
  const boundary = match[1] ?? match[2];
  if (boundary.endsWith(' ')) fail('IMAGE_INVALID', 'boundary inválido');
  const length = request.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)))) {
    fail('IMAGE_INVALID', 'tamanho declarado inválido');
  }
  if (length !== null && Number(length) > IMAGE_LIMITS.requestBytes) {
    fail('IMAGE_TOO_LARGE', 'upload excede 6 MiB');
  }

  const body = await readBoundedBody(request, timeoutMs);
  if (length !== null && Number(length) !== body.byteLength) {
    fail('IMAGE_INVALID', 'tamanho recebido difere do declarado');
  }
  // Limitar número de partes ANTES do parser nativo: muitos campos pequenos
  // podem consumir memória adicional mesmo dentro do teto de bytes.
  checkSinglePartEnvelope(body, boundary);
  let form;
  try {
    form = await new Response(body, { headers: { 'content-type': contentType } }).formData();
  } catch {
    fail('IMAGE_INVALID', 'formulário de upload inválido');
  }
  const entries = [...form.entries()];
  if (entries.length !== 1 || entries[0][0] !== 'image') {
    fail('IMAGE_INVALID', 'envie somente um arquivo no campo image');
  }
  const file = entries[0][1];
  validateImageFilePreflight(file);
  const detectedType = await sniffImageType(file);
  if (detectedType !== file.type) fail('IMAGE_INVALID', 'conteúdo e tipo declarado não correspondem');
  // Nome original deliberadamente descartado; não confiar em extensão/caminho.
  return { file: new Blob([file], { type: detectedType }), validation: 'signature_only' };
}

async function readBoundedBody(request, timeoutMs) {
  const reader = request.body.getReader();
  // Uma alocação limitada impede crescimento por milhões de chunks minúsculos.
  const buffer = new Uint8Array(IMAGE_LIMITS.requestBytes);
  let size = 0;
  let timer;
  let interruption;
  let cancellation;
  const stop = error => {
    if (interruption) return;
    interruption = error;
    // Cancelar resolve a leitura pendente. Guardar a promise para aguardá-la
    // no finally, sem acumular listeners de Promise.race a cada chunk.
    cancellation = reader.cancel().catch(() => {});
  };
  const abort = () => stop(new ImageContractError('IMAGE_INVALID', 'image', 'upload interrompido'));
  request.signal.addEventListener('abort', abort, { once: true });
  if (request.signal.aborted) abort();
  timer = setTimeout(() => stop(new ImageContractError('IMAGE_UPLOAD_TIMEOUT', 'image', 'tempo de upload excedido')), timeoutMs);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (interruption) throw interruption;
      if (done) break;
      if (!(value instanceof Uint8Array)) fail('IMAGE_INVALID', 'upload deve conter bytes');
      if (size + value.byteLength > buffer.byteLength) fail('IMAGE_TOO_LARGE', 'upload excede 6 MiB');
      buffer.set(value, size);
      size += value.byteLength;
    }
    if (!size) fail('IMAGE_INVALID', 'upload vazio');
    return buffer.subarray(0, size);
  } catch (error) {
    try { await reader.cancel(); } catch { /* Não expor erro bruto do transporte. */ }
    if (error instanceof ImageContractError) throw error;
    fail('IMAGE_INVALID', 'não foi possível receber o upload');
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener('abort', abort);
    if (cancellation) await cancellation;
    reader.releaseLock();
  }
}

function checkSinglePartEnvelope(bytes, boundary) {
  // latin1 preserva os delimitadores ASCII mesmo com payload binário.
  const text = new TextDecoder('windows-1252').decode(bytes);
  const start = `--${boundary}\r\n`;
  const end = `\r\n--${boundary}`;
  if (!text.startsWith(start)) fail('IMAGE_INVALID', 'início multipart inválido');
  const closing = text.indexOf(end, start.length);
  if (closing === -1) fail('IMAGE_INVALID', 'fim multipart ausente');
  const suffix = text.slice(closing + end.length);
  if (suffix !== '--' && suffix !== '--\r\n') {
    fail('IMAGE_INVALID', 'envie uma única parte, sem campos adicionais');
  }
  const headerEnd = text.indexOf('\r\n\r\n', start.length);
  if (headerEnd === -1 || headerEnd >= closing || headerEnd - start.length > 2048) {
    fail('IMAGE_INVALID', 'cabeçalho do arquivo inválido');
  }
}

// Assinatura é triagem, NÃO decodificação. Bytes corretos no começo não provam
// integridade, dimensões seguras, imagem estática ou remoção de metadados.
export async function sniffImageType(file) {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte)) return 'image/png';
  if (bytes.length === 12 && String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF'
      && String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP') return 'image/webp';
  fail('IMAGE_INVALID', 'assinatura de imagem não reconhecida');
}
