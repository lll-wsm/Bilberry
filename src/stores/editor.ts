import { writable, derived } from "svelte/store";

/// Position range in the current document to select (anchor → head)
export const pendingNavRange = writable<{anchor: number; head: number} | null>(null);

/// Increment to trigger CodeMirror's find panel in the active editor
export const triggerFindCount = writable(0);

export type EditorMode = "split" | "preview" | "source" | "live";

interface EditorState {
  mode: EditorMode;
  showToolbar: boolean;
}

function createEditorStore() {
  const { subscribe, update, set } = writable<EditorState>({
    mode: "preview",
    showToolbar: true,
  });

  return {
    subscribe,

    setMode(mode: EditorMode) {
      update((s) => ({ ...s, mode }));
    },

    toggleToolbar() {
      update((s) => ({ ...s, showToolbar: !s.showToolbar }));
    },

    reset() {
      set({ mode: "preview", showToolbar: true });
    },
  };
}

export const editorStore = createEditorStore();
export const editorMode = derived(editorStore, ($e) => $e.mode);
