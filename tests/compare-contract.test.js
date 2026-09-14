import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { validateGenerationInput as input, validateGenerationOutput as output,
  validateCookingConstraints, EQUIPMENT_CHOICES, UNIT_CHOICES, ContractError } from '../src/contracts/generation.js';
import { generateWithGroq, MODEL } from '../src/providers/groq.js';

const request = (patch = {}) => ({ mode: 'compare', meal: 'jantar', people: 2,
  time_minutes: 30, ingredient_policy: 'suggest', ingredients: [], ...patch });
const recipe = () => ({ title: 'Banana ao natural', servings: 2, total_minutes: 2,
  ingredients: [{ name: 'banana', quantity: 2, unit: 'unit' }], steps: ['Descasque e sirva.'] });
const ready = () => ({ title: 'Prato de legumes', description: 'Uma opção para buscar.',
  search_term: 'prato de legumes', servings: 2 });
const suggested = item => ({ status: 'suggested', suggestions: [item] });
const unavailable = () => ({ status: 'not_suggested', reason: 'Não foi encontrada uma opção compatível com este pedido.' });
const result = () => ({ version: 1, mode: 'compare', cook: suggested(recipe()), ready: suggested(ready()) });
const rejectAt = (fn, path) => assert.throws(fn, error => error instanceof ContractError && error.path === path);
const outputPatch = (side, patch) => {
  const raw = result(); Object.assign(raw[side].suggestions[0], patch); return raw;
};

test('compare: entrada mínima, opcionais ausentes, cópias e normalização', () => {
  const raw = request({ meal: ' jantar ', ingredients: [' banana '], ingredient_policy: 'only_available',
    preferences: ' simples ', equipment: ['fogao'], avoid_equipment: ['forno'], max_dishes: 2 });
  const snapshot = structuredClone(raw), data = input(raw);
  assert.equal(data.meal, 'jantar'); assert.equal(data.preferences, 'simples');
  assert.deepEqual(data.ingredients, ['banana']);
  assert.deepEqual(raw, snapshot);
  assert.notEqual(data.ingredients, raw.ingredients);
  assert.notEqual(data.equipment, raw.equipment);
  assert.notEqual(data.avoid_equipment, raw.avoid_equipment);
  const minimal = input(request());
  for (const field of ['hourly_rate_brl', 'budget_brl', 'preferences', 'equipment', 'avoid_equipment', 'max_dishes']) {
    assert.equal(Object.hasOwn(minimal, field), false);
  }
});

test('compare: obrigatórios, tipos e campos desconhecidos de entrada', () => {
  for (const field of ['meal', 'people', 'time_minutes', 'ingredients', 'ingredient_policy']) {
    const raw = request(); delete raw[field]; rejectAt(() => input(raw), `input.${field}`);
  }
  for (const mode of [undefined, null, '', 'COMPARE', 'outro']) rejectAt(() => input(request({ mode })), 'input.mode');
  for (const field of ['cook', 'ready', 'estimated_price_brl', 'restaurant', 'extra']) {
    rejectAt(() => input(request({ [field]: true })), `input.${field}`);
  }
  for (const meal of ['', ' ', 'a'.repeat(81), null, 1, {}]) rejectAt(() => input(request({ meal })), 'input.meal');
  assert.equal(input(request({ meal: 'a'.repeat(80) })).meal.length, 80);
});

test('compare: pessoas, tempo e limites válidos e inválidos', () => {
  for (const people of [1, 20]) assert.equal(input(request({ people })).people, people);
  for (const people of [0, 21, 1.1, '2', null, NaN, Infinity, true]) rejectAt(() => input(request({ people })), 'input.people');
  for (const time_minutes of [1, 240]) assert.equal(input(request({ time_minutes })).time_minutes, time_minutes);
  for (const time_minutes of [0, 241, 1.1, '2', null, NaN, Infinity]) {
    rejectAt(() => input(request({ time_minutes })), 'input.time_minutes');
  }
});

