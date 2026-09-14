// MEDIÇÃO LOCAL EM NODE: não mede CPU/memória do plano Free da Cloudflare.
// Sem rede, Groq, banco, arquivos de fotos ou limiar de aprovação por desempenho.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { readImageUpload } from '../src/uploads/image-upload.js';
import { imageDataUrl } from '../src/providers/groq-vision.js';

export const SAMPLE_BYTES = Object.freeze([524288, 2097152, 5242880]);
export const LOCAL_NOTICE = 'Medição da máquina local em Node, NÃO do plano Free da Cloudflare; sem veredito de desempenho.';
const executeFile = promisify(execFile);
const samplePath = fileURLToPath(import.meta.url);

function validateSize(size) {
  if (!SAMPLE_BYTES.includes(size)) throw new Error('Use somente 0,5, 2 ou 5 MiB.');
}

export function syntheticUpload(size) {
  validateSize(size);
  // Bytes variados e assinatura JPEG: não é uma fotografia nem JPEG decodificável.
  // O caminho atual só confere assinatura e não interpreta pixels.
  const bytes = new Uint8Array(size);
  for (let i = 0; i < size; i++) bytes[i] = i % 256;
  bytes.set([255, 216, 255]);
  const form = new FormData();
  form.append('image', new Blob([bytes], { type: 'image/jpeg' }), 'amostra-sintetica.jpg');
  return new Request('https://local.test/upload', { method: 'POST', body: form });
}

function memorySnapshot() {
  const { rss, heapUsed, external, arrayBuffers } = process.memoryUsage();
  return { rss_bytes: rss, heap_used_bytes: heapUsed, external_bytes: external, array_buffers_bytes: arrayBuffers };
}

function peakRssKiB() {
  const value = process.resourceUsage().maxRSS;
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export async function measureSample(size) {
  const request = syntheticUpload(size);
  // Preparar a amostra não entra no cronômetro, mas entra no pico do processo.
  const before = memorySnapshot();
  const peakBefore = peakRssKiB();
  const cpuStart = process.cpuUsage();
  const started = performance.now();
  const upload = await readImageUpload(request);
  const uploadFinished = performance.now();
  const afterUpload = memorySnapshot();
  // Mantém a segunda checagem de assinatura feita pelo adaptador atual.
  const base64Started = performance.now();
  const url = await imageDataUrl(upload.file);
  const finished = performance.now();
  const cpu = process.cpuUsage(cpuStart);
  const peakAfter = peakRssKiB();
  const afterBase64 = memorySnapshot();
  const prefix = 'data:image/jpeg;base64,';
  if (upload.file.size !== size || upload.validation !== 'signature_only'
      || !url.startsWith(prefix) || url.length - prefix.length !== 4 * Math.ceil(size / 3)) {
    throw new Error('O caminho medido não preservou a amostra esperada.');
  }
  return {
    file_bytes: size,
    file_mib: size / 1048576,
    fixture: 'synthetic_signature_only',
    validation: upload.validation,
    base64_characters: url.length - prefix.length,
    data_url_characters: url.length,
    duration_ms: {
      upload_and_signature: uploadFinished - started,
      signature_and_base64: finished - base64Started,
      total: finished - started,
    },
    cpu_ms: { user: cpu.user / 1000, system: cpu.system / 1000 },
    memory: {
      before, after_upload: afterUpload, after_base64: afterBase64,
      process_peak_rss_kib_before: peakBefore,
      process_peak_rss_kib_after: peakAfter,
    },
  };
}

export async function isolatedSample(size) {
  validateSize(size);
  // Processo novo por tamanho: maxRSS é acumulado desde o início do processo.
  // Não herdar chaves, NODE_OPTIONS ou configuração da aplicação.
  const env = process.platform === 'win32' && process.env.SystemRoot
    ? { SystemRoot: process.env.SystemRoot } : {};
  const { stdout } = await executeFile(process.execPath, [samplePath, '--sample', String(size)], {
    env, windowsHide: true, timeout: 60000, maxBuffer: 64 * 1024,
  });
  return JSON.parse(stdout);
}

export async function measurementReport() {
  const samples = [];
  for (const size of SAMPLE_BYTES) samples.push(await isolatedSample(size));
  return {
    version: 1,
    scope: 'local_node_only',
    notice: LOCAL_NOTICE,
    environment: { node: process.version, platform: process.platform, arch: process.arch },
    method: {
      fresh_process_per_size: true,
      samples_per_size: 1,
      peak_source: 'process.resourceUsage().maxRSS',
      peak_scope: 'process_lifetime_including_startup_and_fixture',
      timing_scope: 'upload_signature_base64_no_provider',
      performance_threshold: null,
    },
    samples,
  };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  // Defesa adicional do instrumento: nenhuma chamada HTTP é permitida.
  globalThis.fetch = () => { throw new Error('Rede desativada nesta medição local.'); };
  try {
    const args = process.argv.slice(2);
    let result;
    if (!args.length) result = await measurementReport();
    else if (args.length === 2 && args[0] === '--sample' && SAMPLE_BYTES.some(size => String(size) === args[1])) {
      result = await measureSample(Number(args[1]));
    } else throw new Error('Argumentos de medição inválidos.');
    console.log(JSON.stringify(result, null, 2));
  } catch {
    console.error('Não foi possível concluir a medição local. Confira o comando e a permissão para criar processos Node; não há conclusão sobre a Cloudflare.');
    process.exitCode = 1;
  }
}
