import { invoke } from "@tauri-apps/api/core";

export interface SessionData {
  activeTab: string | null;
  scrollPositions: Record<string, { anchor: number; head: number }>;
}

export async function saveSession(vaultPath: string, data: SessionData) {
  try {
    await invoke("save_data_file", {
      filename: `session_${btoa(encodeURIComponent(vaultPath)).replace(/=+$/, "")}.json`,
      content: JSON.stringify(data),
    });
  } catch (e) {
    console.error("Failed to save session:", e);
  }
}

export async function loadSession(vaultPath: string): Promise<SessionData | null> {
  try {
    const raw = await invoke<string>("load_data_file", {
      filename: `session_${btoa(encodeURIComponent(vaultPath)).replace(/=+$/, "")}.json`,
    });
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}
