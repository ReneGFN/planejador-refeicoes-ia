export class HttpInputError extends Error {
  constructor(code) { super(code); this.code = code; this.name = 'HttpInputError'; }
}
export async function readJsonBody(request, { maxBytes = 16 * 1024, timeoutMs = 15000 } = {}) {
  if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > 16384 || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw new HttpInputError('INVALID_INPUT');
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(request.headers.get('Content-Type') ?? '')
      || ![null, 'identity'].includes(request.headers.get('Content-Encoding'))) throw new HttpInputError('UNSUPPORTED_MEDIA');
  const length = request.headers.get('Content-Length');
  if (length !== null && (!/^\d+$/u.test(length) || !Number.isSafeInteger(Number(length)))) throw new HttpInputError('INVALID_INPUT');
  if (Number(length) > maxBytes) throw new HttpInputError('BODY_TOO_LARGE');
  if (!request.body || request.bodyUsed) throw new HttpInputError('INVALID_INPUT');
  const reader = request.body.getReader();
  const bytes = new Uint8Array(maxBytes);
  let size = 0, interruption, cancellation;
  const stop = code => {
    if (interruption) return;
    interruption = new HttpInputError(code);
    cancellation = reader.cancel().catch(() => {});
  };
  const abort = () => stop('REQUEST_CANCELLED');
  request.signal.addEventListener('abort', abort, { once: true });
  if (request.signal.aborted) abort();
  const timer = setTimeout(() => stop('UPLOAD_TIMEOUT'), timeoutMs);
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (interruption) throw interruption;
      if (done) break;
      if (!(value instanceof Uint8Array)) throw new HttpInputError('INVALID_INPUT');
      if (size + value.length > maxBytes) throw new HttpInputError('BODY_TOO_LARGE');
      bytes.set(value, size); size += value.length;
    }
    if (!size || (length !== null && Number(length) !== size)) throw new HttpInputError('INVALID_INPUT');
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, size))); }
    catch { throw new HttpInputError('INVALID_INPUT'); }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error instanceof HttpInputError ? error : new HttpInputError('INVALID_INPUT');
  } finally {
    clearTimeout(timer); request.signal.removeEventListener('abort', abort);
    if (cancellation) await cancellation;
    reader.releaseLock();
  }
}
