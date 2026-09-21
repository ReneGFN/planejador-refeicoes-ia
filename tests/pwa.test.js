import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

test("manifest exposes an installable standalone app", async () => {
  const manifest = JSON.parse(await readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"));
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "/#inicio");
  assert.ok(manifest.icons.some(icon => icon.purpose.includes("any")));
  assert.ok(manifest.icons.some(icon => icon.purpose.includes("maskable")));
});

test("service worker caches the shell but never intercepts API calls", async () => {
  const source = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
  assert.match(source, /generation-client\.js/);
  assert.match(source, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(source, /SKIP_WAITING/);
});

test("page links the manifest and reserves the PWA status control", async () => {
  const source = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  assert.match(source, /rel="manifest"/);
  assert.match(source, /name="mobile-web-app-capable" content="yes"/);
  assert.match(source, /id="pwa-status"/);
});

test("public demo has a stable path outside the regular PWA navigation", async () => {
  const redirects = await readFile(new URL("../public/_redirects", import.meta.url), "utf8");
  const screens = await readFile(new URL("../frontend/preview-screens.tsx", import.meta.url), "utf8");
  const navigation = await readFile(new URL("../frontend/navigation.tsx", import.meta.url), "utf8");
  assert.match(redirects, /^\/demonstracao\s+\/index\.html\s+200\s*$/m);
  assert.ok(screens.includes('(location.pathname ?? "").replace(/\\/+$/u, "") === "/demonstracao"'));
  assert.ok(!navigation.includes('href: "/demonstracao"'));
});

test("install invitation calls the captured browser prompt exactly once", async () => {
  const source = await readFile(new URL("../components/ui/pwa-status.tsx", import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, { module, exports: module.exports, require(id) {
    if (id === "react" || id === "react/jsx-runtime" || id === "lucide-react") return {};
    throw new Error(`módulo inesperado: ${id}`);
  } });
  let prompts = 0;
  const result = await module.exports.requestInstallation({ prompt: async () => { prompts++; },
    userChoice: Promise.resolve({ outcome: "accepted" }) });
  assert.equal(prompts, 1);
  assert.equal(result.outcome, "accepted");
  assert.equal(module.exports.needsIosInstallHelp("Mozilla/5.0 (iPhone)", false), true);
  assert.equal(module.exports.needsIosInstallHelp("Mozilla/5.0 (iPhone)", true), false);
  assert.equal(module.exports.needsIosInstallHelp("Mozilla/5.0 (Linux; Android 15)", false), false);
});
