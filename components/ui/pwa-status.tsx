"use client";

import { useEffect, useState } from "react";
import { Download, RefreshCw, WifiOff } from "lucide-react";

interface InstallPromptEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> }

export function PwaStatus() {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

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

  async function install() { if (!installPrompt) return; await installPrompt.prompt(); await installPrompt.userChoice; setInstallPrompt(null); }
  if (!online) return <span className="pwa-chip" role="status"><WifiOff size={15} /> Offline</span>;
  if (waiting) return <button className="pwa-chip pwa-action" type="button" onClick={() => waiting.postMessage("SKIP_WAITING")}><RefreshCw size={15} /> Atualizar</button>;
  if (installPrompt) return <button className="pwa-chip pwa-action" type="button" onClick={install}><Download size={15} /> Instalar</button>;
  return null;
}
