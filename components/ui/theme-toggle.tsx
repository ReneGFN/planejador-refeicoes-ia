"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { getTheme, setTheme, subscribeTheme } from "@/lib/theme";

interface ThemeToggleProps { className?: string }

export function ThemeToggle({ className }: ThemeToggleProps) {
  const theme = useSyncExternalStore(subscribeTheme, getTheme, () => "light");
  const isDark = theme === "dark";

  return (
    <button type="button" role="switch" aria-checked={isDark} aria-label="Tema escuro"
      title={isDark ? "Ativar tema claro" : "Ativar tema escuro"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={cn("theme-toggle relative inline-flex shrink-0 items-center justify-center", className)}>
      <span className="theme-toggle-track relative flex h-8 w-16 items-center justify-between rounded-full border p-1" aria-hidden="true">
        <span className="theme-toggle-thumb absolute h-6 w-6 rounded-full" />
        <span className="relative flex h-6 w-6 shrink-0 items-center justify-center"><Moon className="h-4 w-4" strokeWidth={1.5} /></span>
        <span className="relative flex h-6 w-6 shrink-0 items-center justify-center"><Sun className="h-4 w-4" strokeWidth={1.5} /></span>
      </span>
    </button>
  );
}
