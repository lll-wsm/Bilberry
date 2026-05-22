import { writable } from "svelte/store";
import { loadDataFile, saveDataFile } from "./persistence";

const FILE_NAME = "settings.json";

export interface Settings {
  fontSize: number;
  fontFamily: string;
  lineHeight: number;
  autoSave: boolean;
  autoSaveDelay: number;
  sidebarWidth: number;
  previewTheme: string;
  theme: "light" | "dark" | "system";
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

    reset() {
      set(defaultSettings);
      saveDataFile(FILE_NAME, defaultSettings);
    },
  };
}

export const settingsStore = createSettingsStore();
