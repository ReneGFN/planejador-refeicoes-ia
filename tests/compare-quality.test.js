import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { COMPARE_CASES } from '../scripts/fixtures/compare-quality-cases.mjs';
import { QUALITY_CASES } from '../scripts/fixtures/generation-quality-cases.mjs';
import { EQUIPMENT_CASES } from '../scripts/fixtures/equipment-quality-cases.mjs';
import { evaluateCase, parseEvaluationArgs, runEvaluationCli, generationPromptVersion } from '../scripts/generation-quality.mjs';
import { validateGenerationInput } from '../src/contracts/generation.js';
import { generationSystem } from '../src/providers/generation-prompts.js';
import { MODEL } from '../src/providers/groq.js';
import { compareWire } from './helpers/compare-wire.js';

// Respostas sintéticas: passam na forma, não comprovam qualidade culinária.
const data = entry => ({ version: 1, mode: 'compare',
  cook: { status: 'suggested', suggestions: [{ title: 'Resposta simulada', servings: entry.input.people,
    total_minutes: 5, ingredients: [{ name: 'banana', quantity: 1, unit: 'unit' }], steps: ['Descasque e sirva.'] }] },
  ready: { status: 'suggested', suggestions: [{ title: 'Busca simulada', description: 'Uma opção para buscar.',
    search_term: 'banana', servings: entry.input.people, estimated_price_brl: { value: 20, origin: 'estimado' } }] } });
const noSuggestion = () => ({ status: 'not_suggested', reason: 'Não foi encontrada uma opção compatível.' });
const envelope = value => ({ model: MODEL, choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(compareWire(value)) } }],
  usage: { prompt_tokens: 1100, completion_tokens: 600, total_tokens: 1700 } });
const options = fetchImpl => ({ apiKey: randomUUID(), fetchImpl, saveRaw: async () => {} });

test('avaliação compare: seis casos próprios, entradas válidas e expectativas sem notas humanas', () => {
  assert.deepEqual(COMPARE_CASES.map(c => c.id), ['M01', 'M02', 'M03', 'M04', 'M05', 'M06']);
  const ids = [...QUALITY_CASES, ...EQUIPMENT_CASES, ...COMPARE_CASES].map(c => c.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const entry of COMPARE_CASES) {
    assert.deepEqual(validateGenerationInput(entry.input), entry.input);
    assert.equal(entry.input.mode, 'compare');
    assert.equal(entry.feasible, null);
    assert.equal(typeof entry.focus, 'string');
    assert.equal(Object.hasOwn(entry, 'rubric_verdict'), false);
    assert.deepEqual(Object.keys(entry.expected_sides), ['cook', 'ready']);
  }
  const withHour = structuredClone(COMPARE_CASES[0].input); delete withHour.hourly_rate_brl;
  assert.deepEqual(withHour, COMPARE_CASES[1].input);
  assert.equal(COMPARE_CASES[2].input.hourly_rate_brl, 0);
  assert.deepEqual(COMPARE_CASES[3].expected_sides, { cook: false, ready: true });
  assert.deepEqual(COMPARE_CASES[4].expected_sides, { cook: false, ready: false });
  assert.deepEqual(COMPARE_CASES[5].input.equipment, ['microondas']);
  assert.deepEqual(COMPARE_CASES[5].input.avoid_equipment, ['forno', 'fogao']);
  assert.equal(COMPARE_CASES[5].input.max_dishes, 2);
});

test('avaliação compare: listar não chama rede; seleção individual não infla lotes anteriores', async () => {
  const lines = [];
  assert.equal(await runEvaluationCli(['--compare', '--list'], { env: {},
    fetchImpl: () => assert.fail('Listagem não usa rede.'), log: line => lines.push(line) }), 0);
  assert.deepEqual(lines, COMPARE_CASES.map(c => `${c.id}: ${c.label}`));
  assert.deepEqual(parseEvaluationArgs(['--all', '--send-real']), { cases: QUALITY_CASES });
  assert.equal(QUALITY_CASES.length, 10);
  assert.deepEqual(parseEvaluationArgs(['--equipment', '--list']), { list: true, cases: EQUIPMENT_CASES });
  assert.deepEqual(parseEvaluationArgs(['--list']), { list: true });
  for (const entry of COMPARE_CASES) assert.deepEqual(parseEvaluationArgs(['--case', entry.id, '--send-real']), { cases: [entry] });
});

