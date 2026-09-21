import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);

// Compile the actual TSX with the installed TypeScript; no copied component implementations.
function loadComponent(path, hash = '') {
  const cache = new Map();
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} }; cache.set(filename, module);
    const source = readFileSync(filename, 'utf8');
    const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    const localRequire = specifier => {
      if (!specifier.startsWith('.') && !specifier.startsWith('@/')) return require(specifier);
      const base = specifier.startsWith('@/') ? resolve(root, specifier.slice(2)) : resolve(dirname(filename), specifier);
      let target; for (const candidate of [base, ...['.tsx', '.ts', '.js'].map(ext => base + ext)]) { try { readFileSync(candidate); target = candidate; break; } catch {} }
      if (!target) throw Error(`Cannot resolve ${specifier}`);
      return load(target);
    };
    vm.runInNewContext(output, { module, exports: module.exports, require: localRequire, location: { hash } }, { filename });
    return module.exports;
  }
  return load(resolve(root, path));
}

test('preview: início restaura atalhos, ícones, câmera com duas faces e CTA', () => {
  const { PreviewScreens } = loadComponent('frontend/preview-screens.tsx');
  const html = renderToStaticMarkup(React.createElement(PreviewScreens));
  for (const label of ['Foto', 'Diário', 'Erros', 'Nada salvo ainda', 'Lista vazia', 'Começar um pedido']) assert.ok(html.includes(label));
  for (const route of ['foto', 'diario', 'erros']) assert.ok(html.includes(`href="#${route}"`));
  assert.ok(html.includes('flip-icon-inner'));
  assert.ok((html.match(/<svg/g) ?? []).length >= 7);
  assert.ok(!html.includes('3 gerações restantes'));
  assert.ok(html.includes('screen-enter'));
});

test('preview: SVGs originais usam currentColor, sem cores fixas do tema claro', () => {
  const { PreviewIcons, PreviewLogo } = loadComponent('components/ui/preview-icons.tsx');
  assert.deepEqual(Object.keys(PreviewIcons).sort(), ['home','plan','history','cart','camera','book','alert','settings','chevDown','chevUp','chevLeft','x','save','trash','edit','plus','warnIcon','check','video','link','clock','people'].sort());
  for (const Icon of Object.values(PreviewIcons)) {
    const html = renderToStaticMarkup(React.createElement(Icon));
    assert.match(html, /stroke="currentColor"/);
    assert.ok(!html.includes('#064E3B'));
  }
  const logo = renderToStaticMarkup(React.createElement(PreviewLogo));
  assert.match(logo, /M6 15a10 10 0 0020 0/);
});

test('preview: rotas restauradas começam vazias e informam sincronização', () => {
  for (const [route, title, empty] of [['diario','Diário de refeições','Nenhuma refeição registrada'], ['compras','Lista de compras','Sua lista está vazia'], ['planos','Planos anteriores','Nenhum plano salvo ainda']]) {
    const { PreviewScreens } = loadComponent('frontend/preview-screens.tsx', `#${route}`);
    const html = renderToStaticMarkup(React.createElement(PreviewScreens));
    assert.ok(html.includes(title)); assert.ok(html.includes(empty)); assert.ok(html.includes('Modo local'));
  }
});

test('preview: foto explica envio, limita arquivo e exige revisão', () => {
  const { PreviewScreens } = loadComponent('frontend/preview-screens.tsx', '#foto');
  const html = renderToStaticMarkup(React.createElement(PreviewScreens));
  assert.ok(html.includes('foto original será enviada à Groq'));
  assert.ok(html.includes('metadados'));
  assert.ok(html.includes('Confirme os ingredientes manualmente'));
  assert.ok(html.includes('accept="image/jpeg,image/png,image/webp"'));
  assert.ok(!html.includes('<img'));
});

