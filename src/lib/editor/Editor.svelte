<script lang="ts">
  import { onMount } from "svelte";
  import { EditorView, basicSetup } from "codemirror";
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

  function getThemeExt($theme: string): Extension {
    return $theme === "dark" ? oneDark : [];
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
