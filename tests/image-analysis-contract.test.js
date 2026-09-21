import test from 'node:test';
import assert from 'node:assert/strict';
import {
  IMAGE_LIMITS, ImageContractError, validateImageAnalysisOutput as validate,
  parseImageAnalysisOutput as parse, mergeConfirmedIngredients as merge,
  validateImageFilePreflight as preflight,
} from '../src/contracts/image-analysis.js';
import { validateGenerationInput } from '../src/contracts/generation.js';

const recognized = ingredients => ({ version: 1, status: 'recognized', ingredients });
const items = count => Array.from({ length: count }, (_, i) => `ingrediente ${i}`);
const throwsCode = (fn, code) => assert.throws(fn,
  error => error instanceof ImageContractError && error.code === code);

test('visão: aceita os três estados e devolve cópia normalizada', () => {
  const raw = recognized([' arroz ', 'maça\u0303']);
  assert.deepEqual(validate(raw), recognized(['arroz', 'maçã']));
  assert.deepEqual(raw.ingredients, [' arroz ', 'maça\u0303']);
  for (const status of ['no_ingredients', 'unreadable']) {
    assert.deepEqual(validate({ version: 1, status, ingredients: [] }),
      { version: 1, status, ingredients: [] });
  }
});

test('visão: rejeita propriedades extras, ausentes, herdadas e tipos incorretos', () => {
  const valid = recognized(['ovo']);
  for (const raw of [null, [], 'json', {}, Object.create(valid),
    { ...valid, version: '1' }, { ...valid, version: 2 },
    { ...valid, status: 'success' }, { ...valid, ingredients: undefined },
    { ...valid, confidence: 0.99 }, { ...valid, model: 'inventado' }]) {
    throwsCode(() => validate(raw), 'VISION_INVALID_RESPONSE');
  }
  for (const key of Object.keys(valid)) {
    const raw = { ...valid }; delete raw[key];
    assert.throws(() => validate(raw), ImageContractError);
  }
});

test('visão: estados vazios não aceitam alimentos e recognized não aceita vazio', () => {
  assert.throws(() => validate(recognized([])), ImageContractError);
  for (const status of ['no_ingredients', 'unreadable']) {
    assert.throws(() => validate({ version: 1, status, ingredients: ['ovo'] }), ImageContractError);
  }
});

test('visão: limita quantidade, texto Unicode e rejeita itens inválidos/duplicados', () => {
  assert.equal(validate(recognized(items(40))).ingredients.length, 40);
  assert.equal(validate(recognized(['🥕'.repeat(80)])).ingredients.length, 1);
  for (const ingredients of [items(41), ['a'.repeat(81)], ['🥕'.repeat(81)], [' '],
    [null], [1], [{}], new Array(1), ['ovo', ' OVO '], ['maçã', 'maça\u0303'], 'ovo']) {
    assert.throws(() => validate(recognized(ingredients)), ImageContractError);
  }
});

test('visão: parser aceita somente JSON puro e sanitiza erros', () => {
  const data = recognized(['arroz']);
  assert.deepEqual(parse(JSON.stringify(data)), data);
  for (const content of [undefined, null, {}, 'null', '[]', '', '{',
    '```json\n' + JSON.stringify(data) + '\n```', '{ segredo: "nao-expor" }']) {
    assert.throws(() => parse(content), error =>
      error.code === 'VISION_INVALID_RESPONSE' && !error.message.includes('nao-expor'));
  }
});

test('visão: parser aplica limite em bytes UTF-8, não só caracteres', () => {
  const json = JSON.stringify(recognized(['arroz']));
  assert.deepEqual(parse(json + ' '.repeat(IMAGE_LIMITS.responseBytes - json.length)), recognized(['arroz']));
  throwsCode(() => parse(json + ' '.repeat(IMAGE_LIMITS.responseBytes - json.length + 1)), 'VISION_INVALID_RESPONSE');
  const multibyte = JSON.stringify(recognized(['é'.repeat(17_000)]));
  assert.ok(multibyte.length < IMAGE_LIMITS.responseBytes);
  assert.throws(() => parse(multibyte), /limite de bytes/);
});

test('mescla: preserva ordem e nomes existentes sem alterar as listas originais', () => {
  const previous = Object.freeze([' Arroz ', 'maçã']);
  const confirmed = Object.freeze(['ARROZ', 'maça\u0303', 'ovo']);
  assert.deepEqual(merge(previous, confirmed), ['Arroz', 'maçã', 'ovo']);
  assert.deepEqual(previous, [' Arroz ', 'maçã']);
  assert.deepEqual(confirmed, ['ARROZ', 'maça\u0303', 'ovo']);
  assert.deepEqual(merge(['arroz', 'ARROZ'], []), ['arroz']);
  assert.deepEqual(merge(['tomate'], ['tomate-cereja']), ['tomate', 'tomate-cereja']);
});

test('mescla: vazio preserva lista e excesso falha sem truncar/modificar rascunho', () => {
  const previous = items(40);
  assert.deepEqual(merge(previous, []), previous);
  assert.deepEqual(merge(previous, [previous[0]]), previous);
  throwsCode(() => merge(previous, ['extra']), 'INGREDIENT_LIMIT_REACHED');
  assert.deepEqual(previous, items(40));
  assert.deepEqual(merge([], []), []);
  for (const invalid of [null, 'ovo', [''], new Array(1), items(41)]) {
    assert.throws(() => merge(invalid, []), ImageContractError);
    assert.throws(() => merge([], invalid), ImageContractError);
  }
});

test('mescla: lista confirmada encaixa no contrato de refeições existente', () => {
  const ingredients = merge(['ovo'], validate(recognized(['arroz'])).ingredients);
  const input = { mode: 'cook', meal: 'jantar', people: 2, time_minutes: 30,
    ingredient_policy: 'only_available', ingredients };
  assert.deepEqual(validateGenerationInput(input).ingredients, ['ovo', 'arroz']);
  assert.throws(() => validateGenerationInput({ ...input, ingredient_policy: 'suggest' }));
});

test('pré-verificação: aceita MIME permitido e tamanho no limite, sem ler conteúdo', () => {
  for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
    const blob = new Blob(['bytes fictícios'], { type });
    assert.deepEqual(preflight(blob), { size: blob.size, type });
  }
  const boundary = new Blob([new Uint8Array(IMAGE_LIMITS.fileBytes)], { type: 'image/jpeg' });
  assert.equal(preflight(boundary).size, IMAGE_LIMITS.fileBytes);
  // Intencional: a pré-verificação NÃO identifica imagem falsa/corrompida.
  // Assinatura também será conferida; integridade completa fica com o provedor.
});

test('pré-verificação: rejeita arquivo vazio, tipos não aceitos e excesso de bytes', () => {
  for (const file of [null, 'https://example.com/foto.jpg', { size: 1, type: 'image/jpeg' }, new Blob([])]) {
    throwsCode(() => preflight(file), 'IMAGE_INVALID');
  }
  for (const type of ['', 'image/gif', 'image/svg+xml', 'image/heic', 'text/plain']) {
    throwsCode(() => preflight(new Blob(['x'], { type })), 'IMAGE_UNSUPPORTED');
  }
  const large = new Blob([new Uint8Array(IMAGE_LIMITS.fileBytes + 1)], { type: 'image/png' });
  throwsCode(() => preflight(large), 'IMAGE_TOO_LARGE');
});