test('preview: swipe mantém alternativa de teclado e ação oculta fora da tabulação', () => {
  const { SwipeAction } = loadComponent('components/ui/swipe-action.tsx');
  const html = renderToStaticMarkup(React.createElement(SwipeAction, { label: 'Excluir', onAction() {} }, 'Item'));
  assert.match(html, /tabindex="-1" aria-hidden="true"/);
  assert.ok(html.includes('swipe-alternative'));
});

test('preview: diário abre e alerta salta sem alterar navegação ou câmera', () => {
  const { PreviewScreens } = loadComponent('frontend/preview-screens.tsx');
  const html = renderToStaticMarkup(React.createElement(PreviewScreens));
  assert.match(html, /href="#diario" class="quick-action quick-diary pressable"/);
  assert.match(html, /href="#erros" class="quick-action quick-errors pressable"/);
  assert.ok(html.includes('diary-cover'));
  assert.ok(html.includes('flip-icon-inner'));
  const css = readFileSync(resolve(root, 'frontend/preview-details.css'), 'utf8');
  assert.ok(css.includes('.quick-diary:is(:hover, :focus-visible, :active) .diary-cover { transform: scaleX(1); }'));
  assert.ok(css.includes('animation: warning-hop .32s ease-out'));
  assert.ok(css.includes('.quick-errors:is(:hover, :focus-visible, :active) .warning-icon svg { animation: none !important; transform: none; }'));
});

test('preview: despensa e personalização conectáveis começam com permissões desligadas', () => {
  for (const route of ['despensa', 'personalizacao']) {
    const { PreviewScreens } = loadComponent('frontend/preview-screens.tsx', '#' + route);
    const html = renderToStaticMarkup(React.createElement(PreviewScreens));
    if (route === 'despensa') {
      assert.ok(html.includes('Novo item'));
      assert.ok(html.includes('Nenhum item cadastrado ainda'));
      assert.ok(html.includes('Lista de compras'));
    } else {
      assert.equal((html.match(/aria-checked="false"/g) || []).length, 2);
      assert.ok(html.includes('serão sincronizadas quando o servidor for ativado'));
    }
  }
});

test('preview: cartão semanal deriva apenas do diário e abre o gerador de imagem', () => {
  const { PreviewScreens } = loadComponent('frontend/preview-screens.tsx');
  const html = renderToStaticMarkup(React.createElement(PreviewScreens));
  assert.ok(html.includes('Sua semana'));
  assert.ok(html.includes('Últimos 7 dias'));
  assert.ok(html.includes('Criar cartão'));
  assert.ok(html.includes('Registre uma refeição para começar'));
  const source = readFileSync(resolve(root, 'components/ui/weekly-share-card.tsx'), 'utf8');
  for (const value of ['Resumo', 'Refeições', 'Sequência', 'Baixar PNG', 'Foto de fundo', 'canvas.toBlob']) assert.ok(source.includes(value));
  for (const value of ['foodEmoji', '🍝', '🍲', '🥗', '🍽️', 'categorias aproximadas']) assert.ok(source.includes(value));
});

