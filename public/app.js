import { createGenerationClient } from './generation-client.js';

const generationClient = createGenerationClient();
const $ = id => document.getElementById(id);
const screen = $('meal-screen'), form = $('form'), content = $('app-content');
const bar = $('active-order-bar'), progress = $('active-order-progress');
const fields = ['meal', 'people', 'budget', 'time', 'policy', 'ingredients', 'preferences'];
const state = { step: 0, returnHash: '#inicio', draft: JSON.parse(localStorage.getItem('refeicao-facil:draft') || '{}') };
const toast = message => { const el = $('toast'); el.textContent = message; el.hidden = !message; clearTimeout(toast.timer); if (message) toast.timer = setTimeout(() => { el.hidden = true; }, 6000); };

function syncSuggestions() {
  document.querySelectorAll('[data-suggest-target]').forEach(button => {
    const target = $(button.dataset.suggestTarget), parts = target.value.split(',').map(value => value.trim()).filter(Boolean);
    const selected = target.id === 'ingredients' || target.id === 'preferences' ? parts.includes(button.dataset.value) : target.value === button.dataset.value;
    button.setAttribute('aria-pressed', String(selected));
  });
}
function selectSuggestion(button) {
  const target = $(button.dataset.suggestTarget), value = button.dataset.value;
  const multiple = target.id === 'ingredients' || target.id === 'preferences';
  if (multiple) {
    const parts = target.value.split(',').map(item => item.trim()).filter(Boolean);
    target.value = parts.includes(value) ? parts.filter(item => item !== value).join(', ') : [...parts, value].join(', ');
  } else target.value = value;
  target.dispatchEvent(new Event('input', { bubbles: true })); target.focus();
}
function renderPantrySuggestions(rawItems) {
  const section = $('pantry-ingredient-suggestions'), list = $('pantry-ingredient-list');
  const items = Array.isArray(rawItems) ? [...new Set(rawItems.filter(item => typeof item === 'string').map(item => item.trim()).filter(Boolean))] : [];
  list.replaceChildren();
  for (const item of items) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'suggestion-chip'; button.dataset.suggestTarget = 'ingredients'; button.dataset.value = item; button.textContent = item;
    button.addEventListener('click', () => selectSuggestion(button)); list.append(button);
  }
  section.hidden = items.length === 0;
  syncSuggestions();
}
function hasDraft() { return Boolean($('meal').value.trim() || $('ingredients').value.trim() || $('preferences').value.trim() || $('budget').value.trim()); }
function updateOrderBar() {
  const ingredients = $('ingredients').value.split(',').map(value => value.trim()).filter(Boolean).length;
  const last = $('mode').checked ? 2 : 3;
  progress.textContent = ingredients ? `${ingredients} ingrediente${ingredients === 1 ? '' : 's'} · passo ${state.step + 1} de ${last + 1}` : `passo ${state.step + 1} de ${last + 1}`;
  bar.hidden = location.hash === '#pedido' || !hasDraft();
  document.body.classList.toggle('has-active-order', !bar.hidden);
}
function save() {
  const draft = Object.fromEntries(fields.map(id => [id, $(id).value]));
  draft.mode = $('mode').checked ? 'ready' : 'cook'; draft.equipment = [...form.querySelectorAll('[name=equipment]:checked')].map(input => input.value);
  localStorage.setItem('refeicao-facil:draft', JSON.stringify(draft)); syncSuggestions(); updateOrderBar();
}
function restore() {
  const draft = state.draft;
  fields.forEach(id => { if (draft[id] !== undefined) $(id).value = draft[id]; });
  $('mode').checked = draft.mode === 'ready'; form.querySelectorAll('[name=equipment]').forEach(input => { input.checked = draft.equipment?.includes(input.value); });
}
function render() {
  const ready = $('mode').checked, last = ready ? 2 : 3;
  state.step = Math.min(state.step, last);
  document.querySelectorAll('.question[data-q]').forEach(question => { const index = Number(question.dataset.q); question.classList.toggle('current', index === state.step || (ready && index === 3 && state.step === 2)); });
  [...document.querySelectorAll('.progress-step')].filter(item => !item.hidden).forEach((item, index) => { if (index === state.step) item.setAttribute('aria-current', 'step'); else item.removeAttribute('aria-current'); });
  $('back').hidden = state.step === 0; $('next').hidden = state.step === last; $('generate').hidden = state.step !== last; updateOrderBar();
}
function mode() {
  const ready = $('mode').checked;
  $('mode-label').textContent = ready ? 'Comida pronta' : 'Cozinhar'; $('mode-desc').textContent = ready ? 'Receba termos para procurar uma opção.' : 'Use o que você tem ou peça sugestões.';
  document.querySelector('.mode-row').dataset.mode = ready ? 'ready' : 'cook'; document.querySelectorAll('[data-cook-step], [data-cook], .expanded-only').forEach(item => { item.hidden = ready; }); save(); render();
}
function error() {
  if (state.step === 0 && !$('meal').value.trim()) return 'Diga qual refeição você quer resolver.';
  if (!$('mode').checked && state.step === 2 && $('policy').value !== 'suggest' && !$('ingredients').value.trim()) return 'Liste ao menos um ingrediente ou escolha “Pode sugerir ingredientes”.';
  return '';
}
function request() {
  const ready = $('mode').checked, value = id => $(id).value.trim(), out = { mode: ready ? 'ready' : 'cook', meal: value('meal'), people: Number(value('people')) };
  if (value('budget')) out.budget_brl = Number(value('budget')); if (value('preferences')) out.preferences = value('preferences');
  if (!ready) { out.time_minutes = Number(value('time')); out.ingredient_policy = value('policy'); out.ingredients = out.ingredient_policy === 'suggest' ? [] : value('ingredients').split(',').map(item => item.trim()).filter(Boolean); const equipment = [...form.querySelectorAll('[name=equipment]:checked')].map(input => input.value); if (equipment.length) out.equipment = equipment; }
  return out;
}
function leavePlanner() { save(); const destination = state.returnHash && state.returnHash !== '#pedido' ? state.returnHash : '#inicio'; if (location.hash === '#pedido') location.hash = destination; }
function showPlanner() { screen.hidden = false; content.hidden = true; document.body.classList.add('planner-open'); bar.hidden = true; document.body.classList.remove('has-active-order'); window.scrollTo({ top: 0, behavior: 'instant' }); render(); window.setTimeout(() => $('meal').focus({ preventScroll: true }), 0); }
function hidePlanner() { screen.hidden = true; content.hidden = false; document.body.classList.remove('planner-open', 'planner-keyboard-open'); updateOrderBar(); }
function syncRoute() { if (location.hash === '#pedido') showPlanner(); else hidePlanner(); }
function openPlanner() { if (location.hash !== '#pedido') { state.returnHash = location.hash && location.hash !== '#pedido' ? location.hash : '#inicio'; location.hash = 'pedido'; } else showPlanner(); }
function clearOrder() { form.reset(); localStorage.removeItem('refeicao-facil:draft'); state.draft = {}; state.step = 0; mode(); $('status').hidden = true; toast('Pedido limpo.'); updateOrderBar(); }
function syncKeyboard() { const focused = document.activeElement, fieldFocused = focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement || focused instanceof HTMLSelectElement; document.body.classList.toggle('planner-keyboard-open', !screen.hidden && fieldFocused && screen.contains(focused)); }
async function send() {
  const message = error(); if (message) { $('status').textContent = message; $('status').hidden = false; return; } if (!navigator.onLine) { toast('Você está offline. Reconecte-se para gerar novas sugestões.'); return; }
  $('status').hidden = true; save(); form.classList.add('loading'); form.setAttribute('aria-busy', 'true'); $('generate').disabled = true;
  try { const data = await generationClient.generate(request()); if (data.replayed) toast('Pedido recuperado com segurança.'); const items = data?.data?.suggestions || []; if (!items.length) { toast('A resposta não trouxe sugestões utilizáveis.'); return; } document.dispatchEvent(new CustomEvent('refeicao:results-ready', { detail: { items, planId: data.plan_id || null, mode: data.data.mode } })); }
  catch (exception) { toast(exception.message); document.dispatchEvent(new CustomEvent('refeicao:request-error', { detail: { message: exception.message, code: exception.code, retryable: Boolean(exception.retryable) } })); }
  finally { form.classList.remove('loading'); form.removeAttribute('aria-busy'); $('generate').disabled = false; }
}

