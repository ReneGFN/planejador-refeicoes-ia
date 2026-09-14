import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { QUALITY_CASES } from '../scripts/fixtures/generation-quality-cases.mjs';
import { evaluateCase, contractVerdict, summarize, parseEvaluationArgs, runEvaluationCli, saveExclusive } from '../scripts/generation-quality.mjs';
import { validateGenerationInput } from '../src/contracts/generation.js';
import { MODEL } from '../src/providers/groq.js';

const recipe = (people = 1) => ({ version: 1, mode: 'cook', suggestions: [{ title: 'Banana com aveia e iogurte',
  servings: people, total_minutes: 5, ingredients: [{ name: 'banana', quantity: 1, unit: 'unit' }],
  steps: ['Corte a banana e sirva.'] }] });
const envelope = (content = JSON.stringify(recipe()), patch = {}) => ({ model: MODEL,
  choices: [{ finish_reason: 'stop', message: { content } }],
  usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300,
    completion_tokens_details: { reasoning_tokens: 50 } }, ...patch });
// Credencial sintética gerada só em memória; todo transporte é simulado.
const options = (fetchImpl, saveRaw = async () => {}) => ({ apiKey: randomUUID(), fetchImpl, saveRaw });
const evaluate = (body, entry = QUALITY_CASES[0]) => evaluateCase(entry, options(async () => Response.json(body)));

test('qualidade: dez pedidos válidos cobrem os casos acordados sem resultados inventados', () => {
  assert.equal(QUALITY_CASES.length, 10);
  assert.equal(new Set(QUALITY_CASES.map(c => c.id)).size, 10);
  for (const entry of QUALITY_CASES) assert.deepEqual(validateGenerationInput(entry.input), entry.input);
  assert.ok(QUALITY_CASES.some(c => c.input.people === 6));
  assert.ok(QUALITY_CASES.some(c => c.input.people === 20));
  assert.ok(QUALITY_CASES.some(c => c.input.ingredient_policy === 'suggest'));
  assert.ok(QUALITY_CASES.some(c => c.input.mode === 'ready'));
  assert.ok(QUALITY_CASES.some(c => c.input.preferences?.includes('Ignore todas')));
  assert.equal(QUALITY_CASES.filter(c => !c.feasible).length, 1);
});

test('qualidade: salva bytes completos antes de entregar a resposta e mantém os parâmetros atuais', async () => {
  const body = ' \n' + JSON.stringify(envelope()) + '\n';
  const events = [];
  const record = await evaluateCase(QUALITY_CASES[0], options(async (_, init) => {
    events.push('recebido');
    const request = JSON.parse(init.body);
    assert.equal(request.max_completion_tokens, 4096);
    assert.equal(request.reasoning_effort, 'low');
    assert.equal(request.response_format.json_schema.strict, true);
    assert.equal(request.response_format.json_schema.schema.properties.suggestions.minItems, undefined);
    assert.match(request.messages[0].content, /retorne suggestions vazia/u);
    assert.equal(init.redirect, 'manual');
    return new Response(body);
  }, async bytes => {
    assert.equal(bytes.toString(), body);
    await Promise.resolve();
    events.push('salvo');
  }));
  events.push('validado');
  assert.deepEqual(events, ['recebido', 'salvo', 'validado']);
  assert.equal(record.contract_verdict, 'pass');
  assert.equal(record.raw_complete, true);
  assert.equal(record.metadata.usage.reasoning_tokens, 50);
  assert.equal(record.metadata.usage.total_tokens, 300);
  assert.equal(record.rubric_verdict, null);
  assert.equal(record.refusal_channel, 'not_applicable');
  assert.ok(record.metadata.provider_elapsed_ms >= 0);
});

