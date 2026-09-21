import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { SAMPLE_BYTES, LOCAL_NOTICE, syntheticUpload, isolatedSample, measurementReport } from '../scripts/measure-image-path.mjs';
import { readImageUpload } from '../src/uploads/image-upload.js';

test('medição local: tamanhos fixos e aviso não equivalem a limites da nuvem', () => {
  assert.deepEqual(SAMPLE_BYTES, [524288, 2097152, 5242880]);
  assert.match(LOCAL_NOTICE, /NÃO do plano Free/);
  for (const size of [0, 1, -1, 0.5, '524288', 5242881, null, NaN]) {
    assert.throws(() => syntheticUpload(size), /Use somente/);
  }
});

test('medição local: amostra sintética passa só pela triagem e mantém bytes variados', async () => {
  const request = syntheticUpload(SAMPLE_BYTES[0]);
  const result = await readImageUpload(request);
  assert.equal(result.validation, 'signature_only');
  assert.equal(result.file.size, SAMPLE_BYTES[0]);
  assert.equal(result.file.type, 'image/jpeg');
  assert.deepEqual([...new Uint8Array(await result.file.slice(0, 6).arrayBuffer())], [255, 216, 255, 3, 4, 5]);
});

test('medição local: executa três processos e reporta medidas, sem teto de tempo/memória', async t => {
  const report = await measurementReport();
  assert.equal(report.scope, 'local_node_only');
  assert.equal(report.method.performance_threshold, null);
  assert.equal(report.method.fresh_process_per_size, true);
  assert.equal(report.method.peak_scope, 'process_lifetime_including_startup_and_fixture');
  assert.equal(report.samples.length, 3);
  for (const [index, sample] of report.samples.entries()) {
    assert.equal(sample.file_bytes, SAMPLE_BYTES[index]);
    assert.equal(sample.fixture, 'synthetic_signature_only');
    assert.equal(sample.base64_characters, 4 * Math.ceil(SAMPLE_BYTES[index] / 3));
    assert.equal(sample.data_url_characters, sample.base64_characters + 'data:image/jpeg;base64,'.length);
    // Somente integridade do relatório; não existe asserção "cabe no Free".
    for (const value of [...Object.values(sample.duration_ms), ...Object.values(sample.cpu_ms)]) {
      assert.ok(Number.isFinite(value) && value >= 0);
    }
    for (const phase of ['before', 'after_upload', 'after_base64']) {
      for (const value of Object.values(sample.memory[phase])) assert.ok(Number.isSafeInteger(value) && value >= 0);
    }
    for (const phase of ['before', 'after']) {
      const value = sample.memory['process_peak_rss_kib_' + phase];
      assert.ok(value === null || (Number.isSafeInteger(value) && value > 0));
    }
  }
  t.diagnostic(LOCAL_NOTICE);
});

test('medição local: tamanho inválido não inicia subprocesso', async () => {
  await assert.rejects(isolatedSample(1), /Use somente/);
});

test('medição local: CLI rejeita argumentos sem expor detalhes internos', async () => {
  const script = fileURLToPath(new URL('../scripts/measure-image-path.mjs', import.meta.url));
  await assert.rejects(promisify(execFile)(process.execPath, [script, '--sample', 'invalid'], { windowsHide: true }),
    error => error.code === 1 && error.stdout === '' && error.stderr.includes('Não foi possível concluir a medição local.')
      && !error.stderr.includes(' at '));
});
