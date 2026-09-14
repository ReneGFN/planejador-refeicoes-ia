import { mkdir, mkdtemp, open, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { generateWithGroq, MODEL, ProviderError } from '../src/providers/groq.js';
import { validateProviderOptions, technicalCategory } from '../src/providers/groq-client.js';
import { ContractError, validateGenerationInput, validateGenerationOutput } from '../src/contracts/generation.js';
import { QUALITY_CASES } from './fixtures/generation-quality-cases.mjs';
import { EQUIPMENT_CASES } from './fixtures/equipment-quality-cases.mjs';
import { COMPARE_CASES } from './fixtures/compare-quality-cases.mjs';
import { calculateComparison } from '../src/comparison/calculate.js';

const MAX_CAPTURE_BYTES = 256 * 1024 + 1; // Um byte extra permite ao adaptador detectar excesso.
const ERRORS = {
  MISSING_API_KEY: 'Configure GROQ_API_KEY privadamente no processo antes de executar.',
  INVALID_ARGUMENTS: 'Use evaluate --case C01 --send-real, evaluate --case E01 --send-real ou evaluate --case M01 --send-real. --all --send-real mantém apenas C01–C10. Para listar sem rede, use evaluate --list, evaluate --equipment --list ou evaluate --compare --list.',
  INVALID_OUTPUT_DIRECTORY: 'Configure GROQ_EVAL_DIR com um caminho absoluto fora do repositório e do OneDrive.',
  STORAGE_FAILED: 'Não foi possível salvar o registro local. O lote foi interrompido; não repita a chamada automaticamente.',
  EVALUATION_FAILED: 'O instrumento falhou. Confira os arquivos já salvos antes de iniciar outra execução.',
};
export class EvaluationError extends Error {
  constructor(code) { super(ERRORS[code] ?? ERRORS.EVALUATION_FAILED); this.name = 'EvaluationError'; this.code = code; }
}

// Identifica o texto realmente enviado, inclusive espaços/quebras de linha.
// Só no avaliador Node: não muda o prompt, a requisição Groq ou a resposta da API.
export function generationPromptVersion(system) {
  if (typeof system !== 'string' || !system.length) throw new EvaluationError('EVALUATION_FAILED');
  return 'sha256:' + createHash('sha256').update(system, 'utf8').digest('hex');
}

// Só o CLI captura o bruto. O backend e o transporte compartilhado ficam intactos.
async function captureBody(response, signal, state) {
  if (!response.body) return;
  const reader = response.body.getReader();
  const parts = [];
  let size = 0;
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (signal.aborted) throw new ProviderError('TIMEOUT');
      if (done) { state.raw_complete = true; break; }
      const remaining = MAX_CAPTURE_BYTES - size;
      parts.push(value.slice(0, remaining));
      size += Math.min(value.byteLength, remaining);
      if (size === MAX_CAPTURE_BYTES) {
        state.capture_limited = true;
        await reader.cancel();
        break;
      }
    }
  } finally {
    signal.removeEventListener('abort', abort);
    reader.releaseLock();
    state.bytes = Buffer.concat(parts, size);
  }
}

export function contractVerdict(content, input) {
  let raw;
  try { raw = JSON.parse(content); }
  catch { return { contract_verdict: 'fail', contract_error: { path: 'output', code: 'INVALID_JSON' } }; }
  try {
    validateGenerationOutput(raw, input);
    return { contract_verdict: 'pass', contract_error: null };
  } catch (error) {
    if (!(error instanceof ContractError)) throw error;
    return { contract_verdict: 'fail', contract_error: { path: error.path, code: 'CONTRACT_ERROR' } };
  }
}

function usageOf(raw) {
  const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
  return { prompt_tokens: count(raw?.prompt_tokens), completion_tokens: count(raw?.completion_tokens),
    total_tokens: count(raw?.total_tokens), reasoning_tokens: count(raw?.completion_tokens_details?.reasoning_tokens) };
}