test('compare: políticas e lista de ingredientes seguem cook', () => {
  for (const ingredient_policy of ['only_available', 'can_buy_missing']) {
    assert.deepEqual(input(request({ ingredient_policy, ingredients: ['banana'] })).ingredients, ['banana']);
    rejectAt(() => input(request({ ingredient_policy })), 'input.ingredients');
  }
  for (const ingredient_policy of [null, 'SUGGEST', 'outra', false]) {
    rejectAt(() => input(request({ ingredient_policy })), 'input.ingredient_policy');
  }
  rejectAt(() => input(request({ ingredients: ['banana'] })), 'input.ingredients');
  for (const ingredients of [null, 'banana', {}, Array(41).fill('banana')]) {
    rejectAt(() => input(request({ ingredients })), 'input.ingredients');
  }
  for (const item of ['', ' ', null, 1, 'a'.repeat(81)]) {
    rejectAt(() => input(request({ ingredient_policy: 'only_available', ingredients: [item] })), 'input.ingredients.0');
  }
  rejectAt(() => input(request({ ingredient_policy: 'only_available', ingredients: ['banana', ' BANANA '] })), 'input.ingredients');
  assert.equal(input(request({ ingredient_policy: 'can_buy_missing', ingredients: Array.from({ length: 40 }, (_, i) => `item ${i}`) })).ingredients.length, 40);
});

test('compare: orçamento e preferências preservam regras anteriores', () => {
  for (const budget_brl of [0.01, 19.99, 100000]) assert.equal(input(request({ budget_brl })).budget_brl, budget_brl);
  for (const budget_brl of [0, -1, 100000.01, 1.001, '10', null, undefined, Infinity, NaN]) {
    rejectAt(() => input(request({ budget_brl })), 'input.budget_brl');
  }
  for (const preferences of ['', ' ', 'a'.repeat(401), null, undefined, 1]) {
    rejectAt(() => input(request({ preferences })), 'input.preferences');
  }
  assert.equal(input(request({ preferences: 'a'.repeat(400) })).preferences.length, 400);
});

test('compare: valor da hora opcional de zero a cem mil, centavos, sem coerção/default', () => {
  assert.equal(Object.hasOwn(input(request()), 'hourly_rate_brl'), false);
  for (const hourly_rate_brl of [0, 0.01, 19.99, 99999.99, 100000]) {
    assert.equal(input(request({ hourly_rate_brl })).hourly_rate_brl, hourly_rate_brl);
  }
  for (const hourly_rate_brl of [-0.01, 100000.01, 1.001, 0.009, '10', null, undefined, NaN, Infinity, true, {}]) {
    rejectAt(() => input(request({ hourly_rate_brl })), 'input.hourly_rate_brl');
  }
  rejectAt(() => input({ ...request({ hourly_rate_brl: 10 }), mode: 'cook' }), 'input.hourly_rate_brl');
  rejectAt(() => input({ mode: 'ready', meal: 'jantar', people: 2, hourly_rate_brl: 10 }), 'input.hourly_rate_brl');
});

test('compare: equipamento e louça reutilizam validação, inclusive omissão e zero', () => {
  const fields = { equipment: [], avoid_equipment: [], max_dishes: 0 };
  assert.deepEqual(validateCookingConstraints(input(request(fields))), fields);
  for (const field of ['equipment', 'avoid_equipment']) {
    for (const value of EQUIPMENT_CHOICES) assert.deepEqual(input(request({ [field]: [value] }))[field], [value]);
    for (const value of [null, undefined, {}, 'forno', false]) rejectAt(() => input(request({ [field]: value })), `input.${field}`);
    for (const value of ['FORNO', ' forno ', 'fogão', null, 1]) rejectAt(() => input(request({ [field]: [value] })), `input.${field}.0`);
    rejectAt(() => input(request({ [field]: ['forno', 'forno'] })), `input.${field}.1`);
    rejectAt(() => input(request({ [field]: new Array(1) })), `input.${field}.0`);
    rejectAt(() => input(request({ [field]: Array(6).fill('forno') })), `input.${field}`);
  }
  rejectAt(() => input(request({ equipment: ['forno'], avoid_equipment: ['forno'] })), 'input.avoid_equipment.0');
  for (const max_dishes of [0, 20]) assert.equal(input(request({ max_dishes })).max_dishes, max_dishes);
  for (const max_dishes of [-1, 21, 1.5, null, undefined, '2', Infinity, NaN]) rejectAt(() => input(request({ max_dishes })), 'input.max_dishes');
});

