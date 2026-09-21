export type Theme = "light" | "dark";
export const THEME_KEY = "refeicao-facil:theme";
const CHANGE_EVENT = "refeicao:theme-change";

export function getTheme(): Theme {
  return typeof document !== "undefined" && document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#080D0B" : "#FBF1E0");
  document.dispatchEvent(new Event(CHANGE_EVENT));
}

export function setTheme(theme: Theme) {
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* Still switch in memory. */ }
  applyTheme(theme);
}

export function subscribeTheme(notify: () => void) {
  const syncStorage = (event: StorageEvent) => {
    if (event.key !== THEME_KEY && event.key !== null) return;
    // Ignore sessionStorage and unrelated stores; localStorage may be blocked.
    try { if (event.storageArea && event.storageArea !== localStorage) return; } catch { return; }
    applyTheme(event.newValue === "dark" ? "dark" : "light");
  };
  document.addEventListener(CHANGE_EVENT, notify);
  window.addEventListener("storage", syncStorage);
  return () => {
    document.removeEventListener(CHANGE_EVENT, notify);
    window.removeEventListener("storage", syncStorage);
  };
}