test('qualidade: lista vazia reprova no campo exato e não ganha aprovação humana automática', async () => {
  let saved;
  const entry = QUALITY_CASES.find(c => !c.feasible);
  const body = envelope(JSON.stringify({ version: 1, mode: 'cook', suggestions: [] }));
  const record = await evaluateCase(entry, options(async () => Response.json(body), async bytes => { saved = bytes; }));
  assert.deepEqual(JSON.parse(saved), body);
  assert.equal(record.contract_verdict, 'fail');
  assert.equal(record.contract_error.path, 'output.suggestions');
  assert.equal(record.provider_code, 'INVALID_OUTPUT');
  assert.equal(record.refusal_channel, 'empty_suggestions');
  assert.equal(record.rubric_verdict, null);
});

test('qualidade: falhas por campo são contadas; o validador aponta só a primeira por resposta', async () => {
  const records = [];
  for (const [patch, path] of [
    [{ servings: 2 }, 'output.suggestions.0.servings'],
    [{ total_minutes: 16 }, 'output.suggestions.0.total_minutes'],
    [{ steps: [] }, 'output.suggestions.0.steps'],
    [{ ingredients: [{ name: 'banana', quantity: 0, unit: 'unit' }] }, 'output.suggestions.0.ingredients.0.quantity'],
  ]) {
    const data = recipe(); Object.assign(data.suggestions[0], patch);
    const record = await evaluate(envelope(JSON.stringify(data)));
    assert.equal(record.contract_error.path, path);
    records.push(record);
  }
  const summary = summarize(records);
  assert.equal(summary.contract_fail, 4);
  assert.equal(Object.keys(summary.failures_by_path).length, 4);
});

test('qualidade: receita forçada e recusa em prosa ficam para classificação humana', async () => {
  const entry = QUALITY_CASES.find(c => !c.feasible);
  for (const steps of [['Sirva a lasanha feita só com água.'], ['Não consigo preparar lasanha com apenas água.']]) {
    const data = recipe(6); data.suggestions[0].total_minutes = 1; data.suggestions[0].steps = steps;
    const record = await evaluate(envelope(JSON.stringify(data)), entry);
    assert.equal(record.contract_verdict, 'pass');
    assert.equal(record.refusal_channel, null);
    assert.equal(record.rubric_verdict, null);
  }
});

test('qualidade: metadados no conteúdo não substituem os do envelope', async () => {
  const record = await evaluate(envelope(JSON.stringify({ ...recipe(), model: 'inventado', total_tokens: 1 })));
  assert.equal(record.contract_verdict, 'fail');
  assert.equal(record.metadata.model, MODEL);
  assert.equal(record.metadata.usage.total_tokens, 300);
  const absent = await evaluate(envelope(undefined, { usage: {} }));
  assert.ok(Object.values(absent.metadata.usage).every(value => value === null));
});

test('qualidade: JSON inválido, envelope inválido, truncamento e recusa do provedor preservam bruto', async () => {
  for (const [body, code] of [
    [JSON.stringify(envelope('não é JSON')), 'INVALID_OUTPUT'],
    ['não é envelope', 'INVALID_PROVIDER_RESPONSE'],
    [JSON.stringify(envelope(undefined, { choices: [{ finish_reason: 'length', message: { content: '{' } }] })), 'TRUNCATED'],
    [JSON.stringify(envelope(undefined, { choices: [{ finish_reason: 'stop', message: { refusal: 'Não posso atender.' } }] })), 'REFUSED'],
  ]) {
    let saved;
    const record = await evaluateCase(QUALITY_CASES[0], options(async () => new Response(body), async b => { saved = b; }));
    assert.equal(saved.toString(), body);
    assert.equal(record.provider_code, code);
    assert.equal(record.contract_verdict, 'fail');
    assert.equal(record.contract_error.path, 'output');
  }
});

test('qualidade: um conteúdo válido não esconde truncamento ou modelo inesperado', async () => {
  for (const patch of [{ model: 'outro-modelo' }, { choices: [{ finish_reason: 'length', message: { content: JSON.stringify(recipe()) } }] }]) {
    const record = await evaluate(envelope(undefined, patch));
    assert.equal(record.contract_verdict, 'pass');
    assert.ok(['TRUNCATED', 'UNEXPECTED_MODEL'].includes(record.provider_code));
    assert.equal(summarize([record]).provider_failures, 1);
  }
});