test('compare: desenho A aceita ambos, um ou nenhum lado sugerido, sem lista fictícia', () => {
  for (const cookAvailable of [false, true]) for (const readyAvailable of [false, true]) {
    const raw = result();
    if (!cookAvailable) raw.cook = unavailable();
    if (!readyAvailable) raw.ready = unavailable();
    assert.deepEqual(output(raw, request()), raw);
  }
});

test('compare: lados obrigatórios, fechados e status exato', () => {
  for (const side of ['cook', 'ready']) {
    const raw = result(); delete raw[side]; rejectAt(() => output(raw, request()), `output.${side}`);
    for (const bad of [null, undefined, [], 'ausente']) rejectAt(() => output({ ...result(), [side]: bad }, request()), `output.${side}`);
    for (const status of [undefined, null, 'available', 'SUGGESTED', ' suggested ']) {
      rejectAt(() => output({ ...result(), [side]: { status } }, request()), `output.${side}.status`);
    }
    rejectAt(() => output({ ...result(), [side]: { ...suggested(side === 'cook' ? recipe() : ready()), extra: 1 } }, request()), `output.${side}.extra`);
  }
  for (const patch of [{ version: 2 }, { mode: 'cook' }, { suggestions: [] }, { extra: 1 }]) {
    const field = Object.keys(patch)[0]; rejectAt(() => output({ ...result(), ...patch }, request()), `output.${field}`);
  }
});

test('compare: lado sem sugestão exige motivo e proíbe sugestões mesmo vazias', () => {
  for (const side of ['cook', 'ready']) {
    for (const reason of [undefined, null, '', ' ', 1, 'a'.repeat(501)]) {
      rejectAt(() => output({ ...result(), [side]: { status: 'not_suggested', reason } }, request()), `output.${side}.reason`);
    }
    const raw = { ...result(), [side]: { status: 'not_suggested', reason: ' a ' } };
    assert.equal(output(raw, request())[side].reason, 'a');
    assert.equal(output({ ...raw, [side]: { status: 'not_suggested', reason: 'a'.repeat(500) } }, request())[side].reason.length, 500);
    assert.deepEqual(output({ ...result(), [side]: { ...unavailable(), suggestions: null } }, request())[side], unavailable());
    for (const suggestions of [[], undefined, [recipe()]]) {
      rejectAt(() => output({ ...result(), [side]: { ...unavailable(), suggestions } }, request()), `output.${side}.suggestions`);
    }
  }
});

test('compare: lado sugerido exige uma ou duas alternativas e não aceita motivo', () => {
  for (const side of ['cook', 'ready']) {
    const item = side === 'cook' ? recipe() : ready();
    for (const n of [1, 2]) {
      assert.equal(output({ ...result(), [side]: { status: 'suggested', suggestions: Array(n).fill(item) } }, request())[side].suggestions.length, n);
    }
    for (const suggestions of [undefined, null, [], Array(3).fill(item), {}]) {
      rejectAt(() => output({ ...result(), [side]: { status: 'suggested', suggestions } }, request()), `output.${side}.suggestions`);
    }
    rejectAt(() => output({ ...result(), [side]: { status: 'suggested', suggestions: new Array(1) } }, request()), `output.${side}.suggestions.0`);
    rejectAt(() => output({ ...result(), [side]: { ...suggested(item), reason: 'Sem opção.' } }, request()), `output.${side}.reason`);
  }
});

test('compare: todos os campos de receita são obrigatórios e porções/tempo herdados', () => {
  for (const field of ['title', 'servings', 'total_minutes', 'ingredients', 'steps']) {
    const raw = result(); delete raw.cook.suggestions[0][field];
    rejectAt(() => output(raw, request()), `output.cook.suggestions.0.${field}`);
  }
  for (const side of ['cook', 'ready']) for (const servings of [1, 3, '2', null, 2.1]) {
    rejectAt(() => output(outputPatch(side, { servings }), request()), `output.${side}.suggestions.0.servings`);
  }
  for (const total_minutes of [0, 31, 1.5, '2', null, Infinity]) {
    rejectAt(() => output(outputPatch('cook', { total_minutes }), request()), 'output.cook.suggestions.0.total_minutes');
  }
  assert.equal(output(outputPatch('cook', { total_minutes: 30 }), request()).cook.suggestions[0].total_minutes, 30);
});

