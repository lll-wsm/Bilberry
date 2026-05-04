<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { EditorView, basicSetup } from "codemirror";
  import { EditorState, Compartment } from "@codemirror/state";
  import { openSearchPanel } from "@codemirror/search";
  import { oneDark } from "@codemirror/theme-one-dark";
  import { createExtensions } from "./cm-extensions";
  import { theme } from "../../stores/theme";
  import { settingsStore } from "../../stores/settings";
  import { pendingNavRange, triggerFindCount } from "../../stores/editor";
  import type { Extension } from "@codemirror/state";

  let { content = "", readonly = false, onContentChange }: {
    content?: string;
    readonly?: boolean;
    onContentChange?: (text: string) => void;
  } = $props();

  let container: HTMLDivElement;
  let view: EditorView;
  let isDestroyed = false;
  let isSyncing = false;

  const themeCompartment = new Compartment();

  function getThemeExt($theme: string): Extension {
    const baseTheme = $theme === "dark" ? oneDark : [];
    const selectionTheme = EditorView.theme({
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
        backgroundColor: "var(--selection-bg) !important",
      },
      ".cm-cursor": {
        borderLeftColor: "var(--text-normal)",
      },
      "&.cm-focused .cm-cursor": {
        borderLeftColor: "var(--interactive-accent)",
      },
      ".cm-activeLine": {
        backgroundColor: "rgba(128, 128, 128, 0.05)",
      },
      ".cm-gutters": {
        backgroundColor: "var(--bg-secondary) !important",
        borderRight: "1px solid var(--border-divider)",
      },
      ".cm-lineNumbers .cm-gutterElement": {
        color: "var(--text-muted) !important",
      },
    });
    return [baseTheme, selectionTheme];
  }

  onMount(() => {
    // Get initial theme value synchronously via one-shot subscription
    let initialTheme: Extension = [];
    const tmp = theme.subscribe(($t) => { initialTheme = getThemeExt($t); });
    tmp();

    const state = EditorState.create({
      doc: content,
      extensions: [
        basicSetup,
        ...createExtensions(),
        themeCompartment.of(initialTheme),
        EditorView.editable.of(!readonly),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !isSyncing && onContentChange) {
            onContentChange(update.state.doc.toString());
          }
        }),
      ],
    });

    view = new EditorView({ state, parent: container });

    // Reactive theme switch
    const unsubTheme = theme.subscribe(($theme) => {
      try {
        view.dispatch({
          effects: themeCompartment.reconfigure(getThemeExt($theme)),
        });
      } catch {
        // view destroyed
      }
    });

    return () => {
      unsubTheme();
      isDestroyed = true;
      view.destroy();
    };
  });

  // Sync external content, apply cursor navigation, and handle find requests.
  // Uses untrack() when writing back to stores to avoid reactive re-triggers.
  $effect(() => {
    const text = content;
    const navRange = $pendingNavRange;
    const findTick = $triggerFindCount;
    if (!view || isDestroyed) return;
    const current = view.state.doc.toString();

    // Sync content
    if (text !== current) {
      isSyncing = true;
      view.dispatch({
        changes: { from: 0, to: current.length, insert: text },
      });
      isSyncing = false;
    }

    // Navigate cursor and select match range after content is synced
    if (navRange !== null) {
      const anchor = Math.min(navRange.anchor, view.state.doc.length);
      const head = Math.min(navRange.head, view.state.doc.length);
      view.dispatch({
        selection: { anchor, head },
        effects: [EditorView.scrollIntoView(head, { y: "center" })],
      });
      view.focus();
      untrack(() => pendingNavRange.set(null));
    }

    // Open find panel on request (focus editor first so the input gets focus)
    if (findTick > 0) {
      view.focus();
      openSearchPanel(view);
      untrack(() => triggerFindCount.set(0));
    }
  });
</script>

<div
  bind:this={container}
  class="editor-container"
  style:font-size="{$settingsStore.fontSize}px"
  style:font-family={$settingsStore.fontFamily}
  style:line-height={$settingsStore.lineHeight}
></div>

<style>
  .editor-container {
    flex: 1;
    overflow: hidden;
  }

  .editor-container :global(.cm-editor) {
    height: 100%;
  }

  .editor-container :global(.cm-scroller) {
    font-family: inherit;
    font-size: inherit;
    line-height: inherit;
  }

  .editor-container :global(.cm-editor.cm-focused) {
    outline: none;
  }
</style>