test('preview: avaliação de refeição usa pratos, só aparece para consumo vinculado e confirma no servidor', () => {
  const { MealRating } = loadComponent('components/ui/meal-rating.tsx');
  const { upsertConsumedPlan } = loadComponent('frontend/preview-screens.tsx');
  const noRating = renderToStaticMarkup(React.createElement(MealRating, { value: null, onRate() {}, onRemove() {} }));
  const rated = renderToStaticMarkup(React.createElement(MealRating, { value: 1, onRate() {}, onRemove() {} }));
  assert.ok(noRating.includes('Ainda sem avaliação'));
  assert.ok(!noRating.includes('Remover avaliação'));
  assert.ok(rated.includes('1 de 5 pratos'));
  assert.ok(rated.includes('Remover avaliação'));
  assert.equal((rated.match(/aria-pressed=/g) ?? []).length, 5);
  const component = readFileSync(resolve(root, 'components/ui/meal-rating.tsx'), 'utf8');
  const screens = readFileSync(resolve(root, 'frontend/preview-screens.tsx'), 'utf8');
  const client = readFileSync(resolve(root, 'frontend/api-client.ts'), 'utf8');
  assert.ok(component.includes('Utensils') && component.includes('motion.button'));
  assert.ok(component.includes('disabled={pending}'));
  assert.ok(screens.includes('mealForSuggestion(plan.meal_logs ?? [], plan.data.mode, index)'));
  assert.ok(screens.includes('matches.find(meal => meal.rating !== null) ?? matches[0] ?? null'));
  assert.ok(screens.includes('{plan.mealLog && <MealRating'));
  assert.ok(!screens.includes('plan.mealLogs?.map'));
  assert.ok(screens.includes('if (!startAction(action)) return'));
  assert.ok(screens.includes('const consumePlanSuggestion = async'));
  assert.ok(screens.includes('await api.meals.consume'));
  assert.ok(screens.includes('state.plan_meal_log'));
  const meta = { title: 'Arroz', __planId: 'plan-1', __mode: 'cook', __index: 1 };
  const inserted = upsertConsumedPlan([], meta, { id: 'meal-1', rating: null });
  assert.deepEqual(JSON.parse(JSON.stringify(inserted)), [{ id: 'plan-1:1', planId: 'plan-1', mode: 'cook', suggestionIndex: 1,
    suggestion: { title: 'Arroz' }, mealLog: { id: 'meal-1', rating: null } }]);
  assert.equal(upsertConsumedPlan(inserted, meta, { id: 'meal-1', rating: 5 }).length, 1);
  assert.equal(upsertConsumedPlan(inserted, meta, { id: 'meal-1', rating: 5 })[0].mealLog.rating, 5);
  assert.ok(screens.includes('setOpenedPlanId(cardId)'));
  assert.ok(screens.includes('go("planos")'));
  assert.ok(screens.includes('open={openedPlanId === plan.id ? true : undefined}'));
  const consumeBlock = screens.slice(screens.indexOf('const consumePlanSuggestion = async'), screens.indexOf('useEffect(() =>', screens.indexOf('const consumePlanSuggestion = async')));
  assert.ok(!consumeBlock.includes('await api.meals.list()'));
  assert.ok(!consumeBlock.includes('refreshPlans'));
  assert.ok(screens.includes('!plan.mealLog && plan.planId'));
  assert.ok(screens.includes('"Comi isso"'));
  assert.ok(client.includes('source: "plan_suggestion", ...selection'));
  assert.ok(client.includes('source: "manual", description, confirmed_consumed: true'));
  assert.ok(!client.includes('source: "manual", description, eaten_at: new Date().toISOString()'));
  assert.ok(!screens.includes('const created = await api.meals.list()'));
  assert.ok(!screens.includes('const eatenAt = new Date(Date.now() - 60_000).toISOString()'));
  const ratingBlock = screens.slice(screens.indexOf('async function saveRating'), screens.indexOf('const removePlan', screens.indexOf('async function saveRating')));
  assert.ok(ratingBlock.indexOf('await api.meals.rate') < ratingBlock.indexOf('setPlans(previous'));
  assert.ok(client.includes('rating: number | null'));
  assert.ok(readFileSync(resolve(root, 'wrangler.jsonc'), 'utf8').includes('\\"globalDay\\":60'));
});

test('preview: menu mantém todos os nomes visíveis abaixo dos ícones', () => {
  const { ExpandableTabs } = loadComponent('components/ui/expandable-tabs.tsx');
  const { PreviewIcons } = loadComponent('components/ui/preview-icons.tsx');
  const titles = ['Início', 'Planejar', 'Planos', 'Compras', 'Configurações'];
  const html = renderToStaticMarkup(React.createElement(ExpandableTabs, { persistentLabels: true, tabs: titles.map(title => ({ title, icon: PreviewIcons.home })) }));
  assert.equal((html.match(/class="tab-label"/g) || []).length, 5);
  for (const title of titles) assert.ok(html.includes(`>${title}</span>`));
  const page = readFileSync(resolve(root, 'public/index.html'), 'utf8');
  assert.ok(!page.includes('id="preview-settings"'));
  assert.ok(page.includes('id="theme-toggle"'));
});

