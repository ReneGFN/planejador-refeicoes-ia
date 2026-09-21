"use client";

import { useEffect, useState } from "react";
import { Download, RefreshCw, Share2, WifiOff, X } from "lucide-react";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export async function requestInstallation(event: InstallPromptEvent) {
  await event.prompt();
  return event.userChoice;
}

export function needsIosInstallHelp(userAgent: string, standalone: boolean) {
  return /iPad|iPhone|iPod/u.test(userAgent) && !standalone;
}

export function PwaStatus() {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [installNotice, setInstallNotice] = useState("");
  const [showIosHelp, setShowIosHelp] = useState(false);
  const iosInstallHelp = needsIosInstallHelp(navigator.userAgent, window.matchMedia("(display-mode: standalone)").matches);

  useEffect(() => {
    const onlineHandler = () => setOnline(true), offlineHandler = () => setOnline(false);
    const installHandler = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPromptEvent); };
    const installedHandler = () => setInstallPrompt(null);
    window.addEventListener("online", onlineHandler); window.addEventListener("offline", offlineHandler);
    window.addEventListener("beforeinstallprompt", installHandler); window.addEventListener("appinstalled", installedHandler);
    let disposed = false;
    if ("serviceWorker" in navigator && (window.isSecureContext || ["localhost", "127.0.0.1"].includes(location.hostname))) {
      navigator.serviceWorker.register("/sw.js").then(registration => {
        if (disposed) return;
        if (registration.waiting) setWaiting(registration.waiting);
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          worker?.addEventListener("statechange", () => { if (worker.state === "installed" && navigator.serviceWorker.controller) setWaiting(worker); });
        });
      }).catch(() => undefined);
    }
    const reload = () => location.reload();
    navigator.serviceWorker?.addEventListener("controllerchange", reload);
    return () => {
      disposed = true;
      window.removeEventListener("online", onlineHandler); window.removeEventListener("offline", offlineHandler);
      window.removeEventListener("beforeinstallprompt", installHandler); window.removeEventListener("appinstalled", installedHandler);
      navigator.serviceWorker?.removeEventListener("controllerchange", reload);
    };
  }, []);

  async function install() {
    if (!installPrompt || isInstalling) return;

    setIsInstalling(true);
    setInstallNotice("");
    try {
      // O browser exige que prompt() seja chamado por uma ação explícita da pessoa.
      await requestInstallation(installPrompt);
      setInstallPrompt(null);
    } catch {
      setInstallNotice("Não foi possível abrir a instalação agora. Tente novamente.");
    } finally {
      setIsInstalling(false);
    }
  }

  if (!online) return <span className="pwa-chip" role="status"><WifiOff size={15} /> Offline</span>;
  if (waiting) return <button className="pwa-chip pwa-action" type="button" onClick={() => waiting.postMessage("SKIP_WAITING")}><RefreshCw size={15} /> Atualizar</button>;
  if (installPrompt) return <><button className="pwa-chip pwa-action" type="button" onClick={install} disabled={isInstalling} aria-label="Instalar o aplicativo Refeição Fácil"><Download size={15} /> {isInstalling ? "Abrindo…" : "Instalar app"}</button><span className="sr-only" role="status" aria-live="polite">{installNotice}</span></>;
  if (iosInstallHelp) return <><button className="pwa-chip pwa-action" type="button" onClick={() => setShowIosHelp(true)}><Share2 size={15} /> Como instalar</button>{showIosHelp && <div className="install-help" role="dialog" aria-modal="true" aria-labelledby="install-help-title"><div><button type="button" className="icon" aria-label="Fechar instruções de instalação" onClick={() => setShowIosHelp(false)}><X size={18} /></button><h2 id="install-help-title">Instalar Refeição Fácil</h2><p>No Safari, toque em Compartilhar e depois em <strong>Adicionar à Tela de Início</strong>.</p></div></div>}</>;
  return null;
}
