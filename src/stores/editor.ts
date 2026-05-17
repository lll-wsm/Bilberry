import { writable, derived } from "svelte/store";

/// Position range in the current document to select (anchor → head)
export const pendingNavRange = writable<{anchor: number; head: number} | null>(null);

/// Increment to trigger CodeMirror's find panel in the active editor
export const triggerFindCount = writable(0);

export type EditorMode = "split" | "preview" | "source" | "live";

interface EditorState {
  mode: EditorMode;
  showToolbar: boolean;
  markdownMode: EditorMode;
}

function createEditorStore() {
  const { subscribe, update, set } = writable<EditorState>({
    mode: "live",
    showToolbar: true,
    markdownMode: "live",
  });

  return {
    subscribe,

    setMode(mode: EditorMode) {
      update((s) => ({ ...s, mode, markdownMode: mode }));
    },

    syncModeForFile(isMarkdown: boolean) {
      update((s) => {
        if (isMarkdown) {
          return {
            ...s,
            mode: s.markdownMode,
          };
        }

        return {
          ...s,
          mode: "source",
          markdownMode: s.mode,
        };
      });
    },

    toggleToolbar() {
      update((s) => ({ ...s, showToolbar: !s.showToolbar }));
    },

    reset() {
      set({ mode: "live", showToolbar: true, markdownMode: "live" });
    },
  };
}

export const editorStore = createEditorStore();
export const editorMode = derived(editorStore, ($e) => $e.mode);
