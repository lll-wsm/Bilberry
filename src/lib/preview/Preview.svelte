<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { tick, untrack } from "svelte";
  import { vaultStore } from "../../stores/vault";
  import { settingsStore } from "../../stores/settings";
  import { theme } from "../../stores/theme";
  import { renderMarkdown, renderMermaidBlocks, renderMermaidDocument, resolveRelativePath, type RenderResult } from "./markdown";
  import { themes } from "./themes";
  import LinkPreview from "../ui/LinkPreview.svelte";
  import { ChevronUp, ChevronDown, X, CaseSensitive } from "lucide-svelte";
  import { triggerPreviewFindCount } from "../../stores/editor";
  import { t } from "../i18n/i18n.svelte";

  let { source = "", mode = "markdown", currentFilePath = null, scrollSyncRatio = null, onScrollChange, embedded = false }: {
    source?: string;
    mode?: "markdown" | "mermaid";
    currentFilePath?: string | null;
    scrollSyncRatio?: number | null;
    onScrollChange?: (ratio: number) => void;
    embedded?: boolean;
  } = $props();

  let container: HTMLDivElement;
  let result: RenderResult | undefined = $state.raw();
  let renderError: string | null = $state(null);

  // Find in page state
  let findQuery = $state("");
  let inputValue = $state("");
  let findWidgetVisible = $state(false);
  let findMatches = $state<HTMLElement[]>([]);
  let findCurrentIndex = $state(-1);
  let findCaseSensitive = $state(false);
  let findInputEl: HTMLInputElement | null = $state(null);
  let isComposing = false;

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
          el.classList.contains("preview-find-widget") ||
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

  function unhighlightMatches() {
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
    findMatches.forEach((match, idx) => {
      if (idx === findCurrentIndex) {
        match.classList.add("preview-find-match-current");
        if (scroll) {
          match.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      } else {
        match.classList.remove("preview-find-match-current");
      }
    });
  }

  function nextMatch() {
    if (findMatches.length === 0) return;
    findCurrentIndex = (findCurrentIndex + 1) % findMatches.length;
    highlightCurrentMatch(true);
  }

  function prevMatch() {
    if (findMatches.length === 0) return;
    findCurrentIndex = (findCurrentIndex - 1 + findMatches.length) % findMatches.length;
    highlightCurrentMatch(true);
  }

  function closeFindWidget() {
    findWidgetVisible = false;
    findQuery = "";
    inputValue = "";
    unhighlightMatches();
    findMatches = [];
    findCurrentIndex = -1;
  }

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

  $effect(() => {
    const tickCount = $triggerPreviewFindCount;
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

  $effect(() => {
    const query = findQuery;
    const caseSensitive = findCaseSensitive;
    const _html = html;
    if (!container) return;
    
    untrack(() => {
      unhighlightMatches();
      
      if (query.trim()) {
        const markdownBody = container.querySelector(".markdown-body") as HTMLElement;
        if (markdownBody) {
          findMatches = highlightMatches(markdownBody, query, caseSensitive);
          if (findMatches.length > 0) {
            findCurrentIndex = 0;
            highlightCurrentMatch(true);
          } else {
            findCurrentIndex = -1;
          }
        }
      } else {
        findMatches = [];
        findCurrentIndex = -1;
      }
    });
  });

  function getMimeType(filePath: string): string {
    const lower = filePath.toLowerCase();
    if (lower.endsWith(".png")) return "image/png";
    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
    if (lower.endsWith(".gif")) return "image/gif";
    if (lower.endsWith(".webp")) return "image/webp";
    if (lower.endsWith(".bmp")) return "image/bmp";
    if (lower.endsWith(".svg")) return "image/svg+xml";
    if (lower.endsWith(".avif")) return "image/avif";
    if (lower.endsWith(".ico")) return "image/x-icon";
    return "application/octet-stream";
  }

  function dirname(filePath: string): string {
    const index = filePath.lastIndexOf("/");
    return index >= 0 ? filePath.slice(0, index) : filePath;
  }

  function resolveImagePath(rawSrc: string, baseFilePath: string | null): string | null {
    if (!rawSrc || /^(https?:|data:|blob:|asset:|http:\/\/asset\.localhost)/i.test(rawSrc)) {
      return null;
    }

    if (rawSrc.startsWith("file://")) {
      try {
        return decodeURIComponent(new URL(rawSrc).pathname);
      } catch {
        return null;
      }
    }

    if (rawSrc.startsWith("/")) {
      try {
        return decodeURIComponent(rawSrc);
      } catch {
        return rawSrc;
      }
    }
    if (!baseFilePath) return null;

    try {
      return decodeURIComponent(new URL(rawSrc, `file://${dirname(baseFilePath)}/`).pathname);
    } catch {
      return null;
    }
  }

  // Render markdown asynchronously and debounced. Rendering a large document
  // takes hundreds of milliseconds, so doing it synchronously on every
  // keystroke would freeze the UI. The first render is scheduled with no delay
  // (still async, so the editor paints first); later edits are batched.
  const PREVIEW_RENDER_DEBOUNCE_MS = 200;
  let renderTimer: ReturnType<typeof setTimeout> | null = null;
  let firstRenderPending = true;

  $effect(() => {
    const src = source;
    const mdMode = mode;
    if (renderTimer) clearTimeout(renderTimer);
    renderTimer = setTimeout(() => {
      firstRenderPending = false;
      try {
        result = mdMode === "mermaid" ? renderMermaidDocument(src) : renderMarkdown(src);
        renderError = null;
      } catch (e: any) {
        console.error("Markdown render error:", e);
        renderError = e.message || String(e);
      }
    }, firstRenderPending ? 0 : PREVIEW_RENDER_DEBOUNCE_MS);
    return () => {
      if (renderTimer) clearTimeout(renderTimer);
    };
  });

  // Render mermaid diagrams after HTML is in the DOM
  $effect(() => {
    if (!result?.mermaidBlocks.length) return;
    const previewThemeId = $settingsStore.previewTheme;
    const previewTheme = themes.find((entry) => entry.id === previewThemeId);
    const dark = previewTheme ? previewTheme.mode === "dark" : $theme === "dark";
    const mermaidLabels = {
      source: t("mermaid.source"),
      syntaxError: t("mermaid.syntaxError"),
      unknownSyntaxError: t("mermaid.unknownSyntaxError"),
    };

    let cancelled = false;
    (async () => {
      await tick();
      try {
        const svgs = await renderMermaidBlocks(result.mermaidBlocks, dark, mermaidLabels);
        if (cancelled) return;
        const containers = container?.querySelectorAll(".mermaid-container");
        containers?.forEach((el, i) => {
          if (svgs[i]) el.innerHTML = svgs[i];
        });
      } catch (e) {
        console.error("Mermaid render error:", e);
      }
    })();
    return () => { cancelled = true; };
  });

  // Resolve local Markdown image paths to blob URLs the webview can display.
  $effect(() => {
    if (mode !== "markdown" || !html || !container) return;

    let cancelled = false;
    const objectUrls: string[] = [];

    (async () => {
      await tick();
      const images = Array.from(container.querySelectorAll(".markdown-body img")) as HTMLImageElement[];

      await Promise.all(images.map(async (img) => {
        const rawSrc = img.getAttribute("src") ?? "";
        const resolvedPath = resolveImagePath(rawSrc, currentFilePath);
        if (!resolvedPath) return;

        try {
          const bytes = await invoke<number[]>("read_binary_file", { path: resolvedPath });
          if (cancelled) return;

          const objectUrl = URL.createObjectURL(
            new Blob([new Uint8Array(bytes)], { type: getMimeType(resolvedPath) }),
          );
          objectUrls.push(objectUrl);
          img.src = objectUrl;
          img.dataset.localResolved = "true";
        } catch (error) {
          console.error("Failed to resolve markdown image:", resolvedPath, error);
          img.alt = `${img.alt || rawSrc} ${t("preview.imageLoadFailed")}`;
        }
      }));
    })();

    return () => {
      cancelled = true;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  });

  let html = $derived(result?.html ?? "");

  const findFile = (entries: any[], targetPath: string): string | null => {
    const normalizedTarget = targetPath.toLowerCase().replace(/\.md$/i, "");
    
    for (const entry of entries) {
      if (!entry.is_dir) {
        const entryPath = entry.path.toLowerCase();
        // Exact match check first (for absolute/resolved paths)
        if (entryPath === targetPath.toLowerCase() || entryPath === (targetPath + ".md").toLowerCase()) {
          return entry.path;
        }
        
        const entryNameNoExt = entry.name.toLowerCase().replace(/\.md$/i, "");
        
        // Match A: Full path ending match (e.g., "folder/file" matches ".../folder/file.md")
        if (entryPath.endsWith(normalizedTarget + ".md") || entryPath.endsWith(normalizedTarget)) {
          return entry.path;
        }
        
        // Match B: Just filename match (e.g., "file" matches "any/folder/file.md")
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

  let previewVisible = $state(false);
  let previewContent = $state("");
  let previewX = $state(0);
  let previewY = $state(0);
  let previewPlacement = $state<"top" | "bottom">("bottom");
  let hoverTimeout: ReturnType<typeof setTimeout> | null = null;

  async function handleHover(e: MouseEvent) {
    let link = (e.target as HTMLElement).closest(".wikilink") as HTMLElement;
    const isOverPopover = (e.target as HTMLElement).closest(".link-preview-popover");
    
    // Check if it's a standard local link (exclude external protocols)
    if (!link) {
      const anchor = (e.target as HTMLElement).closest("a") as HTMLAnchorElement;
      if (anchor) {
        const href = anchor.getAttribute("href");
        if (href && !/^(https?:\/\/|mailto:|tel:|data:|blob:|javascript:)/i.test(href)) {
          link = anchor;
        }
      }
    }

    if (link) {
      const targetVal = link.dataset.target || link.getAttribute("href");
      if (!targetVal) return;

      console.log("[Preview Hover] Detected link hover:", targetVal);

      if (hoverTimeout) clearTimeout(hoverTimeout);
      
      // If already showing this link's preview, don't restart timeout
      if (previewVisible && Math.abs(link.getBoundingClientRect().left - previewX) < 1) return;

      hoverTimeout = setTimeout(async () => {
        let fileName = decodeURIComponent(targetVal);
        let fullPath: string | null = null;
        
        if (currentFilePath) {
          try {
            const absPath = resolveRelativePath(decodeURIComponent(targetVal), currentFilePath);
            console.log("[Preview Hover] currentFilePath:", currentFilePath, "-> Resolving relative path:", absPath);
            fullPath = findFile($vaultStore.fileTree, absPath);
          } catch (err) {
            console.error("[Preview Hover] Error resolving path relative to currentFilePath:", err);
          }
        }
        
        if (!fullPath) {
          console.log("[Preview Hover] File not found by relative path, falling back to name search:", fileName);
          fullPath = findFile($vaultStore.fileTree, fileName);
        }

        console.log("[Preview Hover] findFile result fullPath:", fullPath);

        if (fullPath) {
          try {
            const content = await invoke<string>("read_note", { path: fullPath, encoding: "UTF-8" });
            previewContent = content; // Show all content
            
            const rect = link.getBoundingClientRect();
            previewX = rect.left;
            
            // Adjust X if too close to right edge
            if (previewX + 420 > window.innerWidth) {
              previewX = window.innerWidth - 440;
            }
            
            // Determine popover placement based on bottom boundaries
            if (rect.bottom + 8 + 350 > window.innerHeight) {
              previewPlacement = "top";
              previewY = window.innerHeight - rect.top + 8;
            } else {
              previewPlacement = "bottom";
              previewY = rect.bottom + 8;
            }

            previewVisible = true;
          } catch (err) {
            console.error("[Preview Hover] Failed to load preview content:", err);
          }
        }
      }, 400);
    } else if (!isOverPopover) {
      if (hoverTimeout) clearTimeout(hoverTimeout);
      hoverTimeout = setTimeout(() => {
        const popover = document.querySelector(".link-preview-popover:hover");
        const currentLink = document.querySelector(".wikilink:hover") || document.querySelector("a:hover");
        if (!popover && !currentLink) {
          previewVisible = false;
        }
      }, 100);
    }
  }

  function hidePreview(e: MouseEvent) {
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (
      relatedTarget?.closest(".link-preview-popover") || 
      relatedTarget?.closest(".wikilink") || 
      relatedTarget?.closest("a")
    ) return;

    if (hoverTimeout) clearTimeout(hoverTimeout);
    previewVisible = false;
  }

  $effect(() => {
    if (!container || scrollSyncRatio === null) return;

    const maxScroll = container.scrollHeight - container.clientHeight;
    const nextTop = maxScroll > 0 ? maxScroll * scrollSyncRatio : 0;

    if (Math.abs(container.scrollTop - nextTop) < 1) return;

    container.scrollTop = nextTop;
  });

  function handleScroll() {
    if (!container || !onScrollChange) return;
    const maxScroll = container.scrollHeight - container.clientHeight;
    const ratio = maxScroll > 0 ? container.scrollTop / maxScroll : 0;
    onScrollChange(ratio);
  }

  async function handleLinkClick(e: MouseEvent) {
    const link = (e.target as HTMLElement).closest(".wikilink") as HTMLElement;
    const hashtag = (e.target as HTMLElement).closest(".hashtag") as HTMLElement;

    if (link) {
      e.preventDefault();
      const fileName = link.dataset.target;
      if (!fileName) return;

      console.log("[Preview Click] Wikilink clicked:", fileName);
      const fullPath = findFile($vaultStore.fileTree, fileName);
      console.log("[Preview Click] findFile result:", fullPath);
      if (fullPath) vaultStore.openNote(fullPath);
    } else if (hashtag) {
      e.preventDefault();
      const tag = hashtag.dataset.tag;
      if (tag) {
        vaultStore.search(`#${tag}`);
      }
    } else {
      // Handle standard links (both local and external)
      const anchor = (e.target as HTMLElement).closest("a") as HTMLAnchorElement;
      if (anchor) {
        const href = anchor.getAttribute("href");
        if (href) {
          if (/^(https?:\/\/|mailto:|tel:)/i.test(href)) {
            e.preventDefault();
            try {
              const { open } = await import("@tauri-apps/plugin-shell");
              await open(href);
            } catch (err) {
              console.error("Failed to open external link using tauri-plugin-shell:", err);
            }
          } else if (!/^(data:|blob:|javascript:)/i.test(href)) {
            e.preventDefault();
            
            let resolvedPath = decodeURIComponent(href);
            console.log("[Preview Click] Local standard link clicked:", resolvedPath);
            let fullPath: string | null = null;
            
            if (currentFilePath) {
              try {
                const absPath = resolveRelativePath(decodeURIComponent(href), currentFilePath);
                console.log("[Preview Click] currentFilePath:", currentFilePath, "-> Resolving relative path:", absPath);
                fullPath = findFile($vaultStore.fileTree, absPath);
              } catch (err) {
                console.error("[Preview Click] Error resolving path relative to currentFilePath:", err);
              }
            }
            
            if (!fullPath) {
              console.log("[Preview Click] File not found by relative path, falling back to name search:", resolvedPath);
              fullPath = findFile($vaultStore.fileTree, resolvedPath);
            }

            console.log("[Preview Click] Final matched fullPath:", fullPath);
            if (fullPath) {
              vaultStore.openNote(fullPath);
            } else {
              console.warn("[Preview Click] Could not find note path in vault:", resolvedPath);
            }
          }
        }
      }
    }
  }
</script>

<div class="preview-wrapper" class:embedded>
  {#if findWidgetVisible}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="preview-find-widget" class:embedded onkeydown={(e) => e.stopPropagation()}>
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

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div 
    bind:this={container} 
    class="preview" 
    class:embedded
    onscroll={handleScroll} 
    onclick={handleLinkClick}
    onmousemove={handleHover}
    onmouseleave={hidePreview}
  >
    {#if renderError}
      <div class="render-error">
        <strong>{t("preview.renderError")}</strong> {renderError}
      </div>
    {:else if html}
      <div
        class="markdown-body"
        style:font-size="{$settingsStore.fontSize}px"
        style:line-height={$settingsStore.lineHeight}
        style:font-family={$settingsStore.fontFamily}
      >{@html html}</div>
    {:else if source.trim()}
      <div class="empty">
        <p>{t("preview.rendering")}</p>
      </div>
    {:else}
      <div class="empty">
        <p>{t("empty.noContent")}</p>
      </div>
    {/if}

    <LinkPreview 
      visible={previewVisible} 
      content={previewContent} 
      x={previewX} 
      y={previewY} 
      placement={previewPlacement}
    />
  </div>
</div>

<style>
  .preview {
    flex: 1;
    overflow-y: auto;
    padding: var(--spacing-4) 32px;
    background: var(--bg-primary);
  }

  .preview.embedded {
    overflow: visible;
    padding: 0;
    background: transparent;
  }

  .markdown-body {
    max-width: 100%;
    margin: 0 auto;
  }

  .preview :global(.markdown-body img) {
    max-width: 100%;
    height: auto;
  }

  /* Force paragraphs, list items, and blockquotes inside markdown-body to inherit the user's custom line-height and font-family. */
  .preview :global(.markdown-body p),
  .preview :global(.markdown-body li),
  .preview :global(.markdown-body blockquote) {
    line-height: inherit !important;
    font-family: inherit;
  }

  /* Ensure block-level elements start on a new line. */
  :global(.markdown-body p),
  :global(.markdown-body h1),
  :global(.markdown-body h2),
  :global(.markdown-body h3),
  :global(.markdown-body h4),
  :global(.markdown-body h5),
  :global(.markdown-body h6),
  :global(.markdown-body blockquote),
  :global(.markdown-body figcaption) {
    display: block;
    max-width: 100%;
  }

  :global(.wikilink) {
    color: var(--interactive-accent);
    text-decoration: none;
    border-bottom: 1px dashed var(--interactive-accent);
    cursor: pointer;
    transition: opacity 0.1s ease;
  }

  :global(.wikilink:hover) {
    opacity: 0.8;
  }

  :global(.hashtag) {
    color: var(--text-muted);
    background: var(--bg-hover);
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 0.9em;
    text-decoration: none;
    cursor: pointer;
    font-weight: 500;
    transition: all 0.1s;
    border: 1px solid var(--border-divider);
    display: inline-block;
    line-height: 1.4;
    margin: 0 2px;
  }

  :global(.hashtag:hover) {
    color: var(--interactive-accent);
    border-color: var(--interactive-accent);
  }

  :global(.markdown-body ul), :global(.markdown-body ol) {
    display: flow-root;
  }

  :global(.markdown-body li) {
    display: list-item;
    max-width: none;
  }

  /* Fallback list styles for themes that do not explicitly define them (e.g. One Dark, GitHub Light, Modern Zen) */
  :global(.markdown-body ul) {
    list-style-type: disc;
    padding-left: 1.8em;
    margin-top: 8px;
    margin-bottom: 8px;
  }

  :global(.markdown-body ol) {
    list-style-type: decimal;
    padding-left: 1.8em;
    margin-top: 8px;
    margin-bottom: 8px;
  }

  :global(.markdown-body li) {
    margin-top: 4px;
    margin-bottom: 4px;
  }

  /* Nested list indentation */
  :global(.markdown-body ul ul), :global(.markdown-body ol ul), :global(.markdown-body ul ol), :global(.markdown-body ol ol) {
    margin-top: 4px;
    margin-bottom: 4px;
    padding-left: 1.5em;
  }

  :global(.markdown-body .task-list-item) {
    list-style-type: none;
  }

  :global(.markdown-body .task-list-item input[type="checkbox"]) {
    margin-right: 6px;
    vertical-align: middle;
  }

  /* Strikethrough and muted color for checked task list items */
  :global(.markdown-body li:has(> input[type="checkbox"]:checked)) {
    text-decoration: line-through;
    color: var(--text-muted);
  }

  /* Reset text-decoration and color inheritance for nested lists under checked items */
  :global(.markdown-body li:has(> input[type="checkbox"]:checked) ul),
  :global(.markdown-body li:has(> input[type="checkbox"]:checked) ol) {
    text-decoration: none;
    color: var(--text-normal);
  }

  .render-error {
    padding: var(--spacing-4);
    background: #fee;
    color: #c00;
    border-radius: 6px;
    font-size: 14px;
  }

  .empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--text-muted);
    font-size: 14px;
  }

  /* KaTeX error styling */
  :global(.katex-error) {
    color: #e74c3c;
    background: rgba(231, 76, 60, 0.1);
    border: 1px solid rgba(231, 76, 60, 0.3);
    border-radius: 3px;
    padding: 0 4px;
    font-family: monospace;
    font-size: 0.9em;
  }

  /* Mermaid container styling */
  :global(.mermaid-container) {
    text-align: center;
    margin: 16px 0;
    padding: 12px;
    border-radius: 6px;
    background: rgba(128, 128, 128, 0.03);
    overflow-x: auto;
    min-height: 40px;
  }

  :global(.mermaid-container svg) {
    max-width: 100%;
    height: auto;
  }

  :global(.mermaid-error) {
    color: #e74c3c;
    font-size: 12px;
    padding: 10px 12px;
    text-align: left;
    border: 1px solid rgba(231, 76, 60, 0.25);
    border-radius: 6px;
    background: rgba(231, 76, 60, 0.06);
  }

  :global(.mermaid-error strong) {
    display: block;
    margin-bottom: 6px;
  }

  :global(.mermaid-error-source) {
    margin-bottom: 12px;
    color: var(--text-primary);
  }

  :global(.mermaid-error-source pre) {
    margin: 0;
    padding: 10px 12px;
    border-radius: 6px;
    background: rgba(128, 128, 128, 0.08);
    white-space: pre-wrap;
    word-break: break-word;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  }

  :global(.mermaid-error pre) {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  }

  /* Table & Code Block Premium Styling Overrides */
  .preview :global(.markdown-body code) {
    font-family: var(--font-family, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
    font-size: 0.88em;
    padding: 0.2em 0.45em;
    border-radius: 6px;
    background-color: var(--code-inline-bg);
    color: var(--code-inline-color);
    border: none;
  }

  .preview :global(.markdown-body pre code) {
    padding: 0;
    background: transparent;
    color: inherit;
    border: none;
    font-size: inherit;
  }

  .preview :global(.markdown-body .hljs-keyword),
  .preview :global(.markdown-body .hljs-selector-tag) {
    color: var(--code-keyword);
    font-weight: 600;
  }
  .preview :global(.markdown-body .hljs-string),
  .preview :global(.markdown-body .hljs-literal),
  .preview :global(.markdown-body .hljs-type),
  .preview :global(.markdown-body .hljs-addition) {
    color: var(--code-string);
  }
  .preview :global(.markdown-body .hljs-number) {
    color: var(--code-number);
  }
  .preview :global(.markdown-body .hljs-comment),
  .preview :global(.markdown-body .hljs-quote) {
    color: var(--code-comment);
    font-style: italic;
  }
  .preview :global(.markdown-body .hljs-title),
  .preview :global(.markdown-body .hljs-section),
  .preview :global(.markdown-body .hljs-function) {
    color: var(--code-function);
  }
  .preview :global(.markdown-body .hljs-built_in),
  .preview :global(.markdown-body .hljs-class .hljs-title) {
    color: var(--code-builtin);
  }
  .preview :global(.markdown-body .hljs-variable),
  .preview :global(.markdown-body .hljs-template-variable),
  .preview :global(.markdown-body .hljs-attribute) {
    color: var(--code-variable);
  }
  .preview :global(.markdown-body .hljs-attr) {
    color: var(--code-attr);
  }
  .preview :global(.markdown-body .hljs-tag) {
    color: var(--code-tag);
  }
  .preview :global(.markdown-body .hljs-name) {
    color: var(--code-tag);
    font-weight: 600;
  }
  .preview :global(.markdown-body .hljs-emphasis) {
    font-style: italic;
  }
  .preview :global(.markdown-body .hljs-strong) {
    font-weight: bold;
  }

  .preview :global(.markdown-body pre) {
    margin: 1.25em 0;
    padding: 16px 20px;
    background-color: var(--code-bg);
    border: none;
    border-radius: 8px;
    overflow-x: auto;
  }

  .preview :global(.markdown-body table) {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    margin: 1.5em 0;
    border: 1px solid var(--table-border);
    border-radius: 8px;
    overflow: hidden;
  }

  .preview :global(.markdown-body th) {
    background-color: var(--table-header-bg);
    color: var(--table-header-fg);
    font-weight: 600;
    font-size: 0.92em;
    padding: 10px 14px;
    border-bottom: 2px solid var(--table-border);
    border-right: 1px solid var(--table-border);
  }

  .preview :global(.markdown-body th:last-child) {
    border-right: none;
  }

  .preview :global(.markdown-body td) {
    padding: 10px 14px;
    font-size: 0.92em;
    color: var(--text-normal);
    background-color: var(--table-row-bg);
    border-bottom: 1px solid var(--table-border);
    border-right: 1px solid var(--table-border);
  }

  .preview :global(.markdown-body td:last-child) {
    border-right: none;
  }

  .preview :global(.markdown-body tr:last-child td) {
    border-bottom: none;
  }

  .preview :global(.markdown-body tr:nth-child(even) td) {
    background-color: var(--table-row-stripe);
  }

  .preview :global(.markdown-body tr:hover td) {
    background-color: var(--bg-hover) !important;
  }

  .preview :global(.markdown-alert) {
    padding: 12px 16px;
    margin: 16px 0;
    border-left: 4px solid;
    border-radius: 0 8px 8px 0;
    font-size: 0.95em;
    line-height: 1.6;
  }

  .preview :global(.markdown-alert.markdown-alert-note) {
    border-left-color: var(--alert-note-border);
    background-color: var(--alert-note-bg);
  }

  .preview :global(.markdown-alert.markdown-alert-tip) {
    border-left-color: var(--alert-tip-border);
    background-color: var(--alert-tip-bg);
  }

  .preview :global(.markdown-alert.markdown-alert-important) {
    border-left-color: var(--alert-important-border);
    background-color: var(--alert-important-bg);
  }

  .preview :global(.markdown-alert.markdown-alert-warning) {
    border-left-color: var(--alert-warning-border);
    background-color: var(--alert-warning-bg);
  }

  .preview :global(.markdown-alert.markdown-alert-caution) {
    border-left-color: var(--alert-caution-border);
    background-color: var(--alert-caution-bg);
  }

  .preview :global(.markdown-alert-title) {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
    margin-bottom: 6px;
    font-size: 0.95em;
  }

  .preview :global(.markdown-alert-title svg) {
    display: inline-block;
    vertical-align: middle;
    flex-shrink: 0;
  }

  .preview :global(.markdown-alert-note .markdown-alert-title) {
    color: var(--alert-note-border);
  }

  .preview :global(.markdown-alert-tip .markdown-alert-title) {
    color: var(--alert-tip-border);
  }

  .preview :global(.markdown-alert-important .markdown-alert-title) {
    color: var(--alert-important-border);
  }

  .preview :global(.markdown-alert-warning .markdown-alert-title) {
    color: var(--alert-warning-border);
  }

  .preview :global(.markdown-alert-caution .markdown-alert-title) {
    color: var(--alert-caution-border);
  }

  .preview-alert-content > :last-child {
    margin-bottom: 0;
  }

  .preview-wrapper {
    position: relative;
    display: flex;
    flex-direction: column;
    flex: 1;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  .preview-wrapper.embedded {
    overflow: visible;
    height: auto;
  }

  .preview-find-widget {
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

  .preview-find-widget.embedded {
    display: none;
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

  /* Highlighting matches */
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
</style>
