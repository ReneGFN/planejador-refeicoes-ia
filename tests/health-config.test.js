import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { onRequestGet } from '../functions/api/health.js';
import { apiConfigured, apiConfigurationReason, createApiHandlers } from '../src/http/api.js';

// Valores exclusivamente sintéticos; não são cotas recomendadas para a demo.
function environment() {
  const common = { visitorDay: 3, visitorMinute: 1, networkDay: 3, networkMinute: 1,
    globalDay: 3, globalMinute: 1, reserveTokens: 4096, dayTokens: 12288, minuteTokens: 4096 };
  const technical = { ...common, reserveTokens: 0, dayTokens: 0, minuteTokens: 0 };
  return { AI_ENABLED: 'true', SESSIONS_ENABLED: 'true', VISION_ENABLED: 'true',
    SESSION_SECRET: randomUUID(), IP_HASH_SECRET: randomUUID(), GROQ_API_KEY: randomUUID(),
    QUOTA_POLICY_JSON: JSON.stringify({ generation: common, vision: common, ingress: technical, session: technical }),
    DB: { prepare() { assert.fail('Health não deve consultar D1.'); }, batch() { assert.fail('Health não deve gravar D1.'); } } };
}
const cases = {
  ok: env => env,
  flag_off: env => ({ ...env, SESSIONS_ENABLED: 'false' }),
  policy_empty: env => ({ ...env, QUOTA_POLICY_JSON: '{}' }),
  policy_invalid: env => ({ ...env, QUOTA_POLICY_JSON: '{' }),
  secret_missing: env => ({ ...env, SESSION_SECRET: undefined }),
  secret_invalid: env => ({ ...env, SESSION_SECRET: true }),
  db_unbound: env => ({ ...env, DB: undefined }),
  config_error: env => Object.defineProperty(env, 'DB', { get() { throw new Error('Detalhe interno não publicável.'); } }),
};
for (const [reason, change] of Object.entries(cases)) {
  test(`health: motivo isolado ${reason} para cada operação, sem dados internos`, async () => {
    const env = change(environment());
    const response = onRequestGet({ env });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    const data = await response.json();
    assert.deepEqual(data, { status: 'ok', stage: 'backend', generationAvailable: reason === 'ok',
      visionAvailable: reason === 'ok', sessionsAvailable: reason === 'ok',
      reasons: { generation: reason, vision: reason, session: reason } });
    for (const operation of ['generation', 'vision', 'session']) {
      assert.equal(apiConfigurationReason(env, operation), reason);
      assert.equal(apiConfigured(env, operation), reason === 'ok');
    }
  });
}

test('health: flags são independentes e exigem a string true', async () => {
  for (const value of ['false', undefined, true, 'TRUE', '']) {
    const env = environment(); env.VISION_ENABLED = value;
    assert.deepEqual((await onRequestGet({ env }).json()).reasons, { generation: 'ok', vision: 'flag_off', session: 'ok' });
    env.AI_ENABLED = value;
    assert.deepEqual((await onRequestGet({ env }).json()).reasons, { generation: 'flag_off', vision: 'flag_off', session: 'ok' });
    env.SESSIONS_ENABLED = value;
    assert.deepEqual((await onRequestGet({ env }).json()).reasons, { generation: 'flag_off', vision: 'flag_off', session: 'flag_off' });
  }
});

test('health: política ausente/vazia é diferente de malformada ou incompleta', () => {
  for (const policy of [undefined, null, '', '  ', '{}', '{ \n }']) {
    assert.equal(apiConfigurationReason({ ...environment(), QUOTA_POLICY_JSON: policy }, 'generation'), 'policy_empty');
  }
  for (const policy of ['null', '[]', 'false', '1', '"texto"', '{}'.repeat(3000), true, '{"generation":{}}']) {
    assert.equal(apiConfigurationReason({ ...environment(), QUOTA_POLICY_JSON: policy }, 'generation'), 'policy_invalid');
  }
});

test('health: valida operação e ingress, sem exigir política de outra operação', async () => {
  for (const removed of ['generation', 'vision', 'session', 'ingress']) {
    const env = environment(), policy = JSON.parse(env.QUOTA_POLICY_JSON);
    delete policy[removed]; env.QUOTA_POLICY_JSON = JSON.stringify(policy);
    assert.deepEqual((await onRequestGet({ env }).json()).reasons, {
      generation: ['generation', 'ingress'].includes(removed) ? 'policy_invalid' : 'ok',
      vision: ['vision', 'ingress'].includes(removed) ? 'policy_invalid' : 'ok',
      session: removed === 'session' ? 'policy_invalid' : 'ok',
    });
  }
  const env = environment(), policy = JSON.parse(env.QUOTA_POLICY_JSON);
  policy.generation.visitorDay = 5; env.QUOTA_POLICY_JSON = JSON.stringify(policy);
  assert.equal(apiConfigurationReason(env, 'generation'), 'policy_invalid');
});