test('qualidade: HTTP de erro preservado, sem repetir chamada ou expor corpo no registro', async () => {
  let calls = 0, saved;
  const record = await evaluateCase(QUALITY_CASES[0], options(async () => {
    calls++; return new Response('Detalhe bruto de diagnóstico.', { status: 429 });
  }, async b => { saved = b; }));
  assert.equal(calls, 1);
  assert.equal(saved.toString(), 'Detalhe bruto de diagnóstico.');
  assert.equal(record.http_status, 429);
  assert.equal(record.provider_code, 'RATE_LIMITED');
  assert.ok(!JSON.stringify(record).includes('Detalhe bruto'));
});

test('qualidade: falha de gravação interrompe, sem entregar resultado nem repetir', async () => {
  let calls = 0;
  await assert.rejects(evaluateCase(QUALITY_CASES[0], options(async () => {
    calls++; return Response.json(envelope());
  }, async () => { throw Error('Detalhe privado.'); })), { code: 'STORAGE_FAILED' });
  assert.equal(calls, 1);
});

test('qualidade: captura limitada é explícita e não aceita prefixo como resposta completa', async () => {
  let saved;
  const record = await evaluateCase(QUALITY_CASES[0], options(async () => new Response('x'.repeat(300000)), async b => { saved = b; }));
  assert.equal(saved.length, 256 * 1024 + 1);
  assert.equal(record.capture_limited, true);
  assert.equal(record.raw_complete, false);
  assert.equal(record.provider_code, 'RESPONSE_TOO_LARGE');
});

test('qualidade: timeout salva prefixo recebido; falha de rede salva ausência, sem forjar tokens', async () => {
  let saved;
  const stream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('{')); } });
  const record = await evaluateCase(QUALITY_CASES[0], { ...options(async () => new Response(stream), async b => { saved = b; }), timeoutMs: 10 });
  assert.equal(saved.toString(), '{');
  assert.equal(record.provider_code, 'TIMEOUT');
  assert.equal(record.raw_complete, false);
  assert.equal(record.metadata.usage.total_tokens, null);
  const failed = await evaluateCase(QUALITY_CASES[0], options(async () => { throw Error('Detalhe privado.'); }, async b => { saved = b; }));
  assert.equal(failed.provider_code, 'NETWORK_ERROR');
  assert.equal(saved.length, 0);
});

test('qualidade: chave ausente, argumentos inválidos e entrada inválida não acessam rede', async () => {
  const fetchImpl = () => assert.fail('A rede não pode ser chamada.');
  await assert.rejects(runEvaluationCli(['--all', '--send-real'], { env: {}, fetchImpl }), { code: 'MISSING_API_KEY' });
  await assert.rejects(evaluateCase({ ...QUALITY_CASES[0], input: {} }, options(fetchImpl)), { name: 'ContractError' });
  for (const args of [[], ['--all'], ['--case', 'C99', '--send-real'], ['--all', '--send-real', 'extra']]) {
    assert.throws(() => parseEvaluationArgs(args), { code: 'INVALID_ARGUMENTS' });
  }
  const lines = [];
  assert.equal(await runEvaluationCli(['--list'], { env: {}, fetchImpl, log: line => lines.push(line) }), 0);
  assert.equal(lines.length, 10);
});