restore(); mode(); syncRoute();
document.querySelectorAll('[data-suggest-target]').forEach(button => button.addEventListener('click', () => selectSuggestion(button)));
fields.forEach(id => $(id).addEventListener('input', save)); form.querySelectorAll('[name=equipment]').forEach(input => input.addEventListener('change', save)); $('mode').addEventListener('change', mode); $('policy').addEventListener('change', () => { $('ingredients-field').hidden = $('policy').value === 'suggest'; save(); });
$('next').onclick = () => { const message = error(); if (message) { $('status').textContent = message; $('status').hidden = false; return; } $('status').hidden = true; state.step++; render(); }; $('back').onclick = () => { state.step--; render(); }; $('generate').onclick = send; $('toggle').onclick = leavePlanner; $('close').onclick = leavePlanner; $('clear').onclick = clearOrder; $('resume-order').onclick = openPlanner; $('clear-order').onclick = clearOrder;
document.querySelectorAll('[data-open]').forEach(trigger => { trigger.onclick = openPlanner; }); document.addEventListener('refeicao:open-planner', openPlanner); document.addEventListener('refeicao:pantry-suggestions', event => renderPantrySuggestions(event.detail?.items)); window.addEventListener('hashchange', syncRoute); document.addEventListener('focusin', syncKeyboard); document.addEventListener('focusout', () => window.setTimeout(syncKeyboard, 0));