test('avaliação compare: exige autorização individual e chave antes de acessar rede', async () => {
  const fetchImpl = () => assert.fail('Não deveria enviar.');
  for (const args of [['--case', 'M01'], ['--case', 'M99', '--send-real'], ['--compare', '--send-real'],
    ['--compare', '--all', '--send-real'], ['--compare', '--list', '--send-real'], ['--case', 'M01', '--send-real', 'extra']]) {
    await assert.rejects(runEvaluationCli(args, { env: {}, fetchImpl }), { code: 'INVALID_ARGUMENTS' });
  }
  await assert.rejects(runEvaluationCli(['--case', 'M01', '--send-real'], { env: {}, fetchImpl }), { code: 'MISSING_API_KEY' });
});

test('avaliação compare: uma chamada por caso, bruto antes dos cálculos, parâmetros e hash reais do envio', async () => {
  for (const entry of COMPARE_CASES) {
    let calls = 0, saved = false;
    const body = ' \n' + JSON.stringify(envelope(data(entry))) + '\n';
    const record = await evaluateCase(entry, { ...options(async (_, init) => {
      calls++;
      const sent = JSON.parse(init.body), expected = { ...entry.input }; delete expected.hourly_rate_brl;
      assert.deepEqual(JSON.parse(sent.messages[1].content), expected);
      assert.equal(sent.max_completion_tokens, 4096);
      assert.equal(sent.reasoning_effort, 'low');
      assert.equal(sent.response_format.json_schema.name, 'meal_compare_v1');
      assert.equal(sent.response_format.json_schema.strict, true);
      assert.equal(sent.messages[0].content, generationSystem('compare'));
      assert.equal(Object.hasOwn(JSON.parse(sent.messages[1].content), 'comparison'), false);
      return new Response(body);
    }), saveRaw: async bytes => { assert.equal(bytes.toString(), body); await Promise.resolve(); saved = true; } });
    assert.equal(saved, true); assert.equal(calls, 1);
    assert.equal(record.contract_verdict, 'pass');
    assert.equal(record.provider_code, null);
    assert.equal(record.request_settings.system_prompt_version, generationPromptVersion(generationSystem('compare')));
    assert.equal(record.metadata.usage.total_tokens, 1700);
    assert.equal(record.metadata.usage.reasoning_tokens, null);
    assert.equal(record.rubric_verdict, null);
    assert.equal(record.refusal_channel, null);
    assert.deepEqual(record.expected_sides, entry.expected_sides);
    assert.equal(record.comparison.partial_comparison.is_total_savings, false);
  }
});

test('avaliação compare: números locais com centavos, ausência de hora/preço e zero explícito', async () => {
  const run = (entry, value = data(entry)) => evaluateCase(entry, options(async () => Response.json(envelope(value))));
  const withHour = await run(COMPARE_CASES[0]);
  assert.equal(withHour.comparison.cook.alternatives[0].time_cost_brl.value, 1.67);
  const difference = withHour.comparison.partial_comparison.pairs[0].difference_brl;
  assert.equal(difference.value, 18.33);
  assert.equal(difference.origin, 'calculado'); assert.equal(difference.based_on_estimates, true);
  const withoutHour = await run(COMPARE_CASES[1]);
  assert.equal(withoutHour.comparison.hourly_rate_brl.status, 'unavailable');
  assert.deepEqual(withoutHour.comparison.cook.alternatives[0].time_cost_brl.reason_codes, ['hourly_rate_not_provided']);
  assert.equal(withoutHour.comparison.partial_comparison.status, 'unavailable');
  const zero = await run(COMPARE_CASES[2]);
  assert.equal(zero.comparison.cook.alternatives[0].time_cost_brl.value, 0);
  const value = data(COMPARE_CASES[0]); delete value.ready.suggestions[0].estimated_price_brl;
  const withoutPrice = await run(COMPARE_CASES[0], value);
  assert.equal(withoutPrice.contract_verdict, 'pass');
  assert.equal(withoutPrice.comparison.partial_comparison.status, 'unavailable');
});

test('avaliação compare: inválidos preservam bruto e caminho exato, sem cálculo ou reparo', async () => {
  const entry = COMPARE_CASES[0];
  const missing = data(entry); delete missing.ready;
  const empty = data(entry); empty.cook.suggestions = [];
  const badPrice = data(entry); badPrice.ready.suggestions[0].estimated_price_brl.value = 1.001;
  for (const [value, path] of [[missing, 'output.ready'], [empty, 'output.cook.suggestions'],
    [badPrice, 'output.ready.suggestions.0.estimated_price_brl.value']]) {
    let saved, calls = 0;
    const body = JSON.stringify(envelope(value));
    const record = await evaluateCase(entry, { ...options(async () => { calls++; return new Response(body); }),
      saveRaw: async bytes => { saved = bytes.toString(); } });
    assert.equal(saved, body); assert.equal(calls, 1);
    assert.equal(record.contract_verdict, 'fail'); assert.equal(record.contract_error.path, path);
    assert.equal(record.provider_code, 'INVALID_OUTPUT'); assert.equal(record.comparison, null);
    assert.equal(record.rubric_verdict, null); assert.equal(record.refusal_channel, null);
  }
});

