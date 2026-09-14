import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../lib/theme.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const bootstrap = readFileSync(new URL('../public/theme-init.js', import.meta.url), 'utf8');

function environment(saved, blocked = false) {
  const values = new Map(saved === undefined ? [] : [['refeicao-facil:theme', saved]]);
  const localStorage = {
    getItem(key) { if (blocked) throw Error('blocked'); return values.get(key) ?? null; },
    setItem(key, value) { if (blocked) throw Error('blocked'); values.set(key, value); },
  };
  const document = Object.assign(new EventTarget(), {
    documentElement: { dataset: {}, classList: { toggle(name, enabled) { document.dark = enabled; } } },
    querySelector() { return { setAttribute(name, value) { document.meta = value; } }; },
  });
  const window = new EventTarget();
  const context = vm.createContext({ exports: {}, document, window, localStorage, Event });
  vm.runInContext(bootstrap, context);
  vm.runInContext(compiled, context);
  return { api: context.exports, document, window, values, localStorage };
}

test('tema: mantém claro original sem escolha; restaura escuro antes do React', () => {
  for (const saved of [undefined, 'light', 'invalid']) {
    const { api, document } = environment(saved);
    assert.equal(api.getTheme(), 'light');
    assert.equal(document.meta, '#FBF1E0');
    assert.equal(document.dark, false);
  }
  const { api, document } = environment('dark');
  assert.equal(api.getTheme(), 'dark');
  assert.equal(document.meta, '#080D0B');
  assert.equal(document.dark, true);
});

test('tema: alterna, persiste e notifica sem tocar nas demais preferências', () => {
  const { api, document, values } = environment();
  values.set('refeicao-facil:draft', 'pedido preservado');
  let updates = 0;
  const unsubscribe = api.subscribeTheme(() => updates++);
  api.setTheme('dark');
  assert.equal(api.getTheme(), 'dark');
  assert.equal(values.get(api.THEME_KEY), 'dark');
  api.setTheme('light');
  assert.equal(document.meta, '#FBF1E0');
  assert.equal(updates, 2);
  assert.equal(values.get('refeicao-facil:draft'), 'pedido preservado');
  unsubscribe();
  api.setTheme('dark');
  assert.equal(updates, 2);
});

test('tema: storage bloqueado não impede alternância', () => {
  const { api } = environment('dark', true);
  assert.equal(api.getTheme(), 'light');
  assert.doesNotThrow(() => api.setTheme('dark'));
  assert.equal(api.getTheme(), 'dark');
});

test('tema: sincroniza outras abas, ignora chaves e storage alheios', () => {
  const { api, window, localStorage } = environment();
  api.subscribeTheme(() => {});
  function storage(key, newValue, storageArea = localStorage) {
    window.dispatchEvent(Object.assign(new Event('storage'), { key, newValue, storageArea }));
  }
  storage('unrelated', 'dark');
  assert.equal(api.getTheme(), 'light');
  storage(api.THEME_KEY, 'dark', {});
  assert.equal(api.getTheme(), 'light');
  storage(api.THEME_KEY, 'dark');
  assert.equal(api.getTheme(), 'dark');
  storage(null, null);
  assert.equal(api.getTheme(), 'light');
});

test('tema: contraste dos pares de texto escuros é pelo menos 4.5:1', () => {
  const css = readFileSync(new URL('../frontend/styles.css', import.meta.url), 'utf8');
  const dark = css.match(/:root\[data-theme="dark"\] \{([^}]+)\}/)[1];
  const tokens = Object.fromEntries([...dark.matchAll(/(--[\w-]+):\s*(#[\da-f]{6});/gi)].map(m => [m[1], m[2]]));
  function luminance(hex) {
    const rgb = hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  }
  for (const [fg, bg] of [
    ['--color-ink', '--color-page'], ['--color-ink', '--color-surface'],
    ['--color-muted', '--color-surface'], ['--color-muted', '--color-cream'],
    ['--color-accent', '--glass-highlight'], ['--color-on-action', '--color-action'],
    ['--color-danger', '--color-surface'], ['--color-warn', '--color-surface'],
  ]) {
    const a = luminance(tokens[fg]), b = luminance(tokens[bg]);
    assert.ok((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 4.5, `${fg} sobre ${bg}`);
  }
});
