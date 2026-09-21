import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const outputDir = path.join(root, "public", "demo", "screens");
const baseUrl = process.env.DEMO_BASE_URL || "https://planejador-refeicoes-ia.pages.dev/";
const chrome = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const port = 9400 + (process.pid % 400);
const profile = path.join(root, ".build", `demo-browser-profile-${process.pid}`);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

class Cdp {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.pending = new Map();
    this.nextId = 1;
  }
  async open() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", event => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
    this.socket.addEventListener("close", () => {
      for (const pending of this.pending.values()) pending.reject(new Error("A conexão com o Chrome foi encerrada."));
      this.pending.clear();
    });
  }
  call(method, params = {}) {
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  close() { this.socket.close(); }
}

async function endpoint() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then(response => response.json());
      const page = pages.find(item => item.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* Chrome ainda está iniciando. */ }
    await wait(250);
  }
  throw new Error("O Chrome não abriu a porta de depuração.");
}

async function evaluate(cdp, expression, awaitPromise = false) {
  const result = await cdp.call("Runtime.evaluate", { expression, awaitPromise, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function waitFor(cdp, expression, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await evaluate(cdp, `Boolean(${expression})`)) return;
    await wait(300);
  }
  throw new Error(`Tempo esgotado aguardando: ${expression}`);
}

async function route(cdp, hash) {
  await evaluate(cdp, `location.hash = ${JSON.stringify(hash)}`);
  await waitFor(cdp, `location.hash === ${JSON.stringify(hash)}`);
  await wait(750);
  await evaluate(cdp, "scrollTo(0, 0)");
}

async function screenshot(cdp, file) {
  await evaluate(cdp, "document.activeElement instanceof HTMLElement && document.activeElement.blur()");
  await wait(120);
  const { data } = await cdp.call("Page.captureScreenshot", { format: "png", fromSurface: true });
  await writeFile(path.join(outputDir, file), Buffer.from(data, "base64"));
  process.stdout.write(`capturado ${file}\n`);
}

async function clickText(cdp, text) {
  return evaluate(cdp, `(() => {
    const target = [...document.querySelectorAll('button, a')].find(element => element.textContent?.trim().includes(${JSON.stringify(text)}));
    if (!target) return false;
    target.click();
    return true;
  })()`);
}

async function prepareContent(cdp) {
  await route(cdp, "#inicio");
  await screenshot(cdp, "01-inicio.png");

  await evaluate(cdp, "document.dispatchEvent(new CustomEvent('refeicao:open-planner'))");
  await waitFor(cdp, "!document.getElementById('meal-screen')?.hidden");
  await wait(500);
  await evaluate(cdp, `(() => {
    const meal = document.getElementById('meal');
    meal.value = 'Jantar prático e brasileiro';
    meal.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await screenshot(cdp, "02-pedido.png");

  for (let step = 0; step < 3; step += 1) {
    await evaluate(cdp, "document.getElementById('next').click()");
    await wait(250);
    if (step === 0) {
      await evaluate(cdp, `(() => {
        const budget = document.getElementById('budget');
        budget.value = '80'; budget.dispatchEvent(new Event('input', { bubbles: true }));
      })()`);
    }
    if (step === 1) {
      await evaluate(cdp, `(() => {
        const ingredients = document.getElementById('ingredients');
        ingredients.value = 'arroz, feijão, frango e tomate';
        ingredients.dispatchEvent(new Event('input', { bubbles: true }));
      })()`);
    }
  }
  await evaluate(cdp, `(() => {
    const preferences = document.getElementById('preferences');
    preferences.value = 'Pouca louça';
    preferences.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('generate').click();
  })()`);

  try {
    await waitFor(cdp, "location.hash === '#resultado' && document.querySelectorAll('.preview-result').length > 0", 45000);
    await wait(1000);
    await screenshot(cdp, "03-resultado.png");

    await clickText(cdp, "Comi isso");
    await waitFor(cdp, "location.hash === '#planos'", 20000);
    await wait(900);
    await screenshot(cdp, "04-planos.png");
  } catch (error) {
    const diagnostic = await evaluate(cdp, `JSON.stringify({
      hash: location.hash,
      status: document.getElementById('status')?.textContent,
      statusHidden: document.getElementById('status')?.hidden,
      generateHidden: document.getElementById('generate')?.hidden,
      generateDisabled: document.getElementById('generate')?.disabled,
    })`);
    process.stderr.write(`conteúdo de IA indisponível; capturando estados existentes: ${error.message}; ${diagnostic}\n`);
    await route(cdp, "#resultado");
    await screenshot(cdp, "03-resultado.png");
    await route(cdp, "#planos");
    await screenshot(cdp, "04-planos.png");
  }

  await route(cdp, "#foto");
  await screenshot(cdp, "05-foto.png");
  await route(cdp, "#diario");
  await screenshot(cdp, "06-diario.png");
  await route(cdp, "#compras");
  await screenshot(cdp, "07-compras.png");
  await route(cdp, "#despensa");
  await screenshot(cdp, "08-despensa.png");
  await route(cdp, "#config");
  await screenshot(cdp, "09-configuracoes.png");
  await route(cdp, "#personalizacao");
  await screenshot(cdp, "10-personalizacao.png");
  await route(cdp, "#erros");
  await screenshot(cdp, "11-erros.png");
}

await mkdir(outputDir, { recursive: true });
await mkdir(profile, { recursive: true });
const browser = spawn(chrome, [
  `--remote-debugging-port=${port}`,
  "--remote-allow-origins=*",
  `--user-data-dir=${profile}`,
  "--headless=new",
  "--hide-scrollbars",
  "--disable-gpu",
  "--no-first-run",
  "--window-size=390,844",
  baseUrl,
], { stdio: "ignore" });

let cdp;
try {
  cdp = new Cdp(await endpoint());
  await cdp.open();
  await cdp.call("Page.enable");
  await cdp.call("Runtime.enable");
  await cdp.call("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
    screenWidth: 390,
    screenHeight: 844,
  });
  await cdp.call("Emulation.setUserAgentOverride", {
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 RefeicaoFacilDemo/1.0",
  });
  await cdp.call("Page.navigate", { url: baseUrl });
  await waitFor(cdp, "document.readyState === 'complete' && document.getElementById('meal-screens')");
  await wait(1500);
  await prepareContent(cdp);
} finally {
  cdp?.close();
  browser.kill();
}