test('avaliação compare: envelope rejeitado não gera cálculo mesmo com conteúdo válido', async () => {
  const entry = COMPARE_CASES[0];
  for (const kind of ['length', 'refusal', 'model', 'schema', 'network']) {
    let calls = 0, saved = false;
    const record = await evaluateCase(entry, { ...options(async () => {
      calls++;
      if (kind === 'network') throw Error('Diagnóstico privado.');
      if (kind === 'schema') return Response.json({ error: { code: 'json_validate_failed' } }, { status: 400 });
      const body = envelope(data(entry));
      if (kind === 'length') body.choices[0].finish_reason = 'length';
      if (kind === 'refusal') body.choices[0].message.refusal = 'Recusa simulada.';
      if (kind === 'model') body.model = 'modelo-inesperado';
      return Response.json(body);
    }), saveRaw: async () => { saved = true; } });
    assert.equal(calls, 1); assert.equal(saved, true);
    assert.equal(record.comparison, null);
    assert.ok(record.provider_code);
    assert.equal(record.rubric_verdict, null);
    assert.equal(record.contract_verdict, ['schema', 'network'].includes(kind) ? 'fail' : 'pass');
    if (kind === 'network') assert.equal(record.metadata.usage.total_tokens, null);
  }
});

test('avaliação compare: nenhum ou um lado sugerido não recebe aprovação humana automática', async () => {
  for (const [entry, noCook, noReady] of [[COMPARE_CASES[3], true, false], [COMPARE_CASES[4], true, true],
    [COMPARE_CASES[0], false, true]]) {
    const value = data(entry);
    if (noCook) value.cook = noSuggestion();
    if (noReady) value.ready = noSuggestion();
    const record = await evaluateCase(entry, options(async () => Response.json(envelope(value))));
    assert.equal(record.contract_verdict, 'pass'); assert.equal(record.provider_code, null);
    assert.equal(record.comparison.cook.status, value.cook.status);
    assert.equal(record.comparison.ready.status, value.ready.status);
    assert.equal(record.comparison.partial_comparison.status, 'unavailable');
    assert.deepEqual(record.comparison.partial_comparison.pairs, []);
    assert.equal(record.rubric_verdict, null); assert.equal(record.refusal_channel, null);
  }
});

test('avaliação compare: falha semântica pode passar no contrato sem nota nem vencedor inventado', async () => {
  const entry = COMPARE_CASES[5], value = data(entry);
  value.cook.suggestions[0].steps = ['Asse no forno por oito horas.'];
  value.ready.suggestions[0].description = 'Preço consultado e entrega garantida em cinco minutos.';
  const record = await evaluateCase(entry, options(async () => Response.json(envelope(value))));
  assert.equal(record.contract_verdict, 'pass'); assert.equal(record.provider_code, null);
  assert.equal(record.comparison.cook.alternatives[0].preparation_minutes.value, 5);
  assert.equal(record.rubric_verdict, null);
  // O cálculo reproduz o tempo declarado, não verifica as oito horas dos passos.
});

test('avaliação compare: CLI persiste só o escolhido, métricas e revisão pendente, sem credencial', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rf-compare-'));
  const env = { GROQ_API_KEY: randomUUID(), GROQ_EVAL_DIR: root };
  const entry = COMPARE_CASES[0]; let calls = 0;
  assert.equal(await runEvaluationCli(['--case', entry.id, '--send-real'], { env, log() {},
    fetchImpl: async () => { calls++; return Response.json(envelope(data(entry))); } }), 0);
  assert.equal(calls, 1);
  const directory = join(root, (await readdir(root))[0]);
  assert.deepEqual((await readdir(directory)).sort(), ['M01.raw.txt', 'M01.record.json', 'manifest.json', 'summary.json']);
  const read = async name => JSON.parse(await readFile(join(directory, name), 'utf8'));
  const manifest = await read('manifest.json');
  assert.deepEqual(manifest.cases, [entry]); assert.equal(manifest.calls_planned, 1); assert.equal(manifest.retries, 0);
  const record = await read('M01.record.json');
  assert.equal(record.comparison.cook.alternatives[0].time_cost_brl.value, 1.67);
  assert.equal(record.rubric_verdict, null);
  const summary = await read('summary.json');
  assert.equal(summary.attempted, 1); assert.equal(summary.pending_human_review, 1);
  for (const file of await readdir(directory)) assert.ok(!(await readFile(join(directory, file), 'utf8')).includes(env.GROQ_API_KEY));
});
