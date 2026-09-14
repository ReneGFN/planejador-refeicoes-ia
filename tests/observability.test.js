import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("observabilidade de IA usa somente campos agregados e proíbe conteúdo sensível", async () => {
  const source = await readFile(new URL("../src/http/api.js", import.meta.url), "utf8");
  const start = source.indexOf("function observeAi");
  const end = source.indexOf("function duplicateGeneration", start);
  const block = source.slice(start, end);
  for (const allowed of ["operation", "outcome", "code", "elapsed_ms", "total_tokens"]) assert.match(block, new RegExp(allowed));
  for (const forbidden of ["request.body", "data_json", "cookie", "authorization", "visitorId", "generationKey", "CF-Connecting-IP"]) assert.doesNotMatch(block, new RegExp(forbidden, "i"));
});
