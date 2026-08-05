import { derived } from "svelte/store";
import { settingsStore } from "./settings";

export type Theme = "light" | "dark";

function getSystemTheme(): Theme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export const theme = derived(settingsStore, ($s) => {
  return $s.theme === "system" ? getSystemTheme() : $s.theme;
});