test('preview: sugestões rápidas cobrem planejador, compras, despensa, planos, diário e foto', () => {
  const page = readFileSync(resolve(root, 'public/index.html'), 'utf8');
  const app = readFileSync(resolve(root, 'public/app.js'), 'utf8');
  const screens = readFileSync(resolve(root, 'frontend/preview-screens.tsx'), 'utf8');
  const pantry = readFileSync(resolve(root, 'components/ui/pantry-preview.tsx'), 'utf8');
  const css = readFileSync(resolve(root, 'frontend/preview-details.css'), 'utf8');
  assert.ok(page.includes('data-suggest-target="meal"'));
  assert.ok(page.includes('data-suggest-target="ingredients"'));
  assert.ok(page.includes('data-suggest-target="preferences"'));
  assert.match(app, /target\.dispatchEvent\(new Event\('input',\s*\{\s*bubbles:\s*true\s*\}\)\)/);
  for (const text of ['Café da manhã', 'Arroz', 'Ingredientes comuns', 'Ideias para começar']) assert.ok(screens.includes(text));
  assert.ok(pantry.includes('Azeite de oliva'));
  assert.ok(css.includes('.suggestion-chip[aria-pressed="true"]'));
  assert.ok(css.includes('--glow-green'));
});

test('planejador: texto natural, até 20 pessoas, ingredientes opcionais e orçamento incremental', () => {
  const page = readFileSync(resolve(root, 'public/index.html'), 'utf8');
  const app = readFileSync(resolve(root, 'public/app.js'), 'utf8');
  assert.ok(page.includes('O que você quer comer hoje?'));
  assert.match(page, /id="people" class="number-stepper-input" type="number" min="1" max="20" step="1" value="2"/);
  assert.ok(page.includes('id="people-decrement"'));
  assert.ok(page.includes('id="people-increment"'));
  assert.ok(page.includes('Ingredientes (opcional)'));
  assert.ok(page.includes('Deixe em branco para receber uma sugestão pelo tempo e orçamento.'));
  assert.equal((page.match(/data-budget-increment=/g) ?? []).length, 3);
  assert.ok(app.includes("out.ingredient_policy = ingredients.length ? value('policy') : 'suggest'"));
  assert.ok(app.includes("$('budget').value = Math.min(current + increment, 100000).toFixed(2)"));
  assert.ok(app.includes("$('policy').value === 'only_available'"));
  assert.ok(app.includes('function changePeople(amount)'));
  assert.ok(app.includes("$('people-decrement').addEventListener('click', () => changePeople(-1))"));
  assert.ok(app.includes("$('people-increment').addEventListener('click', () => changePeople(1))"));
});

test('preview: apoio em vídeo usa a rota autorizada, aviso contratual e link externo seguro', () => {
  const screens = readFileSync(resolve(root, 'frontend/preview-screens.tsx'), 'utf8');
  const client = readFileSync(resolve(root, 'frontend/api-client.ts'), 'utf8');
  const headers = readFileSync(resolve(root, 'public/_headers'), 'utf8');
  assert.ok(client.includes('request("/api/video"'));
  assert.ok(screens.includes('support.notice.text'));
  assert.ok(screens.includes('target="_blank" rel="noopener noreferrer"'));
  assert.ok(screens.includes('aria-label="Sobre o vídeo de apoio"'));
  assert.ok(screens.includes('https://www.youtube.com/results?search_query='));
  assert.ok(screens.includes('Você ainda pode pesquisar esta receita diretamente.'));
  assert.ok(!screens.includes('<iframe'));
  assert.ok(!headers.includes('unsafe-inline'));
});

