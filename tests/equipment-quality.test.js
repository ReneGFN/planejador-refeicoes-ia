import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { EQUIPMENT_CASES } from '../scripts/fixtures/equipment-quality-cases.mjs';
import { QUALITY_CASES } from '../scripts/fixtures/generation-quality-cases.mjs';
import { evaluateCase, parseEvaluationArgs, runEvaluationCli } from '../scripts/generation-quality.mjs';
import { validateGenerationInput } from '../src/contracts/generation.js';
import { MODEL } from '../src/providers/groq.js';

// Respostas sintéticas deliberadamente simples; não são evidência culinária.
const recipe = (entry, steps = ['Misture e sirva.']) => ({ version: 1, mode: 'cook', suggestions: [{
  title: 'Resposta simulada', servings: entry.input.people, total_minutes: 1,
  ingredients: [{ name: entry.input.ingredients[0], quantity: 1, unit: 'unit' }], steps,
}] });
const envelope = content => ({ model: MODEL,
  choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(content) } }],
  usage: { prompt_tokens: 100, completion_tokens: 40, total_tokens: 140 },
});

test('avaliação de equipamento: oito casos válidos, separados e sem resultados preenchidos', () => {
  assert.equal(EQUIPMENT_CASES.length, 8);
  const ids = [...QUALITY_CASES, ...EQUIPMENT_CASES].map(entry => entry.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const entry of EQUIPMENT_CASES) {
    assert.deepEqual(validateGenerationInput(entry.input), entry.input);
    assert.equal(entry.input.mode, 'cook');
    assert.equal(typeof entry.focus, 'string');
    assert.equal(Object.hasOwn(entry, 'rubric_verdict'), false);
  }
  assert.deepEqual(EQUIPMENT_CASES.filter(entry => !entry.feasible).map(entry => entry.id), ['E07', 'E08']);
  assert.equal(EQUIPMENT_CASES.find(entry => entry.id === 'E06').input.max_dishes, 0);
  const forbiddenOnly = EQUIPMENT_CASES.find(entry => entry.id === 'E04').input;
  assert.equal(Object.hasOwn(forbiddenOnly, 'equipment'), false);
  assert.equal(Object.hasOwn(forbiddenOnly, 'max_dishes'), false);
  assert.deepEqual(forbiddenOnly.avoid_equipment, ['forno']);
  assert.deepEqual(EQUIPMENT_CASES.find(entry => entry.id === 'E05').input.equipment, []);
});

test('avaliação de equipamento: listagem sem rede e lote original limitado aos dez casos', async () => {
  const lines = [];
  assert.equal(await runEvaluationCli(['--equipment', '--list'], {
    env: {}, fetchImpl: () => assert.fail('Listar não pode acessar a rede.'), log: line => lines.push(line),
  }), 0);
  assert.deepEqual(lines, EQUIPMENT_CASES.map(entry => `${entry.id}: ${entry.label}`));
  assert.deepEqual(parseEvaluationArgs(['--all', '--send-real']), { cases: QUALITY_CASES });
  assert.deepEqual(parseEvaluationArgs(['--list']), { list: true });
  for (const entry of EQUIPMENT_CASES) {
    assert.deepEqual(parseEvaluationArgs(['--case', entry.id, '--send-real']), { cases: [entry] });
  }
});

test('avaliação de equipamento: exige caso individual, confirmação e chave privada', async () => {
  const fetchImpl = () => assert.fail('Entrada não autorizada não pode acessar a rede.');
  for (const args of [
    ['--case', 'E01'], ['--case', 'E99', '--send-real'], ['--equipment', '--send-real'],
    ['--equipment', '--all', '--send-real'], ['--equipment', '--list', '--send-real'],
    ['--case', 'E01', '--send-real', '--case', 'E02'],
  ]) await assert.rejects(runEvaluationCli(args, { env: {}, fetchImpl }), { code: 'INVALID_ARGUMENTS' });
  await assert.rejects(runEvaluationCli(['--case', 'E01', '--send-real'], { env: {}, fetchImpl }), { code: 'MISSING_API_KEY' });
});

