import { writable, get } from "svelte/store";

export interface ClipboardEntry {
  action: "cut" | "copy";
  path: string;
}

function createFileClipboard() {
  const { subscribe, set } = writable<ClipboardEntry | null>(null);

  return {
    subscribe,
    cut(path: string) {
      set({ action: "cut", path });
    },
    copy(path: string) {
      set({ action: "copy", path });
    },
    clear() {
      set(null);
    },
  };
}

export const fileClipboard = createFileClipboard();
