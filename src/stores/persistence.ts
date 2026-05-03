import { invoke } from "@tauri-apps/api/core";

// Legacy localStorage keys for migration
const MIGRATIONS: Record<string, string> = {
  "vault-history.json": "bilberry-vault-history",
  "file-encodings.json": "bilberry-file-encodings",
  "settings.json": "bilberry-settings",
};

function merge<T>(defaults: T, parsed: unknown): T {
  if (Array.isArray(defaults)) {
    return (Array.isArray(parsed) ? parsed : defaults) as T;
  }
  if (typeof defaults === "object" && defaults !== null) {
    return { ...defaults, ...(typeof parsed === "object" && parsed !== null ? parsed : {}) } as T;
  }
  return parsed as T ?? defaults;
}

export async function loadDataFile<T>(filename: string, defaults: T): Promise<T> {
  try {
    const content = await invoke<string>("load_data_file", { filename });
    return merge(defaults, JSON.parse(content));
  } catch {
    // File doesn't exist yet — try migrating from localStorage
    const legacyKey = MIGRATIONS[filename];
    if (legacyKey) {
      try {
        const legacy = localStorage.getItem(legacyKey);
        if (legacy) {
          const parsed = JSON.parse(legacy);
          await invoke("save_data_file", { filename, content: legacy });
          return merge(defaults, parsed);
        }
      } catch {}
    }
    return defaults;
  }
}

export async function saveDataFile(filename: string, data: unknown): Promise<void> {
  await invoke("save_data_file", { filename, content: JSON.stringify(data) });
}
