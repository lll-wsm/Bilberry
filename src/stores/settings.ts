import { writable } from "svelte/store";

export interface Settings {
  fontSize: number;
  fontFamily: string;
  lineHeight: number;
  autoSave: boolean;
  autoSaveDelay: number;
  sidebarWidth: number;
}

const defaultSettings: Settings = {
  fontSize: 14,
  fontFamily: "SF Mono, Fira Code, Cascadia Code, monospace",
  lineHeight: 1.6,
  autoSave: true,
  autoSaveDelay: 1000,
  sidebarWidth: 240,
};

function loadFromStorage(): Settings {
  try {
    const stored = localStorage.getItem("bilberry-settings");
    if (stored) {
      return { ...defaultSettings, ...JSON.parse(stored) };
    }
  } catch {}
  return defaultSettings;
}

function saveToStorage(s: Settings) {
  try {
    localStorage.setItem("bilberry-settings", JSON.stringify(s));
  } catch {}
}

function createSettingsStore() {
  const initial = loadFromStorage();
  const { subscribe, update, set } = writable<Settings>(initial);

  return {
    subscribe,

    updateSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
      update((s) => {
        const updated = { ...s, [key]: value };
        saveToStorage(updated);
        return updated;
      });
    },

    reset() {
      set(defaultSettings);
      saveToStorage(defaultSettings);
    },
  };
}

export const settingsStore = createSettingsStore();
