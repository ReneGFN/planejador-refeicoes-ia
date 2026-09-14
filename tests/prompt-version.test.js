import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generationPromptVersion, evaluateCase, runEvaluationCli } from '../scripts/generation-quality.mjs';
import { QUALITY_CASES } from '../scripts/fixtures/generation-quality-cases.mjs';
import { generateWithGroq, MODEL } from '../src/providers/groq.js';

const data = { version: 1, mode: 'cook', suggestions: [{ title: 'Banana', servings: 1, total_minutes: 5,
  ingredients: [{ name: 'banana', quantity: 1, unit: 'unit' }], steps: ['Descasque e sirva.'] }] };
const envelope = () => ({ model: MODEL, choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(data) } }] });
const expectedVersion = body => 'sha256:' + createHash('sha256').update(body.messages[0].content, 'utf8').digest('hex');

test('versão do prompt: determinística, sensível ao texto exato e sem normalização silenciosa', () => {
  assert.equal(generationPromptVersion('abc'), 'sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(generationPromptVersion('receita'), generationPromptVersion('receita'));
  const variants = ['receita', 'Receita', 'receita ', 'receita\n', 'receita\r\n', 'refeição', 'refeição'];
  assert.equal(new Set(variants.map(generationPromptVersion)).size, variants.length);
  for (const value of [null, undefined, 1, {}, '']) assert.throws(() => generationPromptVersion(value), { code: 'EVALUATION_FAILED' });
});

test('versão do prompt: registra o SYSTEM efetivamente enviado sem alterar a chamada ou a resposta pública', async () => {
  let directBody, measuredBody;
  const direct = await generateWithGroq(QUALITY_CASES[0].input, { apiKey: randomUUID(), fetchImpl: async (_, init) => {
    directBody = JSON.parse(init.body); return Response.json(envelope());
  } });
  const record = await evaluateCase(QUALITY_CASES[0], { apiKey: randomUUID(), saveRaw: async () => {}, fetchImpl: async (_, init) => {
    measuredBody = JSON.parse(init.body); return Response.json(envelope());
  } });
  assert.deepEqual(measuredBody, directBody);
  assert.equal(record.request_settings.system_prompt_version, expectedVersion(measuredBody));
  assert.deepEqual(Object.keys(direct).sort(), ['data', 'metadata']);
  assert.deepEqual(Object.keys(direct.metadata).sort(), ['elapsed_ms', 'model', 'usage']);
  assert.equal(Object.hasOwn(measuredBody, 'system_prompt_version'), false);
  assert.equal(record.rubric_verdict, null);
  // Identificação e transporte simulados não comprovam qualidade do modelo.
});

test('versão do prompt: persiste mesmo em rejeição de esquema, contrato inválido ou falha de rede', async () => {
  for (const [kind, code] of [['schema', 'PROVIDER_SCHEMA_REJECTED'], ['empty', 'INVALID_OUTPUT'], ['network', 'NETWORK_ERROR']]) {
    let sent, saved = false;
    const record = await evaluateCase(QUALITY_CASES[0], { apiKey: randomUUID(), saveRaw: async () => { saved = true; },
      fetchImpl: async (_, init) => {
        sent = JSON.parse(init.body);
        if (kind === 'network') throw Error('Falha sintética.');
        if (kind === 'schema') return Response.json({ error: {
          message: 'Diagnóstico sintético.', type: 'invalid_request_error', code: 'json_validate_failed',
        } }, { status: 400 });
        return Response.json({ model: MODEL, choices: [{ finish_reason: 'stop', message: {
          content: JSON.stringify({ version: 1, mode: 'cook', suggestions: [] }),
        } }] });
      },
    });
    assert.equal(saved, true);
    assert.equal(record.request_settings.system_prompt_version, expectedVersion(sent));
    assert.equal(record.provider_code, code);
    assert.equal(record.rubric_verdict, null);
  }
});

test('versão do prompt: arquivo do caso contém a identificação sem mudar quantidade de chamadas', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rf-prompt-version-'));
  let sent, calls = 0;
  const status = await runEvaluationCli(['--case', 'C01', '--send-real'], {
    env: { GROQ_API_KEY: randomUUID(), GROQ_EVAL_DIR: root }, log() {}, fetchImpl: async (_, init) => {
      calls++; sent = JSON.parse(init.body); return Response.json(envelope());
    },
  });
  assert.equal(status, 0);
  assert.equal(calls, 1);
  const directory = join(root, (await readdir(root))[0]);
  const record = JSON.parse(await readFile(join(directory, 'C01.record.json'), 'utf8'));
  assert.equal(record.request_settings.system_prompt_version, expectedVersion(sent));
  assert.equal(record.rubric_verdict, null);
  const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
  assert.equal(manifest.calls_planned, 1);
  assert.equal(manifest.retries, 0);
});
