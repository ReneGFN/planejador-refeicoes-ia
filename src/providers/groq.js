import { validateGenerationInput, validateGenerationOutput, UNIT_CHOICES } from '../contracts/generation.js';
import { generationSystem } from './generation-prompts.js';
import { completeWithGroq } from './groq-client.js';
export { ProviderError } from './groq-client.js';

export const MODEL = 'openai/gpt-oss-20b';
const obj = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const str = { type: 'string' };

export function outputSchema(mode) {
  if (mode === 'compare') return compareSchema();
  const suggestion = mode === 'cook'
    ? obj({ title: str, servings: { type: 'integer' }, total_minutes: { type: 'integer' },
      ingredients: { type: 'array', items: obj({ name: str, quantity: { type: 'number' }, unit: { type: 'string', enum: UNIT_CHOICES } }) },
      steps: { type: 'array', items: str } })
    : obj({ title: str, description: str, search_term: str, servings: { type: 'integer' } });
  return obj({ version: { type: 'integer', enum: [1] }, mode: { type: 'string', enum: [mode] }, suggestions: { type: 'array', items: suggestion } });
}

function compareSchema() {
  // Desenho A: sem anyOf. Campos inativos são null no transporte; exclusão mútua,
  // limites e forma canônica ficam exclusivamente no validador local.
  const cook = outputSchema('cook').properties.suggestions.items;
  const ready = outputSchema('ready').properties.suggestions.items;
  const nullable = schema => ({ ...schema, type: [schema.type, 'null'] });
  const pricedReady = obj({ ...ready.properties,
    estimated_price_brl: nullable(obj({ value: { type: 'number' }, origin: { type: 'string', enum: ['estimado'] } })) });
  const side = suggestion => obj({ status: { type: 'string', enum: ['suggested', 'not_suggested'] },
    suggestions: nullable({ type: 'array', items: suggestion }), reason: nullable(str) });
  return obj({ version: { type: 'integer', enum: [1] }, mode: { type: 'string', enum: ['compare'] },
    cook: side(cook), ready: side(pricedReady) });
}

// Exclusivo do servidor/CLI. Não importar no frontend. Sem retries automáticos.
export async function generateWithGroq(raw, options = {}) {
  const input = validateGenerationInput(raw);
  // Valor da hora pertence apenas ao cálculo local; não orientar a LLM a fazer contas.
  const providerInput = { ...input };
  if (input.mode === 'compare') delete providerInput.hourly_rate_brl;
  const { historyContext, ...providerOptions } = options;
  // Contexto interno separado: não alterar SYSTEM, pedido original ou contrato público.
  // Segunda barreira: compare ignora histórico até se um chamador interno o fornecer.
  const messages = [{ role: 'system', content: generationSystem(input.mode) },
    { role: 'user', content: JSON.stringify(providerInput) }];
  if (['cook', 'ready'].includes(input.mode) && typeof historyContext === 'string' && historyContext) {
    messages.push({ role: 'user', content: historyContext });
  }
  return completeWithGroq({ model: MODEL, stream: false, reasoning_effort: 'low', max_completion_tokens: 4096,
    messages,
    response_format: { type: 'json_schema', json_schema: { name: `meal_${input.mode}_v1`, strict: true, schema: outputSchema(input.mode) } },
  }, content => validateGenerationOutput(JSON.parse(content), input), providerOptions);
}