test('compare: título, passos, ingredientes e unidades mantêm os limites da receita', () => {
  const base = 'output.cook.suggestions.0';
  for (const title of ['', ' ', 'a'.repeat(101), null]) rejectAt(() => output(outputPatch('cook', { title }), request()), `${base}.title`);
  for (const steps of [[], null, Array(21).fill('Sirva.')]) rejectAt(() => output(outputPatch('cook', { steps }), request()), `${base}.steps`);
  for (const step of ['', ' ', 'a'.repeat(601), 1]) rejectAt(() => output(outputPatch('cook', { steps: [step] }), request()), `${base}.steps.0`);
  assert.equal(output(outputPatch('cook', { steps: Array(20).fill('a'.repeat(600)) }), request()).cook.suggestions[0].steps.length, 20);
  for (const ingredients of [[], null, Array(41).fill(recipe().ingredients[0])]) {
    rejectAt(() => output(outputPatch('cook', { ingredients }), request()), `${base}.ingredients`);
  }
  for (const unit of UNIT_CHOICES) {
    const ingredient = { ...recipe().ingredients[0], unit };
    assert.equal(output(outputPatch('cook', { ingredients: [ingredient] }), request()).cook.suggestions[0].ingredients[0].unit, unit);
  }
  for (const patch of [{ unit: 'unidade' }, { unit: 'G' }, { name: '' }, { name: 'a'.repeat(81) }, { quantity: 0 },
    { quantity: 100001 }, { quantity: '2' }, { quantity: Infinity }, { extra: true }]) {
    const field = Object.keys(patch)[0];
    rejectAt(() => output(outputPatch('cook', { ingredients: [{ ...recipe().ingredients[0], ...patch }] }), request()), `${base}.ingredients.0.${field}`);
  }
});

test('compare: ready exige campos existentes e rejeita campos de dados proibidos', () => {
  for (const field of ['title', 'description', 'search_term', 'servings']) {
    const raw = result(); delete raw.ready.suggestions[0][field]; rejectAt(() => output(raw, request()), `output.ready.suggestions.0.${field}`);
  }
  for (const [field, max] of [['title', 100], ['description', 500], ['search_term', 120]]) {
    for (const value of ['', ' ', 'a'.repeat(max + 1), null, 1]) {
      rejectAt(() => output(outputPatch('ready', { [field]: value }), request()), `output.ready.suggestions.0.${field}`);
    }
    assert.equal(output(outputPatch('ready', { [field]: 'a'.repeat(max) }), request()).ready.suggestions[0][field].length, max);
  }
  for (const field of ['restaurant', 'availability', 'delivery_minutes', 'price_brl', 'calories', 'medical_advice', 'steps']) {
    rejectAt(() => output(outputPatch('ready', { [field]: 'Dado sintético.' }), request()), `output.ready.suggestions.0.${field}`);
  }
});

test('compare: preço opcional traz valor em reais e origem estimada inseparáveis', () => {
  assert.equal(Object.hasOwn(output(result(), request()).ready.suggestions[0], 'estimated_price_brl'), false);
  for (const value of [0.01, 29.99, 100000]) {
    const estimated_price_brl = { value, origin: 'estimado' };
    assert.deepEqual(output(outputPatch('ready', { estimated_price_brl }), request()).ready.suggestions[0].estimated_price_brl, estimated_price_brl);
  }
  assert.equal(Object.hasOwn(output(outputPatch('ready', { estimated_price_brl: null }), request()).ready.suggestions[0], 'estimated_price_brl'), false);
  for (const price of [20, '20', [], undefined]) {
    rejectAt(() => output(outputPatch('ready', { estimated_price_brl: price }), request()), 'output.ready.suggestions.0.estimated_price_brl');
  }
  for (const value of [undefined, null, 0, -1, 100000.01, 1.001, '20', NaN, Infinity]) {
    rejectAt(() => output(outputPatch('ready', { estimated_price_brl: { value, origin: 'estimado' } }), request()), 'output.ready.suggestions.0.estimated_price_brl.value');
  }
  for (const origin of [undefined, null, 'informado', 'calculado', 'consultado', 'ESTIMADO']) {
    rejectAt(() => output(outputPatch('ready', { estimated_price_brl: { value: 20, origin } }), request()), 'output.ready.suggestions.0.estimated_price_brl.origin');
  }
  rejectAt(() => output(outputPatch('ready', { estimated_price_brl: { value: 20, origin: 'estimado', extra: true } }), request()), 'output.ready.suggestions.0.estimated_price_brl.extra');
  rejectAt(() => output(outputPatch('cook', { estimated_price_brl: { value: 20, origin: 'estimado' } }), request()), 'output.cook.suggestions.0.estimated_price_brl');
});