test('preview: ingredientes traduzem unidades do contrato e respeitam singular/plural', () => {
  const { formatIngredient } = loadComponent('frontend/ingredient-format.ts');
  assert.equal(formatIngredient({ quantity: 1, unit: 'unit', name: 'Ovos' }), '1 unidade de Ovos');
  assert.equal(formatIngredient({ quantity: 2, unit: 'unit', name: 'ovos' }), '2 unidades de ovos');
  assert.equal(formatIngredient({ quantity: 1, unit: 'tablespoon', name: 'azeite' }), '1 colher de sopa de azeite');
  assert.equal(formatIngredient({ quantity: 1.5, unit: 'cup', name: 'leite' }), '1,5 xícaras de leite');
  assert.equal(formatIngredient({ quantity: 100, unit: 'g', name: 'arroz' }), '100 g de arroz');
});

test('preview: plano salvo preserva tempo, ingredientes, preparo e seleção segura de vídeo', () => {
  const screens = readFileSync(resolve(root, 'frontend/preview-screens.tsx'), 'utf8');
  const videoSelection = readFileSync(resolve(root, 'src/video/selection.js'), 'utf8');
  for (const value of ['suggestion.total_minutes', 'formatIngredient(ingredient)', 'Modo de preparo', '<VideoSupportBlock suggestion={suggestion} />']) {
    assert.ok(screens.includes(value), value);
  }
  assert.ok(videoSelection.includes('WHERE visitor_id = ?1 AND id = ?2'));
  assert.ok(videoSelection.includes('return validateVideoInput({ title: suggestion.title }).title'));
});

test('preview: despensa sugere localmente e só envia contexto completo após consentimento', () => {
  const page = readFileSync(resolve(root, 'public/index.html'), 'utf8');
  const app = readFileSync(resolve(root, 'public/app.js'), 'utf8');
  const screens = readFileSync(resolve(root, 'frontend/preview-screens.tsx'), 'utf8');
  assert.ok(page.includes('id="pantry-ingredient-suggestions"') && page.includes('hidden aria-live="polite"'));
  assert.ok(page.includes('Da sua despensa'));
  assert.ok(screens.includes('refeicao:pantry-suggestions'));
  assert.ok(screens.includes('Mostrar nomes no formulário é uma sugestão local'));
  assert.ok(screens.includes('refeicao-facil:local-pantry'));
  assert.ok(screens.includes('setPantryState(items)'));
  assert.ok(!screens.includes('personalization.pantry\n      ? [...new Set(pantry'));
  assert.ok(app.includes('section.hidden = items.length === 0'));
  assert.ok(app.includes("button.dataset.suggestTarget = 'ingredients'"));
  assert.ok(app.includes("target.dispatchEvent(new Event('input', { bubbles: true }))"));
});

test('preview: cada receita deixa claro que passos e tempo exigem conferência humana', () => {
  const screens = readFileSync(resolve(root, 'frontend/preview-screens.tsx'), 'utf8');
  const guidance = 'Sugestão de preparo: confira se a sequência, o tempo e o cozimento fazem sentido para os ingredientes antes de começar.';
  assert.ok(screens.includes('recipe-guidance'));
  assert.ok(screens.includes(guidance));
  assert.ok(screens.indexOf(guidance) < screens.indexOf('className="recipe-steps"'));
});

test('preview: animações têm variante de movimento reduzido e CSP mantém scripts locais', () => {
  const css = readFileSync(resolve(root, 'frontend/preview-details.css'), 'utf8');
  assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'));
  assert.ok(css.includes('transform: rotateY(180deg)'));
  assert.ok(!css.includes('transition: all'));
  const csp = readFileSync(resolve(root, 'public/_headers'), 'utf8');
  assert.ok(csp.includes("script-src 'self'"));
  assert.ok(csp.includes("img-src 'self' blob:"));
  assert.ok(!csp.includes('unsafe-inline'));
});
