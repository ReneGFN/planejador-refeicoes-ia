import { generateWithGroq, ProviderError } from '../src/providers/groq.js';
import { runEvaluationCli, EvaluationError } from './generation-quality.mjs';

// Uma única chamada com dados fictícios. Sem escrever histórico ou publicar endpoint.
const mode = process.argv[2];
if (mode === 'evaluate') {
  try { process.exitCode = await runEvaluationCli(process.argv.slice(3)); }
  catch (error) {
    const known = error instanceof EvaluationError ? error : new EvaluationError('EVALUATION_FAILED');
    console.error(JSON.stringify({ code: known.code, message: known.message }));
    process.exitCode = 1;
  }
} else {
if (!['cook', 'ready'].includes(mode)) {
  console.error('Escolha cook ou ready. Cada execução consome uma chamada real.');
  process.exit(1);
}
const input = mode === 'cook'
  ? { mode, meal: 'jantar', people: 2, time_minutes: 30, ingredient_policy: 'can_buy_missing', ingredients: ['arroz', 'ovo', 'cenoura'] }
  : { mode, meal: 'almoço', people: 1 };
try {
  const result = await generateWithGroq(input, { apiKey: process.env.GROQ_API_KEY });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(JSON.stringify({ code: error instanceof ProviderError ? error.code : 'TEST_FAILED', usage: error instanceof ProviderError ? error.usage : null }));
  process.exitCode = 1;
}
}
