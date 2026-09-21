import { pathToFileURL } from 'node:url';
import { technicalCategory } from '../src/providers/groq-client.js';

// GET de metadados, sem inferência, sem repetição e sem seguir redirects.
export async function probe({ apiKey, fetchImpl = fetch } = {}) {
  if (typeof apiKey !== 'string' || !apiKey.trim()) return { code: 'MISSING_API_KEY' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  let phase = 'fetch', status = null;
  try {
    const response = await fetchImpl('https://api.groq.com/openai/v1/models', {
      method: 'GET', redirect: 'error', signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey.trim()}` },
    });
    status = response.status;
    phase = 'response_body';
    await response.body?.cancel();
    return { code: status === 200 ? 'OK' : [401, 403].includes(status) ? 'AUTH_ERROR' : 'HTTP_ERROR', http_status: status };
  } catch (error) {
    return { code: controller.signal.aborted ? 'TIMEOUT' : phase === 'fetch' ? 'NETWORK_ERROR' : 'RESPONSE_READ_ERROR',
      http_status: status, diagnostic: technicalCategory(error, phase) };
  } finally { clearTimeout(timer); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !['--invalid-key', '--env-key'].includes(args[0])) {
    console.error('Use --invalid-key ou --env-key (GROQ_API_KEY no ambiente).');
    process.exitCode = 1;
  } else {
    const result = await probe({ apiKey: args[0] === '--invalid-key' ? 'deliberately-invalid-probe-key' : process.env.GROQ_API_KEY });
    console.log(JSON.stringify({ runtime: 'node', ...result }));
    process.exitCode = result.code === 'OK' || (args[0] === '--invalid-key' && result.code === 'AUTH_ERROR') ? 0 : 1;
  }
}
