import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('planner: rota de tela cheia substitui gaveta, preserva rascunho e oferece retomada acessível', () => {
  const page = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const serviceWorker = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
  assert.ok(page.includes('id="meal-screen"'));
  assert.ok(page.includes('id="active-order-bar"'));
  assert.ok(page.includes('aria-label="Pedido em andamento"'));
  assert.ok(page.includes('id="resume-order"'));
  assert.ok(!page.includes('<bottom-sheet'));
  assert.ok(app.includes("location.hash = 'pedido'"));
  assert.ok(app.includes("localStorage.setItem('refeicao-facil:draft'"));
  assert.ok(app.includes("planner-keyboard-open"));
  assert.ok(!serviceWorker.includes('pure-web-bottom-sheet'));
});
