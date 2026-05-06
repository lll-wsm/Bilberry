import { writable } from "svelte/store";

export type Theme = "light" | "dark" | "system";

function getSystemTheme(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function createThemeStore() {
  // Load initial preference from localStorage or default to system
  const saved = localStorage.getItem("theme-preference") as Theme | null;
  const initial: Theme = saved || "system";
  
  const { subscribe, set, update } = writable<Theme>(initial);

  // Apply theme to document
  function applyTheme(t: Theme) {
    const root = document.documentElement;
    const effectiveTheme = t === "system" ? getSystemTheme() : t;
    
    root.classList.remove("light", "dark");
    root.classList.add(effectiveTheme);
    root.style.colorScheme = effectiveTheme;
    
    if (t !== "system") {
      localStorage.setItem("theme-preference", t);
    } else {
      localStorage.removeItem("theme-preference");
    }
  }

  // Initial apply
  if (typeof window !== "undefined") {
    applyTheme(initial);
    
    // Listen for OS theme changes
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
      let current: Theme = "system";
      subscribe(v => current = v)();
      if (current === "system") {
        applyTheme("system");
      }
    });
  }

  return {
    subscribe,
    set: (t: Theme) => {
      set(t);
      applyTheme(t);
    },
    toggle: () => {
      update((t) => {
        const next = t === "light" ? "dark" : "light";
        applyTheme(next);
        return next;
      });
    },
    setSystem: () => {
      set("system");
      applyTheme("system");
    }
  };
}

export const theme = createThemeStore();

