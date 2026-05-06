<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { tick } from "svelte";
  import { vaultStore } from "../../stores/vault";
  import { settingsStore } from "../../stores/settings";
  import { theme } from "../../stores/theme";
  import { renderMarkdown, renderMermaidBlocks, renderMermaidDocument, type RenderResult } from "./markdown";
  import { themes } from "./themes";

  let { source = "", mode = "markdown", currentFilePath = null, scrollSyncRatio = null, onScrollChange }: {
    source?: string;
    mode?: "markdown" | "mermaid";
    currentFilePath?: string | null;
    scrollSyncRatio?: number | null;
    onScrollChange?: (ratio: number) => void;
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
    if (link) {
      e.preventDefault();
      const fileName = link.dataset.target;
      if (!fileName) return;

      const findFile = (entries: any[], targetPath: string): string | null => {
        // Normalize target: remove .md if present, handle slashes
        const normalizedTarget = targetPath.toLowerCase().replace(/\.md$/i, "");
        
        for (const entry of entries) {
          // 1. Check if the entry is a file
          if (!entry.is_dir) {
            const entryPath = entry.path.toLowerCase();
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
          
          // 2. Recursive search in directories
          if (entry.children) {
            const found = findFile(entry.children, targetPath);
            if (found) return found;
          }
        }
        return null;
      };

      const fullPath = findFile($vaultStore.fileTree, fileName);
      if (fullPath) vaultStore.openNote(fullPath);
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div bind:this={container} class="preview" onscroll={handleScroll} onclick={handleLinkClick}>
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
</div>

<style>
  .preview {
    flex: 1;
    overflow-y: auto;
    padding: var(--spacing-4) 32px;
    background: var(--bg-primary);
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
</style>