test('avaliação de equipamento: encaminha cada pedido sem mudar parâmetros nem repetir a chamada', async () => {
  for (const entry of EQUIPMENT_CASES) {
    let calls = 0, saved;
    const body = JSON.stringify(envelope(recipe(entry)));
    const record = await evaluateCase(entry, { apiKey: randomUUID(),
      fetchImpl: async (_, init) => {
        calls++;
        const request = JSON.parse(init.body);
        assert.deepEqual(JSON.parse(request.messages[1].content), entry.input);
        assert.equal(request.model, MODEL);
        assert.equal(request.max_completion_tokens, 4096);
        assert.equal(request.reasoning_effort, 'low');
        assert.match(request.messages[0].content, /retorne suggestions vazia/u);
        assert.equal(request.response_format.json_schema.schema.properties.suggestions.minItems, undefined);
        return new Response(body);
      }, saveRaw: async bytes => { saved = bytes.toString(); },
    });
    assert.equal(calls, 1);
    assert.equal(saved, body);
    assert.equal(record.case_id, entry.id);
    assert.equal(record.rubric_verdict, null);
    assert.equal(record.metadata.usage.total_tokens, 140);
    assert.equal(record.metadata.usage.reasoning_tokens, null);
  }
});

test('avaliação de equipamento: receita incompatível passa no contrato sem ganhar selo de qualidade', async () => {
  const entry = EQUIPMENT_CASES.find(item => item.id === 'E06');
  const record = await evaluateCase(entry, { apiKey: randomUUID(), saveRaw: async () => {},
    fetchImpl: async () => Response.json(envelope(recipe(entry,
      ['Corte a banana com uma faca sobre uma tábua, transfira para uma tigela e use o forno.']))),
  });
  assert.equal(record.contract_verdict, 'pass');
  assert.equal(record.refusal_channel, 'not_applicable');
  assert.equal(record.rubric_verdict, null);
  assert.equal(record.provider_code, null);
  // Isso documenta a falha silenciosa; não a corrige com contagem de palavras.
});

test('avaliação de equipamento: recusas e receitas forçadas preservam campos independentes e bruto', async () => {
  for (const entry of EQUIPMENT_CASES.filter(item => !item.feasible)) {
    for (const [data, verdict, channel] of [
      [{ version: 1, mode: 'cook', suggestions: [] }, 'fail', 'empty_suggestions'],
      [recipe(entry, ['Use o forno e o fogão mesmo sem estarem disponíveis.']), 'pass', null],
      [recipe(entry, ['Não consigo atender ao pedido com esses equipamentos.']), 'pass', null],
    ]) {
      let saved;
      const body = JSON.stringify(envelope(data));
      const record = await evaluateCase(entry, { apiKey: randomUUID(),
        fetchImpl: async () => new Response(body), saveRaw: async bytes => { saved = bytes.toString(); },
      });
      assert.equal(saved, body);
      assert.equal(record.contract_verdict, verdict);
      assert.equal(record.contract_error?.path ?? null, verdict === 'fail' ? 'output.suggestions' : null);
      assert.equal(record.provider_code, verdict === 'fail' ? 'INVALID_OUTPUT' : null);
      assert.equal(record.refusal_channel, channel);
      assert.equal(record.rubric_verdict, null);
    }
  }
});

test('avaliação de equipamento: CLI grava só o caso escolhido, sem credencial nem avaliação inventada', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rf-equipment-'));
  const env = { GROQ_API_KEY: randomUUID(), GROQ_EVAL_DIR: root };
  const entry = EQUIPMENT_CASES[0];
  let calls = 0;
  const status = await runEvaluationCli(['--case', entry.id, '--send-real'], { env, log() {},
    fetchImpl: async () => { calls++; return Response.json(envelope(recipe(entry))); },
  });
  assert.equal(status, 0);
  assert.equal(calls, 1);
  const directory = join(root, (await readdir(root))[0]);
  assert.deepEqual((await readdir(directory)).sort(), ['E01.raw.txt', 'E01.record.json', 'manifest.json', 'summary.json']);
  const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
  assert.deepEqual(manifest.cases, [entry]);
  assert.equal(manifest.calls_planned, 1);
  assert.equal(manifest.retries, 0);
  const record = JSON.parse(await readFile(join(directory, 'E01.record.json'), 'utf8'));
  assert.equal(record.rubric_verdict, null);
  const summary = JSON.parse(await readFile(join(directory, 'summary.json'), 'utf8'));
  assert.equal(summary.attempted, 1);
  assert.equal(summary.pending_human_review, 1);
  for (const file of await readdir(directory)) {
    assert.ok(!(await readFile(join(directory, file), 'utf8')).includes(env.GROQ_API_KEY));
  }
});