test('health: segredos ausentes e inválidos, sem revelar qual ou seu valor', () => {
  for (const field of ['SESSION_SECRET', 'IP_HASH_SECRET', 'GROQ_API_KEY']) {
    for (const value of [undefined, null, '', '   ']) {
      const env = { ...environment(), [field]: value };
      assert.equal(apiConfigurationReason(env, 'generation'), 'secret_missing');
      if (field === 'GROQ_API_KEY') assert.equal(apiConfigurationReason(env, 'session'), 'ok');
    }
    for (const value of [true, 10, {}, []]) {
      assert.equal(apiConfigurationReason({ ...environment(), [field]: value }, 'generation'), 'secret_invalid');
    }
  }
  for (const field of ['SESSION_SECRET', 'IP_HASH_SECRET']) {
    for (const length of [31, 1025]) {
      const value = Array.from({ length }, () => 'x').join('');
      assert.equal(apiConfigurationReason({ ...environment(), [field]: value }, 'generation'), 'secret_invalid');
    }
    for (const length of [32, 1024]) {
      const value = Array.from({ length }, () => 'x').join('');
      assert.equal(apiConfigurationReason({ ...environment(), [field]: value }, 'generation'), 'ok');
    }
  }
});

test('health: binding ausente ou com interface incompleta, sem chamar seus métodos', () => {
  for (const DB of [null, {}, { prepare() {} }, { batch() {} }, { prepare: true, batch() {} }]) {
    assert.equal(apiConfigurationReason({ ...environment(), DB }, 'generation'), 'db_unbound');
  }
  assert.equal(apiConfigurationReason(environment(), 'generation'), 'ok');
});

test('health: precedência previsível e estado padrão continua desligado', async () => {
  const env = { SESSIONS_ENABLED: 'false', AI_ENABLED: 'true' };
  assert.equal(apiConfigurationReason(env, 'generation'), 'flag_off');
  env.SESSIONS_ENABLED = 'true';
  assert.equal(apiConfigurationReason(env, 'generation'), 'policy_empty');
  env.QUOTA_POLICY_JSON = '{';
  assert.equal(apiConfigurationReason(env, 'generation'), 'policy_invalid');
  env.QUOTA_POLICY_JSON = environment().QUOTA_POLICY_JSON;
  assert.equal(apiConfigurationReason(env, 'generation'), 'secret_missing');
  Object.assign(env, { SESSION_SECRET: true });
  assert.equal(apiConfigurationReason(env, 'generation'), 'secret_invalid');
  for (const field of ['SESSION_SECRET', 'IP_HASH_SECRET', 'GROQ_API_KEY']) env[field] = randomUUID();
  assert.equal(apiConfigurationReason(env, 'generation'), 'db_unbound');
  env.DB = environment().DB;
  assert.equal(apiConfigurationReason(env, 'generation'), 'ok');
  assert.equal(apiConfigurationReason(env, 'operação inexistente'), 'config_error');
  assert.deepEqual((await onRequestGet().json()).reasons, { generation: 'flag_off', vision: 'flag_off', session: 'flag_off' });
});

test('health: exceções inesperadas nunca são refletidas na resposta', async () => {
  const detail = randomUUID();
  const env = Object.defineProperty(environment(), 'QUOTA_POLICY_JSON', { get() { throw new Error(detail); } });
  const response = await onRequestGet({ env }).text();
  assert.ok(!response.includes(detail));
  assert.deepEqual(JSON.parse(response).reasons, { generation: 'config_error', vision: 'config_error', session: 'config_error' });
});

test('configuração inválida nas rotas mantém 503 sanitizado e não chama provedor', async () => {
  const handlers = createApiHandlers({ fetchImpl() { assert.fail('Configuração inválida não pode iniciar IA.'); } });
  for (const reason of ['policy_empty', 'policy_invalid', 'secret_missing', 'secret_invalid', 'db_unbound', 'config_error']) {
    for (const handler of [handlers.session, handlers.generate, handlers.analyze]) {
      const env = cases[reason](environment());
      const request = new Request('https://local.test/api/generate', { method: 'POST', headers: { Origin: 'https://local.test' } });
      const response = await handler({ request, env });
      assert.equal(response.status, 503);
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
      assert.deepEqual(await response.json(), { code: 'SERVICE_UNAVAILABLE', message: 'O serviço está temporariamente indisponível.', quotaReserved: false });
    }
  }
});
