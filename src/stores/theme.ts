import { writable, get } from "svelte/store";
import { settingsStore } from "./settings";

export type Theme = "light" | "dark" | "system";

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function createThemeStore() {
  const { subscribe, set } = writable<Theme>("system");

  // Apply theme to document
  function applyThemeToDOM(t: Theme) {
    if (typeof window === "undefined") return;
    const root = document.documentElement;
    const effectiveTheme = t === "system" ? getSystemTheme() : t;
    
    root.classList.remove("light", "dark");
    root.classList.add(effectiveTheme);
    root.style.colorScheme = effectiveTheme;
  }

  // Subscribe to settings changes
  settingsStore.subscribe(($s) => {
    set($s.theme);
    applyThemeToDOM($s.theme);
  });

  // Listen for OS theme changes
  if (typeof window !== "undefined") {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      const currentSettings = get(settingsStore);
      if (currentSettings.theme === "system") {
        applyThemeToDOM("system");
      }
    });
  }

  return {
    subscribe,
    set: (t: Theme) => {
      settingsStore.updateSetting("theme", t);
    },
    toggle: () => {
      const current = get(settingsStore).theme;
      const next = current === "light" ? "dark" : "light";
      settingsStore.updateSetting("theme", next);
    },
    setSystem: () => {
      settingsStore.updateSetting("theme", "system");
    }
  };
}

export const theme = createThemeStore();


