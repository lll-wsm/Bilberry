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
  import { vaultStore } from "../../stores/vault";
  import type { Extension } from "@codemirror/state";

  let { content = "", readonly = false, onContentChange, onScrollChange, initialScrollRatio = null }: {
    content?: string;
    readonly?: boolean;
    onContentChange?: (text: string) => void;
    onScrollChange?: (ratio: number) => void;
    initialScrollRatio?: number | null;
  } = $props();

  let container: HTMLDivElement;
  let view: EditorView;
  let isDestroyed = false;
  let isSyncing = false;
  let scrollerEl: HTMLElement | null = null;
  let hasAppliedInitialScroll = false;
  let lastAppliedScrollRatio: number | null = null;

  function scrollEditorToRatio(ratio: number | null | undefined) {
    if (!scrollerEl || ratio == null) return;
    const maxScroll = scrollerEl.scrollHeight - scrollerEl.clientHeight;
    scrollerEl.scrollTop = maxScroll > 0 ? maxScroll * ratio : 0;
    lastAppliedScrollRatio = ratio;
  }

  const themeCompartment = new Compartment();
  const contentPath = $derived($vaultStore.currentFilePath);

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
      ".cm-activeLineGutter": {
        backgroundColor: "rgba(128, 128, 128, 0.1)",
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
          if (update.selectionSet && !isSyncing && contentPath) {
            const range = update.state.selection.main;
            vaultStore.updateScrollPosition(contentPath, { anchor: range.anchor, head: range.head });
          }
        }),
      ],
    });

    view = new EditorView({ state, parent: container });
    scrollerEl = container.querySelector(".cm-scroller");

    const handleScroll = () => {
      if (!scrollerEl || !onScrollChange) return;
      const maxScroll = scrollerEl.scrollHeight - scrollerEl.clientHeight;
      const ratio = maxScroll > 0 ? scrollerEl.scrollTop / maxScroll : 0;
      onScrollChange(ratio);
    };
    scrollerEl?.addEventListener("scroll", handleScroll, { passive: true });
    scrollEditorToRatio(initialScrollRatio);
    hasAppliedInitialScroll = true;
    handleScroll();

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
      scrollerEl?.removeEventListener("scroll", handleScroll);
      scrollerEl = null;
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

  $effect(() => {
    if (!view || !scrollerEl || !hasAppliedInitialScroll) return;
    if (initialScrollRatio == null) return;
    if (lastAppliedScrollRatio !== null && Math.abs(lastAppliedScrollRatio - initialScrollRatio) < 0.001) return;
    scrollEditorToRatio(initialScrollRatio);
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
