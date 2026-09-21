import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');

function serviceWorkerHarness() {
  const listeners = new Map(), stored = new Map();
  let fetches = 0, networkBytes = 0, releaseOpen;
  const openGate = new Promise(resolve => { releaseOpen = resolve; });
  const key = request => typeof request === 'string' ? request : new URL(request.url).pathname;
  const cache = {
    async put(request, response) { stored.set(key(request), response); },
    async addAll() {},
  };
  const caches = {
    async match(request) { const response = stored.get(key(request)); return response?.clone(); },
    async open() { await openGate; return cache; },
    async keys() { return []; },
    async delete() { return true; },
  };
  const fetch = async request => {
    fetches++;
    const body = `conteúdo de ${new URL(request.url).pathname}`;
    networkBytes += new TextEncoder().encode(body).byteLength;
    return new Response(body, { status: 200 });
  };
  const self = { addEventListener(type, listener) { listeners.set(type, listener); }, skipWaiting() {}, clients: { claim() {} } };
  vm.runInNewContext(source, { self, caches, fetch, location: { origin: 'https://app.test' }, URL, Response });

  async function request(path, mode = 'cors') {
    let responsePromise;
    const lifetime = [];
    const event = {
      request: { url: `https://app.test${path}`, method: 'GET', mode },
      respondWith(value) { responsePromise = Promise.resolve(value); },
      waitUntil(value) { lifetime.push(Promise.resolve(value)); },
    };
    listeners.get('fetch')(event);
    const response = await responsePromise;
    const body = await response.text();
    return { body, finish: () => Promise.all(lifetime) };
  }

  return { request, releaseOpen, metrics: () => ({ fetches, networkBytes }) };
}

test('service worker clona o shell antes de devolver o corpo e aguarda a gravação', async () => {
  const worker = serviceWorkerHarness();
  const first = await worker.request('/app.js');
  assert.equal(first.body, 'conteúdo de /app.js');
  assert.deepEqual(worker.metrics(), { fetches: 1, networkBytes: 20 });

  worker.releaseOpen();
  await first.finish();
  const afterFirst = worker.metrics();
  const second = await worker.request('/app.js');
  await second.finish();

  assert.equal(second.body, first.body);
  assert.deepEqual(worker.metrics(), afterFirst, 'o segundo carregamento não transfere bytes da rede');
});

test('service worker também prende a atualização da navegação ao evento', async () => {
  const worker = serviceWorkerHarness();
  const navigation = await worker.request('/#pedido', 'navigate');
  assert.equal(navigation.body, 'conteúdo de /');
  worker.releaseOpen();
  await navigation.finish();
  assert.deepEqual(worker.metrics(), { fetches: 1, networkBytes: 14 });
});
