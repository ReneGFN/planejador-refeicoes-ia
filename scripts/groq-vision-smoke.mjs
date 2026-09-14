import { open } from 'node:fs/promises';
import { analyzeImageWithGroq } from '../src/providers/groq-vision.js';
import { validateProviderOptions, ProviderError } from '../src/providers/groq-client.js';
import { IMAGE_LIMITS } from '../src/contracts/image-analysis.js';
import { sniffImageType } from '../src/uploads/image-upload.js';

// Envio explícito de UMA foto escolhida pelo usuário. Não executar em lote.
const [path, consent] = process.argv.slice(2);
if (!path || consent !== '--send-original' || process.argv.length !== 4) {
  console.error('Uso: node scripts/groq-vision-smoke.mjs <foto> --send-original');
  console.error('Envia o arquivo original, inclusive metadados, ao Groq e consome uma chamada.');
  process.exit(1);
}
let handle;
try {
  validateProviderOptions({ apiKey: process.env.GROQ_API_KEY });
  handle = await open(path, 'r');
  const stat = await handle.stat();
  if (!stat.isFile() || !stat.size || stat.size > IMAGE_LIMITS.fileBytes) throw new ProviderError('IMAGE_INVALID');
  // Ler até o teto + 1 mesmo se o arquivo crescer depois do stat.
  const buffer = new Uint8Array(IMAGE_LIMITS.fileBytes + 1);
  let total = 0;
  while (total < buffer.length) {
    const { bytesRead } = await handle.read(buffer, total, buffer.length - total, null);
    if (!bytesRead) break;
    total += bytesRead;
  }
  if (total > IMAGE_LIMITS.fileBytes) throw new ProviderError('IMAGE_TOO_LARGE');
  const raw = new Blob([buffer.subarray(0, total)]);
  const type = await sniffImageType(raw);
  const result = await analyzeImageWithGroq(new Blob([raw], { type }), { apiKey: process.env.GROQ_API_KEY });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  const known = error instanceof ProviderError || error?.name === 'ImageContractError';
  console.error(JSON.stringify({ code: known ? error.code : 'TEST_FAILED', usage: error instanceof ProviderError ? error.usage : null }));
  process.exitCode = 1;
} finally { await handle?.close(); }
