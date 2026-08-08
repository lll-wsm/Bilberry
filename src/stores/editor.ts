import { writable, derived } from "svelte/store";
import type { EditorView } from "@codemirror/view";

/// Position range in the current document to select (anchor → head)
export const pendingNavRange = writable<{anchor: number; head: number; scrollRatio?: number} | null>(null);

/// Increment to trigger the unified find widget
export const triggerFindCount = writable(0);

/// Holds the active CodeMirror EditorView instance (set by Editor.svelte on mount)
export const editorViewStore = writable<EditorView | null>(null);

/// Holds the preview's `.markdown-body` container element (set by Preview.svelte)
export const previewContainerStore = writable<HTMLElement | null>(null);

/// Increments each time the preview re-renders its HTML, so the FindWidget
/// can re-run its DOM search without receiving the HTML as a prop.
export const previewRenderVersion = writable(0);

export type EditorMode = "split" | "preview" | "source";

interface EditorState {
  mode: EditorMode;
  showToolbar: boolean;
  markdownMode: EditorMode;
}

function createEditorStore() {
  const { subscribe, update, set } = writable<EditorState>({
    mode: "preview",
    showToolbar: true,
    markdownMode: "preview",
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
      set({ mode: "preview", showToolbar: true, markdownMode: "preview" });
    },
  };
}

export const editorStore = createEditorStore();
export const editorMode = derived(editorStore, ($e) => $e.mode);
