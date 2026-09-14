import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

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
  assert.match(source, /id="pwa-status"/);
});
