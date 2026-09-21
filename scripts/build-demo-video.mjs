import { spawn } from "node:child_process";
import { access, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const demoDir = path.join(root, "public", "demo");
const output = path.join(demoDir, "refeicao-facil-demo.webm");
const chrome = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const port = 9800 + (process.pid % 150);
const profile = path.join(root, ".build", `demo-video-profile-${process.pid}`);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const images = [
  ["01-inicio.png", "Sua próxima refeição, resolvida"],
  ["02-pedido.png", "Um pedido guiado, sem formulário vazio"],
  ["03-resultado.png", "Sugestões completas em uma geração"],
  ["04-planos.png", "Ingredientes e preparo ficam salvos"],
  ["05-foto.png", "Ingredientes também podem vir de uma foto"],
  ["06-diario.png", "O que foi consumido entra no diário"],
  ["07-compras.png", "Compras e despensa no mesmo fluxo"],
  ["09-configuracoes.png", "PWA responsivo, claro e escuro"],
];

class Cdp {
  constructor(url) { this.socket = new WebSocket(url); this.pending = new Map(); this.id = 1; }
  async open() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", event => {
      const message = JSON.parse(event.data);
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result);
    });
  }
  call(method, params = {}) {
    const id = this.id++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  close() { this.socket.close(); }
}

async function endpoint() {
  for (let index = 0; index < 40; index += 1) {
    try {
      const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then(response => response.json());
      const page = pages.find(item => item.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* Chrome iniciando. */ }
    await wait(250);
  }
  throw new Error("O Chrome não abriu a porta de depuração.");
}

await mkdir(demoDir, { recursive: true });
await mkdir(profile, { recursive: true });
await rm(output, { force: true });
const browser = spawn(chrome, [
  `--remote-debugging-port=${port}`,
  "--remote-allow-origins=*",
  `--user-data-dir=${profile}`,
  "--headless=new",
  "--allow-file-access-from-files",
  "--no-first-run",
  "about:blank",
], { stdio: "ignore" });

let cdp;
try {
  cdp = new Cdp(await endpoint());
  await cdp.open();
  await cdp.call("Page.enable");
  await cdp.call("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: demoDir, eventsEnabled: true });
  const fileUrls = await Promise.all(images.map(async ([file, title]) => [
    `data:image/png;base64,${(await readFile(path.join(demoDir, "screens", file))).toString("base64")}`,
    title,
  ]));
  const expression = `(() => new Promise(async (resolve, reject) => {
    try {
      const sources = ${JSON.stringify(fileUrls)};
      const loaded = await Promise.all(sources.map(([src, title]) => new Promise((done, fail) => {
        const image = new Image(); image.onload = () => done({ image, title }); image.onerror = fail; image.src = src;
      })));
      const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 1920;
      const context = canvas.getContext('2d');
      const stream = canvas.captureStream(30);
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 7000000 });
      const chunks = []; recorder.ondataavailable = event => event.data.size && chunks.push(event.data);
      const rounded = (x, y, width, height, radius) => { context.beginPath(); context.roundRect(x, y, width, height, radius); context.closePath(); };
      const draw = (entry, alpha, progress) => {
        const gradient = context.createLinearGradient(0, 0, 1080, 1920);
        gradient.addColorStop(0, '#07110d'); gradient.addColorStop(.62, '#0b2d21'); gradient.addColorStop(1, '#9a3412');
        context.fillStyle = gradient; context.fillRect(0, 0, 1080, 1920);
        context.globalAlpha = alpha;
        context.fillStyle = '#65d69a'; context.font = '700 30px Arial'; context.fillText('REFEIÇÃO FÁCIL', 90, 112);
        context.fillStyle = '#ffffff'; context.font = '700 54px Arial';
        const words = entry.title.split(' '); const lines = []; let line = '';
        for (const word of words) { const next = line ? line + ' ' + word : word; if (context.measureText(next).width > 850) { lines.push(line); line = word; } else line = next; }
        lines.push(line); lines.forEach((text, index) => context.fillText(text, 90, 190 + index * 64));
        const phoneX = 190; const phoneY = 315 + Math.sin(progress * Math.PI) * -10; const phoneW = 700; const phoneH = 1515;
        context.shadowColor = 'rgba(0,0,0,.45)'; context.shadowBlur = 45; context.fillStyle = '#050906'; rounded(phoneX - 15, phoneY - 15, phoneW + 30, phoneH + 30, 74); context.fill(); context.shadowBlur = 0;
        context.save(); rounded(phoneX, phoneY, phoneW, phoneH, 58); context.clip(); context.drawImage(entry.image, phoneX, phoneY, phoneW, phoneH); context.restore();
        context.fillStyle = '#030604'; rounded(430, phoneY + 18, 220, 48, 30); context.fill();
        context.globalAlpha = 1;
      };
      recorder.start(250);
      for (const entry of loaded) {
        for (let frame = 0; frame < 54; frame += 1) {
          const fade = frame < 8 ? frame / 8 : frame > 46 ? (54 - frame) / 8 : 1;
          draw(entry, Math.max(0, Math.min(1, fade)), frame / 53);
          await new Promise(done => setTimeout(done, 1000 / 30));
        }
      }
      recorder.stop();
      await new Promise(done => recorder.onstop = done);
      const link = document.createElement('a'); link.download = 'refeicao-facil-demo.webm';
      link.href = URL.createObjectURL(new Blob(chunks, { type: mimeType })); document.body.append(link); link.click();
      resolve({ mimeType, bytes: chunks.reduce((sum, chunk) => sum + chunk.size, 0) });
    } catch (error) { reject(String(error)); }
  }))()`;
  const result = await cdp.call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try { await access(output); break; } catch { await wait(250); }
  }
  await access(output);
  process.stdout.write(`vídeo gerado: ${output}\n`);
} finally {
  cdp?.close();
  browser.kill();
}
