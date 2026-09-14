import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

test('planner: outside click and Escape close, inside clicks and cancelled gestures do not', () => {
  const element = () => ({ handlers: {}, style: {}, addEventListener(name, fn) { this.handlers[name] = fn; }, setAttribute() {} });
  const sheet = { ...element(), hidden: false, before() {} };
  const handle = element(), backdrop = element();
  let closed = 0, modal = false;
  const document = { ...element(), createElement: () => backdrop, querySelector: () => modal,
    getElementById: id => ({ 'meal-sheet': sheet, 'planner-drag-handle': handle, close: { click() { closed++; } } })[id] };
  const source = readFileSync(new URL('../frontend/planner-details.ts', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, document });
  exports.installPlannerDrag();
  backdrop.handlers.click(); // A drag starting inside must not dismiss.
  assert.equal(closed, 0);
  backdrop.handlers.pointerdown({ button: 0 });
  backdrop.handlers.pointercancel();
  backdrop.handlers.click();
  assert.equal(closed, 0);
  backdrop.handlers.pointerdown({ button: 0 });
  document.handlers.pointerup({ target: backdrop });
  backdrop.handlers.click();
  assert.equal(closed, 1);
  backdrop.handlers.pointerdown({ button: 0 });
  document.handlers.pointerup({ target: sheet });
  backdrop.handlers.click();
  assert.equal(closed, 1);
  document.handlers.keydown({ key: 'Escape', preventDefault() {} });
  assert.equal(closed, 2);
  modal = true;
  document.handlers.keydown({ key: 'Escape', preventDefault() {} });
  assert.equal(closed, 2);
  sheet.hidden = true;
  backdrop.handlers.pointerdown({ button: 0 });
  backdrop.handlers.click();
  assert.equal(closed, 2);
});
