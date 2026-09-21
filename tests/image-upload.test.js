import test from 'node:test';
import assert from 'node:assert/strict';
import { readImageUpload } from '../src/uploads/image-upload.js';
import { IMAGE_LIMITS } from '../src/contracts/image-analysis.js';

// PNG de 1 pixel; testes de upload não comprovam reconhecimento ou decoder.
const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64'));
function request(parts = [['image', new Blob([png], { type: 'image/png' })]]) {
  const form = new FormData();
  for (const [name, value] of parts) form.append(name, value);
  return new Request('https://local.test/api/analyze-ingredients', { method: 'POST', body: form });
}
const rejectsCode = (promise, code) => assert.rejects(promise, error => error.code === code);

test('upload: recebe uma imagem, descarta nome e informa triagem por assinatura', async () => {
  const result = await readImageUpload(request());
  assert.equal(result.validation, 'signature_only');
  assert.equal(result.file.type, 'image/png');
  assert.equal(result.file.name, undefined);
  assert.deepEqual(new Uint8Array(await result.file.arrayBuffer()), png);
});

test('upload: rejeita partes extras, duplicadas, ausentes, campos de texto e URL', async () => {
  const blob = new Blob([png], { type: 'image/png' });
  for (const parts of [[], [['image', blob], ['image', blob]], [['image', blob], ['model', 'x']],
    [['photo', blob]], [['image', 'https://example.com/foto.png']], [['image', 'texto']]]) {
    await rejectsCode(readImageUpload(request(parts)), 'IMAGE_INVALID');
  }
});

test('upload: MIME falso e bytes sem assinatura não passam', async () => {
  for (const blob of [new Blob([png], { type: 'image/jpeg' }), new Blob(['nao-e-foto'], { type: 'image/png' })]) {
    await rejectsCode(readImageUpload(request([['image', blob]])), 'IMAGE_INVALID');
  }
  await rejectsCode(readImageUpload(request([['image', new Blob([png], { type: 'image/svg+xml' })]])), 'IMAGE_UNSUPPORTED');
});

test('upload: assinatura sozinha NÃO aprova integridade; provedor poderá recusar', async () => {
  const signatures = [
    ['image/png', png.slice(0, 8)],
    ['image/jpeg', new Uint8Array([255, 216, 255])],
    ['image/webp', new TextEncoder().encode('RIFFxxxxWEBP')],
  ];
  for (const [type, bytes] of signatures) {
    const result = await readImageUpload(request([['image', new Blob([bytes], { type })]]));
    assert.equal(result.validation, 'signature_only');
  }
});

test('upload: arquivo acima de 5 MiB não passa, mesmo com corpo abaixo de 6 MiB', async () => {
  const file = new Blob([png, new Uint8Array(IMAGE_LIMITS.fileBytes)], { type: 'image/png' });
  await rejectsCode(readImageUpload(request([['image', file]])), 'IMAGE_TOO_LARGE');
});

test('upload: valida método, encoding e boundary antes do parser', async () => {
  await rejectsCode(readImageUpload(new Request('https://local.test')), 'IMAGE_INVALID');
  for (const type of ['application/json', 'multipart/form-data', 'multipart/form-data; boundary=a; boundary=b']) {
    const req = new Request('https://local.test', { method: 'POST', body: 'x', headers: { 'content-type': type } });
    await rejectsCode(readImageUpload(req), 'IMAGE_INVALID');
  }
  const compressed = request(); compressed.headers.set('content-encoding', 'gzip');
  await rejectsCode(readImageUpload(compressed), 'IMAGE_UNSUPPORTED');
});

test('upload: não confia em Content-Length ausente ou menor que o corpo', async () => {
  for (const length of [null, '1']) {
    let cancelled = false;
    const stream = new ReadableStream({
      pull(controller) { controller.enqueue(new Uint8Array(1024 * 1024)); },
      cancel() { cancelled = true; },
    });
    const headers = { 'content-type': 'multipart/form-data; boundary=a' };
    if (length) headers['content-length'] = length;
    const req = new Request('https://local.test', { method: 'POST', body: stream, duplex: 'half', headers });
    await rejectsCode(readImageUpload(req), 'IMAGE_TOO_LARGE');
    assert.equal(cancelled, true);
  }
});

test('upload: rejeita tamanho declarado inválido e divergência com corpo real', async () => {
  for (const length of ['-1', '1.5', 'abc', '9007199254740993', '1']) {
    const req = request(); req.headers.set('content-length', length);
    await rejectsCode(readImageUpload(req), 'IMAGE_INVALID');
  }
  const req = request(); req.headers.set('content-length', String(IMAGE_LIMITS.requestBytes + 1));
  await rejectsCode(readImageUpload(req), 'IMAGE_TOO_LARGE');
});

test('upload: interrompe stream parado por timeout e cancela a leitura', async () => {
  let cancelled = false;
  const stream = new ReadableStream({ cancel() { cancelled = true; } });
  const req = new Request('https://local.test', { method: 'POST', body: stream, duplex: 'half',
    headers: { 'content-type': 'multipart/form-data; boundary=a' } });
  await rejectsCode(readImageUpload(req, { timeoutMs: 10 }), 'IMAGE_UPLOAD_TIMEOUT');
  assert.equal(cancelled, true);
});

test('upload: cancelamento do cliente e falha de transporte não expõem erro bruto', async () => {
  const controller = new AbortController();
  const stream = new ReadableStream();
  const req = new Request('https://local.test', { method: 'POST', body: stream, duplex: 'half', signal: controller.signal,
    headers: { 'content-type': 'multipart/form-data; boundary=a' } });
  controller.abort();
  await rejectsCode(readImageUpload(req), 'IMAGE_INVALID');
  const broken = new ReadableStream({ start(c) { c.error(new Error('DADO-PRIVADO')); } });
  const failed = new Request('https://local.test', { method: 'POST', body: broken, duplex: 'half',
    headers: { 'content-type': 'multipart/form-data; boundary=a' } });
  await assert.rejects(readImageUpload(failed), e => e.code === 'IMAGE_INVALID' && !e.message.includes('DADO-PRIVADO'));
});

test('upload: multipart malformado e conteúdo após fechamento são rejeitados', async () => {
  for (const body of ['x', '--a\r\n', '--a\r\nBAD\r\n--a--', '--a\r\n\r\nx\r\n--a--\r\nextra']) {
    const req = new Request('https://local.test', { method: 'POST', body,
      headers: { 'content-type': 'multipart/form-data; boundary=a' } });
    await rejectsCode(readImageUpload(req), 'IMAGE_INVALID');
  }
});
