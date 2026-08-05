<script lang="ts">
import { onMount, untrack, tick } from "svelte";
  import { EditorView, basicSetup } from "codemirror";
  import { EditorState, Compartment, Prec } from "@codemirror/state";
  import { openSearchPanel } from "@codemirror/search";
  import { oneDark } from "@codemirror/theme-one-dark";
  import { createExtensions, getLanguageExtension } from "./cm-extensions";
  import { theme } from "../../stores/theme";
  import { settingsStore } from "../../stores/settings";
  import { pendingNavRange, triggerFindCount } from "../../stores/editor";
  import { vaultStore } from "../../stores/vault";
  import type { Extension } from "@codemirror/state";
  import LinkPreview from "../ui/LinkPreview.svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { resolveRelativePath } from "../preview/markdown";

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
  let isLocalEdit = false;
  let scrollerEl: HTMLElement | null = null;
  let hasAppliedInitialScroll = false;
  let lastAppliedScrollRatio: number | null = null;

  // Link preview and navigation state
  let previewVisible = $state(false);
  let previewContent = $state("");
  let previewX = $state(0);
  let previewY = $state(0);
  let previewPlacement = $state<"top" | "bottom">("bottom");
  let hoverTimeout: ReturnType<typeof setTimeout> | null = null;
  let hoveredLinkRange: { start: number; end: number } | null = null;

  function clearHover() {
    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
      hoverTimeout = null;
    }
    setTimeout(() => {
      const popover = document.querySelector(".link-preview-popover:hover");
      if (!popover) {
        previewVisible = false;
        hoveredLinkRange = null;
      }
    }, 100);
  }

  const findFile = (entries: any[], targetPath: string): string | null => {
    const normalizedTarget = targetPath.toLowerCase().replace(/\.md$/i, "");
    
    for (const entry of entries) {
      if (!entry.is_dir) {
        const entryPath = entry.path.toLowerCase();
        if (entryPath === targetPath.toLowerCase() || entryPath === (targetPath + ".md").toLowerCase()) {
          return entry.path;
        }
        
        const entryNameNoExt = entry.name.toLowerCase().replace(/\.md$/i, "");
        
        if (entryPath.endsWith(normalizedTarget + ".md") || entryPath.endsWith(normalizedTarget)) {
          return entry.path;
        }
        
        if (entryNameNoExt === normalizedTarget || entryNameNoExt === normalizedTarget.split("/").pop()) {
          return entry.path;
        }
      }
      
      if (entry.children) {
        const found = findFile(entry.children, targetPath);
        if (found) return found;
      }
    }
    return null;
  };

  interface LinkMatch {
    type: "wikilink" | "markdown";
    target: string;
    start: number;
    end: number;
  }

  function findLinkAtPosition(text: string, pos: number): LinkMatch | null {
    // 1. Wikilinks [[target]] or [[target|alias]]
    const wikilinkRegex = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;
    let match;
    while ((match = wikilinkRegex.exec(text)) !== null) {
      const start = match.index;
      const end = wikilinkRegex.lastIndex;
      if (pos >= start && pos < end) {
        return {
          type: "wikilink",
          target: match[1].trim(),
          start,
          end
        };
      }
    }

    // 2. Markdown links: [text](target)
    const mdLinkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
    while ((match = mdLinkRegex.exec(text)) !== null) {
      const start = match.index;
      const end = mdLinkRegex.lastIndex;
      if (pos >= start && pos < end) {
        const target = match[2].trim();
        if (!/^(https?:\/\/|mailto:|tel:|data:|blob:|javascript:)/i.test(target)) {
          return {
            type: "markdown",
            target,
            start,
            end
          };
        }
      }
    }

    return null;
  }

  function scrollEditorToRatio(ratio: number | null | undefined) {
    if (!scrollerEl || ratio == null) return;
    const maxScroll = scrollerEl.scrollHeight - scrollerEl.clientHeight;
    scrollerEl.scrollTop = maxScroll > 0 ? maxScroll * ratio : 0;
    lastAppliedScrollRatio = ratio;
  }

  const themeCompartment = new Compartment();
  const languageCompartment = new Compartment();
  const contentPath = $derived($vaultStore.currentFilePath);

  function getThemeExt($theme: string): Extension {
    const baseTheme = $theme === "dark" ? oneDark : [];
    const selectionTheme = Prec.highest(EditorView.theme({
      "&": {
        backgroundColor: "var(--bg-primary) !important",
      },
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
        borderRight: "none",
      },
      ".cm-lineNumbers .cm-gutterElement": {
        color: "var(--text-muted) !important",
      },
    }));
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
        languageCompartment.of(getLanguageExtension(contentPath)),
        themeCompartment.of(initialTheme),
        EditorView.editable.of(!readonly),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !isSyncing && onContentChange) {
            isLocalEdit = true;
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

    const handleMouseMove = (e: MouseEvent) => {
      if (!view || isDestroyed) return;

      const hasModifier = e.metaKey || e.ctrlKey;
      if (!hasModifier) {
        if (scrollerEl) scrollerEl.style.cursor = "";
        clearHover();
        return;
      }

      // Convert coordinates to document position
      const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
      if (pos === null) {
        if (scrollerEl) scrollerEl.style.cursor = "";
        clearHover();
        return;
      }

      // Get line details
      let line;
      try {
        line = view.state.doc.lineAt(pos);
      } catch (err) {
        if (scrollerEl) scrollerEl.style.cursor = "";
        clearHover();
        return;
      }

      const relativePos = pos - line.from;
      const link = findLinkAtPosition(line.text, relativePos);

      if (link) {
        // Change cursor to pointer
        if (scrollerEl) scrollerEl.style.cursor = "pointer";

        // Calculate absolute range in document
        const startDocPos = line.from + link.start;
        const endDocPos = line.from + link.end;

        // Check if we are still hovering the same link
        if (hoveredLinkRange && hoveredLinkRange.start === startDocPos && hoveredLinkRange.end === endDocPos) {
          return;
        }

        hoveredLinkRange = { start: startDocPos, end: endDocPos };

        if (hoverTimeout) clearTimeout(hoverTimeout);

        hoverTimeout = setTimeout(async () => {
          const targetVal = link.target;
          console.log("[Editor Hover] Detected link hover:", targetVal);

          let fileName = decodeURIComponent(targetVal);
          let fullPath: string | null = null;
          
          if (contentPath) {
            try {
              const absPath = resolveRelativePath(decodeURIComponent(targetVal), contentPath);
              console.log("[Editor Hover] contentPath:", contentPath, "-> Resolving relative path:", absPath);
              fullPath = findFile($vaultStore.fileTree, absPath);
            } catch (err) {
              console.error("[Editor Hover] Error resolving path relative to contentPath:", err);
            }
          }
          
          if (!fullPath) {
            console.log("[Editor Hover] File not found by relative path, falling back to name search:", fileName);
            fullPath = findFile($vaultStore.fileTree, fileName);
          }

          console.log("[Editor Hover] findFile result fullPath:", fullPath);

          if (fullPath) {
            try {
              const content = await invoke<string>("read_note", { path: fullPath, encoding: "UTF-8" });
              previewContent = content; // Show all content
              
              const startCoords = view.coordsAtPos(startDocPos);
              if (startCoords) {
                previewX = startCoords.left;
                
                // Adjust X if too close to right edge
                if (previewX + 420 > window.innerWidth) {
                  previewX = window.innerWidth - 440;
                }
                
                // Determine placement based on bottom boundaries
                if (startCoords.bottom + 8 + 350 > window.innerHeight) {
                  previewPlacement = "top";
                  previewY = window.innerHeight - startCoords.top + 8;
                } else {
                  previewPlacement = "bottom";
                  previewY = startCoords.bottom + 8;
                }
                
                previewVisible = true;
              }
            } catch (err) {
              console.error("[Editor Hover] Failed to load preview content:", err);
            }
          }
        }, 400);
      } else {
        if (scrollerEl) scrollerEl.style.cursor = "";
        clearHover();
      }
    };

    const handleMouseClick = async (e: MouseEvent) => {
      if (!view || isDestroyed) return;

      const hasModifier = e.metaKey || e.ctrlKey;
      if (!hasModifier) return;

      const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
      if (pos === null) return;

      let line;
      try {
        line = view.state.doc.lineAt(pos);
      } catch (err) {
        return;
      }

      const relativePos = pos - line.from;
      const link = findLinkAtPosition(line.text, relativePos);

      if (link) {
        e.preventDefault();
        e.stopPropagation();

        const targetVal = link.target;
        if (/^(https?:\/\/|mailto:|tel:)/i.test(targetVal)) {
          try {
            const { open } = await import("@tauri-apps/plugin-shell");
            await open(targetVal);
          } catch (err) {
            console.error("Failed to open external link using tauri-plugin-shell:", err);
          }
          return;
        }

        let fileName = decodeURIComponent(targetVal);
        let fullPath: string | null = null;
        
        if (contentPath) {
          try {
            const absPath = resolveRelativePath(decodeURIComponent(targetVal), contentPath);
            console.log("[Editor Click] contentPath:", contentPath, "-> Resolving relative path:", absPath);
            fullPath = findFile($vaultStore.fileTree, absPath);
          } catch (err) {
            console.error("[Editor Click] Error resolving path relative to contentPath:", err);
          }
        }
        
        if (!fullPath) {
          console.log("[Editor Click] File not found by relative path, falling back to name search:", fileName);
          fullPath = findFile($vaultStore.fileTree, fileName);
        }

        console.log("[Editor Click] Final matched fullPath:", fullPath);
        if (fullPath) {
          vaultStore.openNote(fullPath);
        } else {
          console.warn("[Editor Click] Could not find note path in vault:", targetVal);
        }
      }
    };

    const handleMouseLeave = () => {
      if (scrollerEl) scrollerEl.style.cursor = "";
      clearHover();
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Control" || e.key === "Meta") {
        if (scrollerEl) scrollerEl.style.cursor = "";
        clearHover();
      }
    };

    scrollerEl?.addEventListener("mousemove", handleMouseMove);
    scrollerEl?.addEventListener("click", handleMouseClick, true); // Intercept during capture phase
    scrollerEl?.addEventListener("mouseleave", handleMouseLeave);
    window.addEventListener("keyup", handleKeyUp);


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
      window.removeEventListener("keyup", handleKeyUp);
      scrollerEl?.removeEventListener("scroll", handleScroll);
      scrollerEl?.removeEventListener("mousemove", handleMouseMove);
      scrollerEl?.removeEventListener("click", handleMouseClick, true);
      scrollerEl?.removeEventListener("mouseleave", handleMouseLeave);
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

    // Sync content — but skip when the change originated from the editor
    // itself (user typing).  Without this guard the reactive round-trip
    // (editor → store → prop → $effect) causes a full-document replacement
    // that destroys cursor position and scroll state, especially on large files.
    if (text !== current) {
      if (isLocalEdit) {
        isLocalEdit = false;
      } else {
        isSyncing = true;
        view.dispatch({
          changes: { from: 0, to: current.length, insert: text },
        });
        isSyncing = false;
        // Content (and thus line metrics) changed - force a fresh viewport
        // measurement so posAtCoords/clicks never rely on stale coordinates.
        tick().then(() => {
          if (view && !isDestroyed) view.requestMeasure();
        });
      }
    } else {
      isLocalEdit = false;
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

  // Switch the language parser when the active file changes so that only
  // Markdown/JSON files get language-aware highlighting and folding; plain
  // text files (.txt, .log, .csv, …) stay unstyled and fold-gutter-free.
  $effect(() => {
    const path = contentPath;
    if (!view || isDestroyed) return;
    view.dispatch({ effects: languageCompartment.reconfigure(getLanguageExtension(path)) });
  });

  $effect(() => {
    if (!view || !scrollerEl || !hasAppliedInitialScroll) return;
    if (initialScrollRatio == null) return;
    if (lastAppliedScrollRatio !== null && Math.abs(lastAppliedScrollRatio - initialScrollRatio) < 0.001) return;
    scrollEditorToRatio(initialScrollRatio);
  });

  // Re-measure CodeMirror viewport when typography settings change
  $effect(() => {
    const _fs = $settingsStore.fontSize;
    const _ff = $settingsStore.fontFamily;
    const _lh = $settingsStore.lineHeight;
    if (view && !isDestroyed) {
      tick().then(() => {
        if (view && !isDestroyed) {
          view.requestMeasure();
        }
      });
    }
  });
</script>

<div class="editor-wrapper">
  <div
    bind:this={container}
    class="editor-container"
    style:font-size="{$settingsStore.fontSize}px"
    style:font-family={$settingsStore.fontFamily}
    style:line-height={$settingsStore.lineHeight}
  ></div>

  <LinkPreview 
    visible={previewVisible} 
    content={previewContent} 
    x={previewX} 
    y={previewY} 
    placement={previewPlacement}
  />
</div>

<style>
  .editor-wrapper {
    position: relative;
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow: hidden;
    height: 100%;
  }

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

  .editor-container :global(.cm-gutters) {
    /* No fixed width: let CodeMirror auto-size the gutter so line numbers
       (and the fold gutter) are never clipped, regardless of how many lines
       the file has. */
    border: none !important;
    background-color: transparent !important;
  }

  .editor-container :global(.cm-gutter) {
    background-color: transparent !important;
  }

  /* Hide the fold gutter so the line-number area is identical for markdown
     and non-markdown files (fold ranges only exist in markdown, which made
     the gutter wider there). Folding still works via the keyboard.
     `!important` is required because CodeMirror injects its own
     `.cm-gutter { display: flex }` theme rule at runtime, which would
     otherwise win the cascade (equal specificity, later source order). */
  .editor-container :global(.cm-foldGutter) {
    display: none !important;
  }

  .editor-container :global(.cm-lineNumbers .cm-gutterElement) {
    min-width: 1.6em;
    padding: 0 8px 0 0 !important;
    text-align: right !important;
    color: var(--text-muted) !important;
    font-size: 0.85em !important;
  }
</style>
