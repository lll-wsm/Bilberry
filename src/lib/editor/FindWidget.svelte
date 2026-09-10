<script lang="ts">
  import { tick, untrack } from "svelte";
  import { ChevronUp, ChevronDown, X, CaseSensitive } from "lucide-svelte";
  import { SearchCursor } from "@codemirror/search";
  import { EditorView } from "@codemirror/view";
  import {
    triggerFindCount,
    editorViewStore,
    previewContainerStore,
    previewRenderVersion,
    editorMode,
  } from "../../stores/editor";
  import { currentFile } from "../../stores/vault";
  import { setSearchMatches, type SearchMatch } from "./search-extension";
  import { t } from "../i18n/i18n.svelte";

  // --- Widget state ---
  let findQuery = $state("");
  let inputValue = $state("");
  let findWidgetVisible = $state(false);
  let findMatches = $state<HTMLElement[] | SearchMatch[]>([]);
  let findCurrentIndex = $state(-1);
  let findCaseSensitive = $state(false);
  let findInputEl: HTMLInputElement | null = $state(null);
  let isComposing = false;

  // --- Backend helpers ---

  function highlightMatches(targetContainer: HTMLElement, query: string, caseSensitive: boolean): HTMLElement[] {
    const matches: HTMLElement[] = [];
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escapedQuery, caseSensitive ? "g" : "gi");

    function walk(node: Node) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        if (
          el.tagName === "SCRIPT" ||
          el.tagName === "STYLE" ||
          el.tagName === "NOSCRIPT" ||
          el.classList.contains("find-widget") ||
          el.classList.contains("mermaid-container") ||
          el.classList.contains("link-preview-popover")
        ) {
          return;
        }
        const children = Array.from(el.childNodes);
        for (const child of children) {
          walk(child);
        }
      } else if (node.nodeType === Node.TEXT_NODE) {
        const text = node.nodeValue || "";
        if (!escapedQuery) return;

        regex.lastIndex = 0;
        let match;
        const fragments: Node[] = [];
        let lastIndex = 0;

        while ((match = regex.exec(text)) !== null) {
          const matchText = match[0];
          const matchIndex = match.index;

          if (matchIndex > lastIndex) {
            fragments.push(document.createTextNode(text.substring(lastIndex, matchIndex)));
          }

          const mark = document.createElement("mark");
          mark.className = "preview-find-match";
          mark.textContent = matchText;
          fragments.push(mark);
          matches.push(mark);

          lastIndex = regex.lastIndex;
          if (match[0].length === 0) regex.lastIndex++;
        }

        if (fragments.length > 0) {
          if (lastIndex < text.length) {
            fragments.push(document.createTextNode(text.substring(lastIndex)));
          }
          const parent = node.parentNode;
          if (parent) {
            const next = node.nextSibling;
            parent.removeChild(node);
            fragments.forEach(frag => {
              parent.insertBefore(frag, next);
            });
          }
        }
      }
    }

    walk(targetContainer);
    return matches;
  }

  function unhighlightMatches(container: HTMLElement | null) {
    if (!container) return;
    const marks = container.querySelectorAll("mark.preview-find-match");
    marks.forEach(mark => {
      const parent = mark.parentNode;
      if (parent) {
        const textNode = document.createTextNode(mark.textContent || "");
        parent.replaceChild(textNode, mark);
      }
    });
    const markdownBody = container.querySelector(".markdown-body") as HTMLElement;
    if (markdownBody) {
      markdownBody.normalize();
    }
  }

  function highlightCurrentMatch(scroll = true) {
    if (findMatches.length === 0 || findCurrentIndex < 0) return;
    const match = findMatches[findCurrentIndex];

    // Preview backend: HTMLElement marks
    if (match instanceof HTMLElement) {
      findMatches.forEach((m, idx) => {
        if (m instanceof HTMLElement) {
          if (idx === findCurrentIndex) {
            m.classList.add("preview-find-match-current");
            if (scroll) m.scrollIntoView({ behavior: "smooth", block: "center" });
          } else {
            m.classList.remove("preview-find-match-current");
          }
        }
      });
    }
    // Source backend: CodeMirror decorations are updated via setSearchMatches effect
  }

  function searchInEditor(view: EditorView, query: string, caseSensitive: boolean): SearchMatch[] {
    if (!query.trim()) return [];
    const matches: SearchMatch[] = [];
    const normalize = caseSensitive ? undefined : (s: string) => s.toLowerCase();
    const cursor = new SearchCursor(view.state.doc, query, 0, undefined, normalize);
    for (const match of cursor) {
      matches.push({ from: match.from, to: match.to });
    }
    return matches;
  }

  function clearEditorDecorations(view: EditorView | null) {
    if (!view) return;
    view.dispatch({
      effects: setSearchMatches.of({ matches: [], currentIndex: -1 }),
    });
  }

  function scrollToEditorMatch(view: EditorView, match: SearchMatch) {
    view.dispatch({
      effects: EditorView.scrollIntoView(match.from, { y: "center" }),
    });
  }

  // --- Navigation ---

  function nextMatch() {
    if (findMatches.length === 0) return;
    findCurrentIndex = (findCurrentIndex + 1) % findMatches.length;
    navigateToCurrent();
  }

  function prevMatch() {
    if (findMatches.length === 0) return;
    findCurrentIndex = (findCurrentIndex - 1 + findMatches.length) % findMatches.length;
    navigateToCurrent();
  }

  function navigateToCurrent() {
    if (findMatches.length === 0 || findCurrentIndex < 0) return;
    const match = findMatches[findCurrentIndex];

    if (match instanceof HTMLElement) {
      // Preview backend
      highlightCurrentMatch(true);
    } else {
      // Source backend: update decorations and scroll
      const view = $editorViewStore;
      if (view) {
        view.dispatch({
          effects: setSearchMatches.of({
            matches: findMatches as SearchMatch[],
            currentIndex: findCurrentIndex,
          }),
        });
        scrollToEditorMatch(view, match);
      }
    }
  }

  // --- Close ---

  function closeFindWidget() {
    findWidgetVisible = false;
    findQuery = "";
    inputValue = "";
    unhighlightMatches($previewContainerStore);
    clearEditorDecorations($editorViewStore);
    findMatches = [];
    findCurrentIndex = -1;
  }

  // --- Input handling ---

  function handleInput(e: Event) {
    const target = e.target as HTMLInputElement;
    inputValue = target.value;
    if (!isComposing) {
      findQuery = target.value;
    }
  }

  function handleCompositionStart() {
    isComposing = true;
  }

  function handleCompositionEnd(e: CompositionEvent) {
    isComposing = false;
    const target = e.target as HTMLInputElement;
    inputValue = target.value;
    findQuery = target.value;
  }

  function handleInputKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) {
        prevMatch();
      } else {
        nextMatch();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeFindWidget();
    }
  }

  // --- Effects ---

  // Show widget when triggered
  $effect(() => {
    const tickCount = $triggerFindCount;
    if (tickCount > 0) {
      findWidgetVisible = true;
      inputValue = "";
      findQuery = "";
      tick().then(() => {
        if (findInputEl) {
          findInputEl.focus();
          findInputEl.select();
        }
      });
    }
  });

  // Close search when switching files.
  // Two traps this effect has to avoid:
  //  - Read the derived `currentFile` store, NOT `$vaultStore.currentFilePath`.
  //    Svelte 5 re-runs effects that read `$someStore.x` on EVERY notification
  //    of that store (object values are never considered equal), so unrelated
  //    writes such as saving the preview scroll ratio closed the widget while
  //    the user was still typing. `currentFile` notifies only when the path
  //    actually changes.
  //  - untrack(findWidgetVisible) so the trigger effect setting it to true
  //    does not re-run this one.
  $effect(() => {
    $currentFile;
    untrack(() => {
      if (findWidgetVisible) {
        closeFindWidget();
      }
    });
  });

  // Run search when query, mode, or targets change
  $effect(() => {
    const query = findQuery;
    const caseSensitive = findCaseSensitive;
    const mode = $editorMode;
    const container = $previewContainerStore;
    const view = $editorViewStore;
    const _version = $previewRenderVersion;

    if (!findWidgetVisible) return;

    untrack(() => {
      // Clean up both backends before switching
      unhighlightMatches(container);
      if (mode === "source" && view) {
        // Clear any stale editor decorations from a previous preview session
      }

      if (query.trim()) {
        if (mode === "source" && view) {
          // Source backend: CodeMirror SearchCursor
          const matches = searchInEditor(view, query, caseSensitive);
          findMatches = matches;
          if (matches.length > 0) {
            findCurrentIndex = 0;
            view.dispatch({
              effects: setSearchMatches.of({ matches, currentIndex: 0 }),
            });
            scrollToEditorMatch(view, matches[0]);
          } else {
            findCurrentIndex = -1;
            view.dispatch({
              effects: setSearchMatches.of({ matches: [], currentIndex: -1 }),
            });
          }
        } else if (container) {
          // Preview/split backend: DOM text-node highlighting
          const markdownBody = container.querySelector(".markdown-body") as HTMLElement;
          if (markdownBody) {
            const matches = highlightMatches(markdownBody, query, caseSensitive);
            findMatches = matches;
            if (matches.length > 0) {
              findCurrentIndex = 0;
              highlightCurrentMatch(true);
            } else {
              findCurrentIndex = -1;
            }
          } else {
            findMatches = [];
            findCurrentIndex = -1;
          }
        } else {
          findMatches = [];
          findCurrentIndex = -1;
        }
      } else {
        findMatches = [];
        findCurrentIndex = -1;
      }
    });
  });
