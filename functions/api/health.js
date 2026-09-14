import { apiConfigurationReason } from '../../src/http/api.js';
export function onRequestGet({ env } = {}) {
  const reasons = { generation: apiConfigurationReason(env, 'generation'),
    vision: apiConfigurationReason(env, 'vision'), session: apiConfigurationReason(env, 'session') };
  return Response.json(
    { status: "ok", stage: "backend", generationAvailable: reasons.generation === 'ok',
      visionAvailable: reasons.vision === 'ok', sessionsAvailable: reasons.session === 'ok', reasons },
    { headers: { "Cache-Control": "no-store" } },
  );
}
