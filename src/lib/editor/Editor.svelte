<script lang="ts">
  import { onMount } from "svelte";
  import { EditorView, basicSetup } from "codemirror";
  import { lineNumbers } from "@codemirror/view";
  import { EditorState, Compartment } from "@codemirror/state";
  import { oneDark } from "@codemirror/theme-one-dark";
  import { createExtensions } from "./cm-extensions";
  import { theme } from "../../stores/theme";
  import { settingsStore } from "../../stores/settings";
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
  const lineNumbersCompartment = new Compartment();

  function getThemeExt($theme: string): Extension {
    const baseTheme = $theme === "dark" ? oneDark : [];
    const selectionTheme = EditorView.theme({
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
        backgroundColor: "var(--bg-active) !important",
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
    });
    return [baseTheme, selectionTheme];
  }

  onMount(() => {
    // Get initial values synchronously via one-shot subscriptions
    let initialTheme: Extension = [];
    theme.subscribe(($t) => { initialTheme = getThemeExt($t); })();

    const state = EditorState.create({
      doc: content,
      extensions: [
        basicSetup,
        ...createExtensions(),
        themeCompartment.of(initialTheme),
        lineNumbersCompartment.of($settingsStore.showLineNumbers ? lineNumbers() : []),
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

    // Reactive line numbers switch
    const unsubSettings = settingsStore.subscribe(($settings) => {
      try {
        view.dispatch({
          effects: lineNumbersCompartment.reconfigure($settings.showLineNumbers ? lineNumbers() : []),
        });
      } catch {
        // view destroyed
      }
    });

    return () => {
      unsubTheme();
      unsubSettings();
      isDestroyed = true;
      view.destroy();
    };
  });

  // Sync external content (file switching) to editor
  // Read content first to ensure it's tracked as a dependency
  // before checking view availability
  $effect(() => {
    const text = content;
    if (!view || isDestroyed) return;
    const current = view.state.doc.toString();
    if (text !== current) {
      isSyncing = true;
      view.dispatch({
        changes: { from: 0, to: current.length, insert: text },
      });
      isSyncing = false;
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
