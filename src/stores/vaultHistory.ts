import { invoke } from "@tauri-apps/api/core";
import { loadDataFile, saveDataFile } from "./persistence";

const FILE_NAME = "vault-history.json";
const MAX_HISTORY = 5;

export async function loadHistory(): Promise<string[]> {
  const data = await loadDataFile<string[]>(FILE_NAME, []);
  return Array.isArray(data) ? data.slice(0, MAX_HISTORY) : [];
}

export async function addToHistory(path: string): Promise<void> {
  const history = await loadHistory();
  const filtered = history.filter((p) => p !== path);
  await saveDataFile(FILE_NAME, [path, ...filtered].slice(0, MAX_HISTORY));
}

export async function removeFromHistory(path: string): Promise<void> {
  const history = await loadHistory();
  await saveDataFile(FILE_NAME, history.filter((p) => p !== path));
}

export interface RecentEntry {
  path: string;
  kind: string; // "vault" | "file"
  timestamp: number;
}

export async function getRecentList(): Promise<RecentEntry[]> {
  try {
    return await invoke<RecentEntry[]>("get_recent_list");
  } catch {
    return [];
  }
}

export async function addToRecent(path: string, kind: string): Promise<void> {
  try {
    await invoke("add_to_recent", { path, kind });
    // Refresh menu to reflect updated recent list
    await invoke("refresh_menu");
  } catch (e) {
    console.error("Failed to add recent:", e);
  }
}

export async function removeFromRecent(path: string): Promise<void> {
  try {
    await invoke("remove_from_recent", { path });
    await invoke("refresh_menu");
  } catch (e) {
    console.error("Failed to remove recent:", e);
  }
}