test('compare: saída é copiada sem cálculo, escolha de vencedor ou validação semântica fictícia', () => {
  const raw = result(); raw.ready.suggestions[0].estimated_price_brl = { value: 29.99, origin: 'estimado' };
  // Deliberadamente incoerente: demonstra a limitação, não aprova o preparo.
  raw.cook.suggestions[0].steps = ['Deixe de molho por oito horas e use forno.'];
  const snapshot = structuredClone(raw);
  const data = output(raw, request({ hourly_rate_brl: 50, equipment: [], avoid_equipment: ['forno'], max_dishes: 0 }));
  assert.deepEqual(data, raw); assert.deepEqual(raw, snapshot);
  assert.notEqual(data.cook.suggestions[0].ingredients, raw.cook.suggestions[0].ingredients);
  assert.notEqual(data.ready.suggestions[0].estimated_price_brl, raw.ready.suggestions[0].estimated_price_brl);
  assert.deepEqual(Object.keys(data), ['version', 'mode', 'cook', 'ready']);
});

test('compare: modos isolados continuam aceitando três sugestões, rejeitando vazio e preço novo', () => {
  for (const mode of ['cook', 'ready']) {
    const req = mode === 'cook' ? { ...request(), mode } : { mode, meal: 'jantar', people: 2 };
    const item = mode === 'cook' ? recipe() : ready();
    assert.equal(output({ version: 1, mode, suggestions: Array(3).fill(item) }, req).suggestions.length, 3);
    rejectAt(() => output({ version: 1, mode, suggestions: [] }, req), 'output.suggestions');
    rejectAt(() => output({ version: 1, mode, suggestions: [{ ...item, estimated_price_brl: { value: 20, origin: 'estimado' } }] }, req), 'output.suggestions.0.estimated_price_brl');
  }
});

test('compare: sem chave ou com entrada inválida continua rejeitando antes da rede', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; assert.fail('Não chamar a rede sem chave/entrada válida.'); };
  await assert.rejects(generateWithGroq(request({ hourly_rate_brl: 29.99 }), { fetchImpl }), { code: 'MISSING_API_KEY' });
  await assert.rejects(generateWithGroq(request({ hourly_rate_brl: -1 }), { fetchImpl, apiKey: randomUUID() }),
    error => error instanceof ContractError && error.path === 'input.hourly_rate_brl');
  assert.equal(calls, 0);
});

test('compare: composição por modo não altera SYSTEM, modelo ou parâmetros enviados por cook/ready', async () => {
  for (const mode of ['cook', 'ready']) {
    const req = mode === 'cook' ? { ...request(), mode } : { mode, meal: 'jantar', people: 2 };
    let sent;
    await generateWithGroq(req, { apiKey: randomUUID(), fetchImpl: async (_, init) => {
      sent = JSON.parse(init.body);
      return Response.json({ model: MODEL, choices: [{ finish_reason: 'stop', message: {
        content: JSON.stringify({ version: 1, mode, suggestions: [mode === 'cook' ? recipe() : ready()] }),
      } }] });
    } });
    // Identidade do SYSTEM anterior à Fase 1, não uma medição de qualidade.
    assert.equal(createHash('sha256').update(sent.messages[0].content, 'utf8').digest('hex'),
      '7bdf39794469a46a044e75a0fbddf71a89a2df2f70a730a0938d3cbdb3315d3b');
    assert.equal(sent.model, MODEL); assert.equal(sent.reasoning_effort, 'low');
    assert.equal(sent.max_completion_tokens, 4096);
    assert.deepEqual(JSON.parse(sent.messages[1].content), req);
  }
});
