// Shim exclusivo do runtime local: a rota publicada não lê estes headers.
import { createVideoHandler } from '../../src/http/video.js';
import { videoMockResponse } from '../../tests/helpers/video-response.js';

export async function videoRuntimeHandler(request, baseEnv) {
  const env = { ...baseEnv };
  const fault = request.headers.get('X-Test-Video-Db');
  if (fault) {
    const db = env.DB;
    // Sem withSession somente neste injetor de falha; cenários normais usam D1 real.
    env.DB = { prepare(sql) {
      if (fault === 'cache' && sql.includes('video_cache')) throw new Error('Falha SQL privada.');
      if (fault === 'plan' && sql.includes('FROM plans')) throw new Error('Falha SQL privada.');
      return db.prepare(sql);
    }, batch(statements) { return db.batch(statements); } };
  }
  const scenario = request.headers.get('X-Test-Video') ?? 'normal';
  const instant = Number(request.headers.get('X-Test-Video-Time'));
  const handler = createVideoHandler({ clock: () => instant,
    timeoutMs: scenario === 'timeout' ? 10 : 5000,
    fetchImpl: async (address, init) => {
      const url = new URL(address);
      const allowed = ['part', 'type', 'videoEmbeddable', 'videoSyndicated', 'relevanceLanguage', 'regionCode',
        'safeSearch', 'order', 'maxResults', 'fields', 'q'];
      if (url.origin !== 'https://www.googleapis.com' || url.pathname !== '/youtube/v3/search'
          || [...url.searchParams.keys()].some(key => !allowed.includes(key))
          || init.headers['X-Goog-Api-Key'] !== 'YOUTUBE_API_KEY') throw new Error('Transporte simulado inesperado.');
      await baseEnv.DB.prepare('INSERT INTO test_video_calls(query) VALUES (?1)').bind(url.searchParams.get('q')).run();
      return videoMockResponse(url.searchParams.get('q'), scenario);
    } });
  return handler({ request, env });
}
