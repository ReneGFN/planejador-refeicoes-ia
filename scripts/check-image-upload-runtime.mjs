// Diagnóstico local usando ferramentas já fixadas no lockfile via Wrangler.
// Não é uma rota da aplicação nem publica nada na Cloudflare.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

const { outputFiles } = await build({
  stdin: {
    contents: `import { readImageUpload } from './src/uploads/image-upload.js';
      import { analyzeImageWithGroq, VISION_MODEL } from './src/providers/groq-vision.js';
      export default { async fetch(request) {
        try {
          const result = await readImageUpload(request);
          const visionNames = new URL(request.url).pathname === '/vision-names';
          if (new URL(request.url).pathname === '/vision' || visionNames) {
            const analysis = await analyzeImageWithGroq(result.file, {
              apiKey: 'fake-local-test-key',
              fetchImpl: async (url, init) => {
                const body = JSON.parse(init.body);
                if (!body.messages[1].content[1].image_url.url.startsWith('data:image/png;base64,')) throw Error('encoding');
                return Response.json({ model: VISION_MODEL,
                  choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(visionNames
                    ? { version: 1, status: 'recognized', ingredients: ['  ÓLEO   DE SOJA ', 'CAFÉ'] }
                    : { version: 1, status: 'no_ingredients', ingredients: [] }) } }] });
              }
            });
            return Response.json(analysis.data);
          }
          return Response.json({ type: result.file.type, size: result.file.size,
            validation: result.validation });
        } catch (error) {
          return Response.json({code: error.code ?? 'UNEXPECTED'}, {status: 400});
        }
      }};`,
    resolveDir: process.cwd(),
  },
  bundle: true, write: false, format: 'esm', platform: 'browser',
});
// O Miniflare 5 fixado pelo Wrangler fornece conversor para opções v4.
const mf = new Miniflare(convertV4MiniflareOptions({ host: '127.0.0.1', port: 0, workers: [{
  name: 'upload-test', modules: true, script: outputFiles[0].text,
  compatibilityDate: '2026-09-06',
}] }));
try {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
  const cases = [
    { type: 'image/png', bytes: png, expected: { type: 'image/png', size: png.length, validation: 'signature_only' } },
    { type: 'image/jpeg', bytes: png, expected: { code: 'IMAGE_INVALID' } },
    { type: 'image/png', bytes: Buffer.from('invalid'), expected: { code: 'IMAGE_INVALID' } },
    { type: 'image/png', bytes: png, extra: true, expected: { code: 'IMAGE_INVALID' } },
    { type: 'image/png', bytes: png, path: '/vision', expected: { version: 1, status: 'no_ingredients', ingredients: [] } },
    { type: 'image/png', bytes: png, path: '/vision-names', expected: { version: 1, status: 'recognized', ingredients: ['óleo de soja', 'café'] } },
  ];
  for (const item of cases) {
    const form = new FormData();
    form.append('image', new Blob([item.bytes], { type: item.type }), 'photo.png');
    if (item.extra) form.append('model', 'untrusted');
    // Serializar no Node evita misturar instâncias de FormData dos runtimes.
    const req = new Request('https://local.test', { method: 'POST', body: form });
    const response = await mf.dispatchFetch('https://local.test' + (item.path ?? '/'), {
      method: 'POST', headers: { 'content-type': req.headers.get('content-type') },
      body: new Uint8Array(await req.arrayBuffer()),
    });
    assert.deepEqual(await response.json(), item.expected);
  }
  console.log('Workers local: 6 cenários aprovados, incluindo visão simulada e padronização; nenhuma chamada real.');
} finally {
  await mf.dispose();
}