export async function evaluateCase(entry, { apiKey, fetchImpl = fetch, saveRaw, timeoutMs = 30000 } = {}) {
  validateGenerationInput(entry.input);
  validateProviderOptions({ apiKey, timeoutMs });
  if (typeof saveRaw !== 'function') throw new EvaluationError('STORAGE_FAILED');
  const state = { bytes: Buffer.alloc(0), raw_complete: false, capture_limited: false };
  let httpStatus = null, providerElapsed = null, requestSettings = null;
  let storageError = false, rawSaved = false, providerCode = null, adapterElapsed = null;
  let comparison = null, providerDiagnostic = null;
  const started = performance.now();
  try {
    const result = await generateWithGroq(entry.input, { apiKey, timeoutMs, fetchImpl: async (url, init) => {
      const body = JSON.parse(init.body);
      requestSettings = { model: body.model, max_completion_tokens: body.max_completion_tokens, reasoning_effort: body.reasoning_effort,
        system_prompt_version: generationPromptVersion(body.messages[0].content) };
      const sent = performance.now();
      let response;
      try {
        response = await fetchImpl(url, init);
        httpStatus = response.status;
        try { await captureBody(response, init.signal, state); }
        catch (error) {
          if (error instanceof ProviderError) throw error;
          throw new ProviderError('RESPONSE_READ_ERROR', null, technicalCategory(error, 'response_body'));
        }
      } finally {
        providerElapsed = Math.round((performance.now() - sent) * 1000) / 1000;
        // Await antes de devolver os bytes ao adaptador: bruto salvo ANTES da validação.
        try { await saveRaw(state.bytes); rawSaved = true; }
        catch { storageError = true; throw new EvaluationError('STORAGE_FAILED'); }
      }
      return new Response([204, 205, 304].includes(response.status) ? null : state.bytes,
        { status: response.status });
    } });
    adapterElapsed = result.metadata.elapsed_ms;
    // Mesmo módulo puro da rota: só calcular após sucesso do adaptador inteiro.
    // Conteúdo estruturalmente válido em envelope truncado/recusado não basta.
    if (entry.input.mode === 'compare') comparison = calculateComparison(entry.input, result.data);
  } catch (error) {
    if (storageError) throw new EvaluationError('STORAGE_FAILED');
    if (!(error instanceof ProviderError)) throw error;
    providerCode = error.code;
    providerDiagnostic = error.diagnostic;
  }
  if (!rawSaved) throw new EvaluationError('EVALUATION_FAILED');
  let envelope = null, content = null;
  if (state.raw_complete) {
    try { envelope = JSON.parse(state.bytes.toString('utf8')); } catch { /* Bruto preservado, sem reparo. */ }
    content = envelope?.choices?.[0]?.message?.content;
  }
  const verdict = typeof content === 'string' ? contractVerdict(content, entry.input)
    : { contract_verdict: 'fail', contract_error: { path: 'output', code: 'CONTENT_UNAVAILABLE' } };
  let empty = false;
  try { const raw = JSON.parse(content); empty = Array.isArray(raw?.suggestions) && raw.suggestions.length === 0; }
  catch { /* Não classificar texto livre ou JSON inválido como recusa. */ }
  return {
    case_id: entry.id, input: entry.input, feasible: entry.feasible,
    request_settings: requestSettings, http_status: httpStatus, provider_code: providerCode,
    provider_diagnostic: providerDiagnostic,
    raw_complete: state.raw_complete, capture_limited: state.capture_limited, raw_bytes: state.bytes.length,
    metadata: { model: typeof envelope?.model === 'string' ? envelope.model : null,
      usage: usageOf(envelope?.usage), provider_elapsed_ms: providerElapsed,
      adapter_elapsed_ms: adapterElapsed, elapsed_ms: Math.round((performance.now() - started) * 1000) / 1000 },
    ...verdict,
    // Receita forçada e recusa em prosa exigem leitura humana, não heurística de palavras.
    refusal_channel: entry.input.mode === 'compare' ? null : entry.feasible ? 'not_applicable' : empty ? 'empty_suggestions' : null,
    rubric_verdict: null,
    // Expectativa da fixture não é veredito. Status observados ficam no bruto e,
    // quando válidos, nas métricas; avaliar a correção de cada lado é tarefa humana.
    ...(entry.input.mode === 'compare' ? { expected_sides: entry.expected_sides, comparison } : {}),
  };
}

export function summarize(records) {
  const failures = {};
  for (const record of records) {
    if (record.contract_verdict === 'fail') {
      const path = record.contract_error.path;
      failures[path] = (Object.hasOwn(failures, path) ? failures[path] : 0) + 1;
    }
  }
  return { attempted: records.length, contract_pass: records.filter(r => r.contract_verdict === 'pass').length,
    contract_fail: records.filter(r => r.contract_verdict === 'fail').length, failures_by_path: failures,
    unavailable_content: records.filter(r => r.contract_error?.code === 'CONTENT_UNAVAILABLE').length,
    provider_failures: records.filter(r => r.provider_code !== null).length,
    pending_human_review: records.filter(r => r.rubric_verdict === null).length };
}

