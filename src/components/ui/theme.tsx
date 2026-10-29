"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export type Theme = "dark" | "light";

const STORAGE_KEY = "veda-theme";
const listeners = new Set<() => void>();

function readTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  // Another tab changed the saved theme: apply it here and notify subscribers.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    if (event.newValue === "light" || event.newValue === "dark") {
      document.documentElement.dataset.theme = event.newValue;
    }
    callback();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", onStorage);
  };
}

export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Private mode or blocked storage: the theme still applies for this visit.
  }
  listeners.forEach((listener) => listener());
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, readTheme, () => "dark");
}

// Both icons are rendered and CSS shows one (by data-theme), so the server HTML is right for every saved theme.
// The label does not change with the theme; aria-pressed tells the state (pressed = light theme).
export function ThemeToggle({ className }: { className?: string }) {
  const theme = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon-touch"
      className={className}
      aria-label="Toggle theme"
      title="Toggle theme"
      aria-pressed={theme === "light"}
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
    >
      <Sun size={18} aria-hidden="true" className="hidden [:root[data-theme=dark]_&]:block" />
      <Moon size={18} aria-hidden="true" className="hidden [:root[data-theme=light]_&]:block" />
    </Button>
  );
}
