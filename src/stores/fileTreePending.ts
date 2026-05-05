import { writable } from "svelte/store";

export interface PendingCreation {
  parentPath: string;
  type: "file" | "directory";
}

function createFileTreePending() {
  const { subscribe, set } = writable<PendingCreation | null>(null);

  return {
    subscribe,
    start(parentPath: string, type: "file" | "directory") {
      set({ parentPath, type });
    },
    clear() {
      set(null);
    },
  };
}

export const fileTreePending = createFileTreePending();