export function parseEvaluationArgs(args) {
  if (args.length === 1 && args[0] === '--list') return { list: true };
  if (args.length === 2 && args[0] === '--equipment' && args[1] === '--list') return { list: true, cases: EQUIPMENT_CASES };
  if (args.length === 2 && args[0] === '--compare' && args[1] === '--list') return { list: true, cases: COMPARE_CASES };
  // Preservar o tamanho do lote aprovado: equipamento e compare exigem escolha individual.
  if (args.length === 2 && args[0] === '--all' && args[1] === '--send-real') return { cases: QUALITY_CASES };
  if (args.length === 3 && args[0] === '--case' && args[2] === '--send-real') {
    const entry = [...QUALITY_CASES, ...EQUIPMENT_CASES, ...COMPARE_CASES].find(item => item.id === args[1]);
    if (entry) return { cases: [entry] };
  }
  throw new EvaluationError('INVALID_ARGUMENTS');
}

const within = (parent, child) => {
  const path = relative(parent, child);
  return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`));
};

async function outputDirectory(env) {
  const requested = env.GROQ_EVAL_DIR;
  if (!requested || !isAbsolute(requested)) throw new EvaluationError('INVALID_OUTPUT_DIRECTORY');
  const forbidden = [fileURLToPath(new URL('../', import.meta.url)), env.OneDrive, env.OneDriveConsumer, env.OneDriveCommercial].filter(Boolean);
  if (forbidden.some(root => within(resolve(root), resolve(requested)))) throw new EvaluationError('INVALID_OUTPUT_DIRECTORY');
  await mkdir(requested, { recursive: true });
  const actual = await realpath(requested);
  for (const root of forbidden) {
    const canonical = await realpath(root).catch(() => resolve(root));
    if (within(canonical, actual)) throw new EvaluationError('INVALID_OUTPUT_DIRECTORY');
  }
  return mkdtemp(resolve(actual, 'refeicao-facil-avaliacao-'));
}

// Nunca sobrescrever um registro anterior. A gravação é exclusiva e sincronizada.
export async function saveExclusive(path, value) {
  let handle;
  try {
    handle = await open(path, 'wx', 0o600);
    await handle.writeFile(value);
    await handle.sync();
  } catch { throw new EvaluationError('STORAGE_FAILED'); }
  finally { await handle?.close(); }
}

export async function runEvaluationCli(args, { env = process.env, fetchImpl = fetch, log = console.log } = {}) {
  const selection = parseEvaluationArgs(args);
  if (selection.list) {
    for (const entry of selection.cases ?? QUALITY_CASES) log(`${entry.id}: ${entry.label}`);
    return 0;
  }
  if (typeof env.GROQ_API_KEY !== 'string' || !env.GROQ_API_KEY.trim()) throw new EvaluationError('MISSING_API_KEY');
  let directory;
  try { directory = await outputDirectory(env); }
  catch (error) { throw error instanceof EvaluationError ? error : new EvaluationError('STORAGE_FAILED'); }
  const records = [];
  await saveExclusive(resolve(directory, 'manifest.json'), JSON.stringify({
    version: 1, started_at: new Date().toISOString(), model_requested: MODEL,
    cases: selection.cases, calls_planned: selection.cases.length, retries: 0,
  }, null, 2));
  log(`Registros locais: ${directory}`);
  log(`Até ${selection.cases.length} chamadas reais, sequenciais e sem repetição. Não passam pelas cotas do aplicativo.`);
  for (const entry of selection.cases) {
    const record = await evaluateCase(entry, { apiKey: env.GROQ_API_KEY, fetchImpl,
      saveRaw: bytes => saveExclusive(resolve(directory, `${entry.id}.raw.txt`), bytes) });
    await saveExclusive(resolve(directory, `${entry.id}.record.json`), JSON.stringify(record, null, 2));
    records.push(record);
    log(`${entry.id}: contrato ${record.contract_verdict}; campo ${record.contract_error?.path ?? 'nenhum'}; avaliação humana pendente.`);
    // Falha de contrato não impede observar os outros casos; falha operacional para o lote.
    if (record.provider_code && record.provider_code !== 'INVALID_OUTPUT') break;
  }
  const summary = { ...summarize(records), planned: selection.cases.length, not_attempted: selection.cases.length - records.length };
  await saveExclusive(resolve(directory, 'summary.json'), JSON.stringify(summary, null, 2));
  log(JSON.stringify(summary, null, 2));
  return summary.contract_fail || summary.provider_failures ? 1 : 0;
}