</script>

{#if findWidgetVisible}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="find-widget" onkeydown={(e) => e.stopPropagation()}>
    <div class="find-input-container">
      <input
        bind:this={findInputEl}
        type="text"
        placeholder={t("preview.findPlaceholder")}
        value={inputValue}
        oninput={handleInput}
        oncompositionstart={handleCompositionStart}
        oncompositionend={handleCompositionEnd}
        onkeydown={handleInputKeydown}
      />
      <button
        class="toggle-btn"
        class:active={findCaseSensitive}
        onclick={() => findCaseSensitive = !findCaseSensitive}
        title={t("preview.matchCase")}
      >
        <CaseSensitive size={16} />
      </button>
    </div>

    <div class="find-actions">
      <span class="find-count">
        {#if findMatches.length > 0}
          {findCurrentIndex + 1} / {findMatches.length}
        {:else}
          {t("preview.noResults")}
        {/if}
      </span>
      <button
        class="action-btn"
        onclick={prevMatch}
        disabled={findMatches.length === 0}
        title={t("preview.previous")}
      >
        <ChevronUp size={16} />
      </button>
      <button
        class="action-btn"
        onclick={nextMatch}
        disabled={findMatches.length === 0}
        title={t("preview.next")}
      >
        <ChevronDown size={16} />
      </button>
      <button
        class="action-btn close-btn"
        onclick={closeFindWidget}
        title={t("preview.close")}
      >
        <X size={16} />
      </button>
    </div>
  </div>
{/if}

<style>
  .find-widget {
    position: absolute;
    top: 12px;
    right: 24px;
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-divider);
    border-radius: 6px;
    padding: 4px 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 1000;
    min-width: 250px;
    font-size: 13px;
  }

  .find-input-container {
    position: relative;
    display: flex;
    align-items: center;
    background: var(--bg-primary);
    border: 1px solid var(--border-divider);
    border-radius: 4px;
    padding: 2px 4px;
    flex: 1;
  }

  .find-input-container:focus-within {
    border-color: var(--interactive-accent);
  }

  .find-input-container input {
    border: none;
    outline: none;
    background: transparent;
    color: var(--text-normal);
    font-size: 13px;
    padding: 2px 4px;
    width: 120px;
  }

  .toggle-btn {
    border: none;
    background: transparent;
    color: var(--text-muted);
    border-radius: 3px;
    padding: 2px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.1s ease;
  }

  .toggle-btn:hover {
    background: var(--bg-hover);
    color: var(--text-normal);
  }

  .toggle-btn.active {
    background: var(--interactive-accent);
    color: #ffffff;
  }

  .find-actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .find-count {
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
    font-size: 11px;
    min-width: 45px;
    text-align: center;
    user-select: none;
  }

  .action-btn {
    border: none;
    background: transparent;
    color: var(--text-normal);
    border-radius: 3px;
    padding: 3px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.1s ease;
  }

  .action-btn:hover:not(:disabled) {
    background: var(--bg-hover);
  }

  .action-btn:disabled {
    color: var(--text-muted);
    opacity: 0.5;
    cursor: not-allowed;
  }

  .close-btn:hover {
    background: rgba(239, 68, 68, 0.2) !important;
    color: #ef4444;
  }

  /* Preview DOM match highlights (global because <mark> elements live in the preview's DOM) */
  :global(.preview-find-match) {
    background-color: rgba(255, 235, 59, 0.45) !important;
    border-radius: 2px;
    transition: background-color 0.1s ease;
    box-shadow: 0 0 1px rgba(0, 0, 0, 0.2);
  }

  :global(.preview-find-match-current) {
    background-color: rgba(255, 152, 0, 0.75) !important;
    outline: 1.5px solid var(--interactive-accent);
    box-shadow: 0 0 4px var(--interactive-accent);
  }

  :global(.dark) :global(.preview-find-match) {
    background-color: rgba(255, 235, 59, 0.25) !important;
    color: inherit;
  }

  :global(.dark) :global(.preview-find-match-current) {
    background-color: rgba(255, 152, 0, 0.55) !important;
    color: inherit;
  }

  /* CodeMirror source-mode match highlights */
  :global(.cm-find-match) {
    background-color: rgba(255, 235, 59, 0.45) !important;
    border-radius: 2px;
  }

  :global(.cm-find-match-current) {
    background-color: rgba(255, 152, 0, 0.75) !important;
    outline: 1.5px solid var(--interactive-accent);
    box-shadow: 0 0 4px var(--interactive-accent);
  }

  :global(.dark) :global(.cm-find-match) {
    background-color: rgba(255, 235, 59, 0.25) !important;
  }

  :global(.dark) :global(.cm-find-match-current) {
    background-color: rgba(255, 152, 0, 0.55) !important;
  }
</style>