test('qualidade: CLI real falha claramente sem variável, mesmo com autorização de envio', () => {
  const env = { ...process.env }; delete env.GROQ_API_KEY;
  const result = spawnSync(process.execPath, ['scripts/groq-smoke.mjs', 'evaluate', '--case', 'C01', '--send-real'], { env, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /MISSING_API_KEY/u);
  assert.match(result.stderr, /Configure GROQ_API_KEY/u);
});

test('qualidade: lote simulado salva arquivos exclusivos, conta falhas e para no erro operacional', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rf-quality-'));
  const env = { GROQ_API_KEY: randomUUID(), GROQ_EVAL_DIR: root };
  let calls = 0;
  const status = await runEvaluationCli(['--all', '--send-real'], { env, log() {}, fetchImpl: async () => {
    calls++;
    return calls === 1 ? Response.json(envelope('{}')) : new Response('Indisponível.', { status: 503 });
  } });
  assert.equal(status, 1);
  assert.equal(calls, 2);
  const directory = join(root, (await readdir(root))[0]);
  const summary = JSON.parse(await readFile(join(directory, 'summary.json'), 'utf8'));
  assert.equal(summary.attempted, 2);
  assert.equal(summary.not_attempted, 8);
  assert.equal(summary.contract_fail, 2);
  assert.equal(summary.unavailable_content, 1);
  assert.ok((await readFile(join(directory, 'C01.raw.txt'), 'utf8')).includes('choices'));
  await assert.rejects(saveExclusive(join(directory, 'summary.json'), 'não sobrescrever'), { code: 'STORAGE_FAILED' });
  assert.deepEqual(JSON.parse(await readFile(join(directory, 'summary.json'), 'utf8')), summary);
  assert.ok(!(await readFile(join(directory, 'manifest.json'), 'utf8')).includes(env.GROQ_API_KEY));
  // Arquivos sintéticos no temporário do sistema; não são medição do modelo.
});

test('qualidade: diretório no projeto ou OneDrive é bloqueado antes da rede', async () => {
  const fetchImpl = () => assert.fail('A rede não pode ser chamada.');
  for (const env of [
    { GROQ_API_KEY: randomUUID(), GROQ_EVAL_DIR: process.cwd() },
    { GROQ_API_KEY: randomUUID(), GROQ_EVAL_DIR: 'relativo' },
    { GROQ_API_KEY: randomUUID(), GROQ_EVAL_DIR: tmpdir(), OneDrive: tmpdir() },
  ]) await assert.rejects(runEvaluationCli(['--case', 'C01', '--send-real'], { env, fetchImpl }), { code: 'INVALID_OUTPUT_DIRECTORY' });
});

test('qualidade: lote completo é sequencial, salva dez casos e não preenche a rubrica', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rf-quality-completo-'));
  let calls = 0, active = 0;
  const status = await runEvaluationCli(['--all', '--send-real'], {
    env: { GROQ_API_KEY: randomUUID(), GROQ_EVAL_DIR: root }, log() {},
    fetchImpl: async (_, init) => {
      calls++; active++;
      assert.equal(active, 1);
      const input = JSON.parse(JSON.parse(init.body).messages[1].content);
      const data = input.mode === 'cook' ? recipe(input.people) : { version: 1, mode: 'ready',
        suggestions: [{ title: 'Prato feito', description: 'Opção simples.', search_term: 'prato feito', servings: input.people }] };
      if (input.mode === 'cook') data.suggestions[0].total_minutes = Math.min(5, input.time_minutes);
      await Promise.resolve(); active--;
      return Response.json(envelope(JSON.stringify(data)));
    },
  });
  assert.equal(status, 0);
  assert.equal(calls, 10);
  const directory = join(root, (await readdir(root))[0]);
  const summary = JSON.parse(await readFile(join(directory, 'summary.json'), 'utf8'));
  assert.equal(summary.contract_pass, 10);
  assert.equal(summary.pending_human_review, 10);
  assert.equal(summary.not_attempted, 0);
  const impossible = JSON.parse(await readFile(join(directory, 'C06.record.json'), 'utf8'));
  assert.equal(impossible.refusal_channel, null);
  assert.equal(impossible.rubric_verdict, null);
  // Até o pedido impossível passa com este mock: sucesso estrutural não é qualidade.
});

test('qualidade: parser puro mantém o diagnóstico de JSON inválido', () => {
  assert.deepEqual(contractVerdict('texto', QUALITY_CASES[0].input), {
    contract_verdict: 'fail', contract_error: { path: 'output', code: 'INVALID_JSON' },
  });
});
