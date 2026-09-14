// Transporte exclusivamente simulado. Nenhuma URL, chave ou API real é acessada.
export async function videoMockResponse(query, scenario = 'normal') {
  if (scenario === 'timeout') return new Promise(() => {});
  if (scenario === 'network') throw new Error('Falha privada de transporte.');
  if (scenario === 'slow') await new Promise(resolve => setTimeout(resolve, 60));
  if (scenario === 'empty') return Response.json({ items: [] });
  if (scenario === 'invalid') return new Response('{');
  if (scenario === 'extra') return Response.json({ items: [], extra: true });
  if (scenario === 'large') return new Response(' '.repeat(16385));
  if (scenario === 'quota') return Response.json({ error: { code: 403, message: 'Quota esgotada.',
    errors: [{ domain: 'youtube.quota', reason: 'quotaExceeded', message: 'Quota esgotada.' }] } }, { status: 403 });
  if (['403', '429', '503'].includes(scenario)) return new Response(null, { status: Number(scenario) });
  return Response.json({ items: [{ id: { kind: 'youtube#video', videoId: 'v'.repeat(11) },
    snippet: { title: 'Como fazer ' + query, channelId: 'UC' + 'c'.repeat(22), channelTitle: 'Canal de teste' } }] });
}
