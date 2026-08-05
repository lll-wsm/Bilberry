import { writable } from "svelte/store";
import { loadDataFile, saveDataFile } from "./persistence";
import { previewThemes } from "../lib/themes/preview-themes";

const FILE_NAME = "settings.json";

export type Language = "system" | "zh" | "en";

export interface Settings {
  fontSize: number;
  fontFamily: string;
  lineHeight: number;
  autoSave: boolean;
  autoSaveDelay: number;
  sidebarWidth: number;
  previewTheme: string;
  theme: "light" | "dark" | "system";
  showHiddenFiles: boolean;
  language: Language;
}

const defaultSettings: Settings = {
  fontSize: 14,
  fontFamily: "SF Mono, Fira Code, Cascadia Code, monospace",
  lineHeight: 1.6,
  autoSave: true,
  autoSaveDelay: 1000,
  sidebarWidth: 240,
  previewTheme: "system",
  theme: "system",
  showHiddenFiles: true,
  language: "system",
};

function createSettingsStore() {
  const { subscribe, update, set } = writable<Settings>(defaultSettings);

  // Load persisted settings on init
  loadDataFile(FILE_NAME, defaultSettings).then((s) => set(s));

  return {
    subscribe,

    updateSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
      update((s) => {
        const updated = { ...s, [key]: value };
        saveDataFile(FILE_NAME, updated);
        return updated;
      });
    },

    /**
     * Set the app base theme (light / dark / system) from a quick menu,
     * keeping the preview theme in sync:
     * - "system" resets the preview to follow the OS (the Settings modal's
     *   "follow system" option).
     * - An explicit mode keeps the current preview theme when it already
     *   matches that mode, and otherwise falls back to the default light/dark
     *   preview theme ("default" / "cobalt" — the same pair used for
     *   system mode).
     */
    setThemeMode(mode: "light" | "dark" | "system") {
      update((s) => {
        let previewTheme = s.previewTheme;
        if (mode === "system") {
          previewTheme = "system";
        } else {
          const current = previewThemes.find((t) => t.id === previewTheme);
          if (!current || current.mode !== mode) {
            previewTheme = mode === "dark" ? "cobalt" : "default";
          }
        }
        const updated = { ...s, theme: mode, previewTheme };
        saveDataFile(FILE_NAME, updated);
        return updated;
      });
    },

    /**
     * Select a specific preview theme by id. Derives the app mode (light/dark)
     * from the theme's declared mode so the UI chrome and the `theme` store
     * stay in sync with the selected preview theme.
     */
    setPreviewTheme(themeId: string) {
      update((s) => {
        const themeInfo = previewThemes.find((t) => t.id === themeId);
        const mode = themeInfo?.mode ?? "light";
        const updated = { ...s, previewTheme: themeId, theme: mode };
        saveDataFile(FILE_NAME, updated);
        return updated;
      });
    },

    reset() {
      set(defaultSettings);
      saveDataFile(FILE_NAME, defaultSettings);
    },
  };
}

export const settingsStore = createSettingsStore();
