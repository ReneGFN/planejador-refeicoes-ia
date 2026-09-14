import test from 'node:test';
import assert from 'node:assert/strict';
import { ContractError } from '../src/contracts/generation.js';
import { VIDEO_LIMITS, validateVideoInput, validateVideoOutput,
  validateYouTubeSearchResponse, validateYouTubeError } from '../src/contracts/video.js';

// Identificadores sintéticos: não apontam para vídeos verificados ou consultados.
const candidate = (title = 'Como preparar risoto de frango', letter = 'v') => ({
  id: { kind: 'youtube#video', videoId: letter.repeat(11) },
  snippet: { title, channelId: 'UC' + 'c'.repeat(22), channelTitle: 'Canal de demonstração' },
});
const input = { title: 'Risoto de frango' };
const parse = items => validateYouTubeSearchResponse({ items }, input);

test('vídeo contrato: título normaliza espaços, caixa e NFC sem remover palavras/acentos', () => {
  assert.deepEqual(validateVideoInput({ title: '  PIRA\u0303O \t de\n Peixe  ' }), { title: 'pirão de peixe' });
  assert.deepEqual(validateVideoInput({ title: 'Pão-de-ló' }), { title: 'pão-de-ló' });
  assert.deepEqual(validateVideoInput({ title: 'Sopa d’água' }), { title: 'sopa d’água' });
  assert.deepEqual(validateVideoInput({ title: 'a'.repeat(100) }), { title: 'a'.repeat(100) });
  const original = { title: '  Arroz  ' }; validateVideoInput(original);
  assert.equal(original.title, '  Arroz  ');
});

test('vídeo contrato: entrada fechada e títulos inválidos não são truncados ou consertados', () => {
  for (const raw of [null, [], {}, { title: 'arroz', ingredients: [] }, { title: 'arroz', visitor_id: 'outro' },
    { title: 3 }, { title: '' }, { title: ' '.repeat(401) }, { title: 'a'.repeat(101) },
    ...['arroz | pizza', 'arroz -carne', '-arroz', 'https://exemplo.com', 'nome@exemplo.com',
      'arroz\u0000', 'arroz\u200b', 'arroz\u202e', '123', '<arroz>', 'arroz & sal', 'arroz 😀', 'arroz "frito"']
      .map(title => ({ title })), Object.assign(new Date(), input)]) {
    assert.throws(() => validateVideoInput(raw), ContractError);
  }
});

test('vídeo contrato: seleção segue ordem recebida entre candidatos com o nome completo', () => {
  const result = parse([candidate('Bolo de cenoura', 'a'), candidate('RISOTO DE FRANGO: passo a passo', 'b'),
    candidate('Risoto de frango fácil', 'c')]);
  assert.deepEqual(result, { version: 1, status: 'found', video: { id: 'b'.repeat(11),
    title: 'RISOTO DE FRANGO: passo a passo', channel_id: 'UC' + 'c'.repeat(22), channel_title: 'Canal de demonstração' } });
});

test('vídeo contrato: ausência e falta de correspondência lexical são resultados válidos', () => {
  for (const items of [[], [candidate('Risoto de camarão')], [candidate('Frango de risoto')],
    [candidate('Risoto de frangos')], [candidate('Risoto fácil de frango')]]) {
    assert.deepEqual(parse(items), { version: 1, status: 'not_found', video: null });
  }
  assert.equal(validateYouTubeSearchResponse({ items: [candidate('Pirao de peixe')] },
    { title: 'Pirão de peixe' }).status, 'not_found');
});

test('vídeo contrato: título do autor permanece texto, sem tradução ou interpretação de HTML', () => {
  const original = candidate('Risoto de frango &amp; outras receitas');
  original.snippet.channelTitle = '<Canal de teste>';
  const result = parse([original]);
  assert.equal(result.video.title, original.snippet.title);
  assert.equal(result.video.channel_title, original.snippet.channelTitle);
});

test('vídeo contrato: rejeita campos extras em cada nível, inclusive após candidato aceito', () => {
  const mutations = [raw => { raw.nextPageToken = 'não usar'; },
    raw => { raw.items[0].extra = true; }, raw => { raw.items[0].id.extra = true; },
    raw => { raw.items[0].snippet.description = 'não guardar'; },
    raw => { raw.items[1].snippet.extra = true; }];
  for (const mutate of mutations) {
    const raw = { items: [candidate(), candidate()] }; mutate(raw);
    assert.throws(() => validateYouTubeSearchResponse(raw, input), ContractError);
  }
});

test('vídeo contrato: valida todos os campos e teto da resposta externa', () => {
  const mutations = [raw => { delete raw.items; }, raw => { raw.items = {}; },
    raw => { raw.items = Array.from({ length: VIDEO_LIMITS.candidates + 1 }, () => candidate()); },
    raw => { raw.items = new Array(1); }, raw => { raw.items[0].id.kind = 'youtube#channel'; },
    raw => { raw.items[0].id.videoId = '../endereco'; }, raw => { raw.items[0].snippet.channelId = 'inválido'; },
    raw => { raw.items[0].snippet.title = ''; }, raw => { raw.items[0].snippet.title = 'a'.repeat(201); },
    raw => { raw.items[0].snippet.channelTitle = 'a'.repeat(101); },
    raw => { raw.items[0].snippet.channelTitle = 'Canal\u0000'; },
    raw => { delete raw.items[0].snippet.channelTitle; }];
  for (const mutate of mutations) {
    const raw = { items: [candidate()] }; mutate(raw);
    assert.throws(() => validateYouTubeSearchResponse(raw, input), ContractError);
  }
});

test('vídeo contrato: saída fechada e estados coerentes sem vídeo inventado', () => {
  const found = parse([candidate()]);
  assert.deepEqual(validateVideoOutput(found), found);
  for (const raw of [null, { ...found, extra: true }, { ...found, version: 2 },
    { ...found, status: 'approved' }, { ...found, video: null }, { ...found, status: 'not_found' },
    { ...found, video: { ...found.video, verified: true } }, { version: 1, status: 'not_found' }]) {
    assert.throws(() => validateVideoOutput(raw), ContractError);
  }
});

test('vídeo contrato: erro externo tem esquema fechado e retorna somente classificação', () => {
  const raw = { error: { code: 403, message: 'mensagem que não sai',
    errors: [{ domain: 'youtube.quota', reason: 'quotaExceeded', message: 'mensagem que não sai' }] } };
  assert.equal(validateYouTubeError(raw, 403), 'quota_exceeded');
  raw.error.errors[0].reason = 'userRateLimitExceeded';
  assert.equal(validateYouTubeError(raw, 403), 'rate_limited');
  raw.error.errors[0].reason = 'forbidden';
  assert.equal(validateYouTubeError(raw, 403), 'unclassified');
  assert.throws(() => validateYouTubeError(raw, 401), ContractError);
  raw.error.details = [];
  assert.throws(() => validateYouTubeError(raw, 403), ContractError);
});
