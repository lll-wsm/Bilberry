<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { tick } from "svelte";
  import { vaultStore } from "../../stores/vault";
  import { settingsStore } from "../../stores/settings";
  import { theme } from "../../stores/theme";
  import { renderMarkdown, renderMermaidBlocks, renderMermaidDocument, type RenderResult } from "./markdown";
  import { themes } from "./themes";
  import LinkPreview from "../ui/LinkPreview.svelte";

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

  $effect(() => {
    try {
      result = mode === "mermaid" ? renderMermaidDocument(source) : renderMarkdown(source);
      renderError = null;
    } catch (e: any) {
      console.error("Markdown render error:", e);
      renderError = e.message || String(e);
    }
  });

  // Render mermaid diagrams after HTML is in the DOM
  $effect(() => {
    if (!result?.mermaidBlocks.length) return;
    const previewThemeId = $settingsStore.previewTheme;
    const previewTheme = themes.find((entry) => entry.id === previewThemeId);
    const dark = previewTheme ? previewTheme.mode === "dark" : $theme === "dark";

    let cancelled = false;
    (async () => {
      await tick();
      try {
        const svgs = await renderMermaidBlocks(result.mermaidBlocks, dark);
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
          img.alt = `${img.alt || rawSrc} (加载失败)`;
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
            const absoluteUrl = new URL(targetVal, `file://${currentFilePath}`);
            const absPath = decodeURIComponent(absoluteUrl.pathname);
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
            previewY = rect.bottom + 8;
            
            // Adjust X if too close to right edge
            if (previewX + 420 > window.innerWidth) {
              previewX = window.innerWidth - 440;
            }
            // Adjust Y if too close to bottom edge
            if (previewY + 350 > window.innerHeight) {
              previewY = rect.top - 360;
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
      // Handle standard local links
      const anchor = (e.target as HTMLElement).closest("a") as HTMLAnchorElement;
      if (anchor) {
        const href = anchor.getAttribute("href");
        if (href && !/^(https?:\/\/|mailto:|tel:|data:|blob:|javascript:)/i.test(href)) {
          e.preventDefault();
          
          let resolvedPath = decodeURIComponent(href);
          console.log("[Preview Click] Local standard link clicked:", resolvedPath);
          let fullPath: string | null = null;
          
          if (currentFilePath) {
            try {
              const absoluteUrl = new URL(href, `file://${currentFilePath}`);
              const absPath = decodeURIComponent(absoluteUrl.pathname);
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
</script>

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
      <strong>渲染错误:</strong> {renderError}
    </div>
  {:else if html}
    <div
      class="markdown-body"
      style:font-size="{$settingsStore.fontSize}px"
      style:line-height={$settingsStore.lineHeight}
    >{@html html}</div>
  {:else}
    <div class="empty">
      <p>暂无内容</p>
    </div>
  {/if}

  <LinkPreview 
    visible={previewVisible} 
    content={previewContent} 
    x={previewX} 
    y={previewY} 
  />
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
    max-width: 800px;
    margin: 0 auto;
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

  :global(.markdown-body ul),
  :global(.markdown-body ol) {
    display: flow-root;
  }

  :global(.markdown-body li) {
    display: list-item;
    max-width: none;
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
    border: 1px solid var(--code-border);
  }

  .preview :global(.markdown-body pre code) {
    padding: 0;
    background: transparent;
    color: inherit;
    border: none;
    font-size: inherit;
  }

  .preview :global(.markdown-body pre) {
    margin: 1.25em 0;
    padding: 16px 20px;
    background-color: var(--code-bg);
    border: 1px solid var(--code-border);
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
</style>
