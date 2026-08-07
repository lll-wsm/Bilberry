<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { tick } from "svelte";
  import { vaultStore } from "../../stores/vault";
  import { settingsStore } from "../../stores/settings";
  import { theme } from "../../stores/theme";
  import { renderMarkdown, renderMermaidBlocks, renderMermaidDocument, resolveRelativePath, type RenderResult } from "./markdown";
  import { previewThemes } from "../themes/preview-themes";
  import LinkPreview from "../ui/LinkPreview.svelte";
  import { useLinkPreview } from "../ui/useLinkPreview.svelte";
  import { previewContainerStore, previewRenderVersion } from "../../stores/editor";
  import { findFile } from "../vault/findFile";
  import { t } from "../i18n/i18n.svelte";

  let { source = "", mode = "markdown", currentFilePath = null, scrollSyncRatio = null, onScrollChange, embedded = false }: {
    source?: string;
    mode?: "markdown" | "mermaid";
    currentFilePath?: string | null;
    scrollSyncRatio?: number | null;
    onScrollChange?: (ratio: number) => void;
    embedded?: boolean;
  } = $props();

  let container = $state<HTMLDivElement>();
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
    const frontmatterMode = $settingsStore.frontmatter;
    const frontmatterLabels = { properties: t("frontmatter.properties") };
    if (renderTimer) clearTimeout(renderTimer);
    renderTimer = setTimeout(() => {
      firstRenderPending = false;
      try {
        result = mdMode === "mermaid"
          ? renderMermaidDocument(src)
          : renderMarkdown(src, frontmatterLabels, frontmatterMode);
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
    const previewTheme = previewThemes.find((entry) => entry.id === previewThemeId);
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

  // Expose the preview container and notify on re-render so the FindWidget
  // can search the rendered DOM without receiving props.
  $effect(() => {
    previewContainerStore.set(container ?? null);
    return () => previewContainerStore.set(null);
  });
  $effect(() => {
    html;
    previewRenderVersion.update(n => n + 1);
  });

  const preview = useLinkPreview(() => currentFilePath);

  function handleHover(e: MouseEvent) {
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
      preview.scheduleShow(targetVal, link.getBoundingClientRect());
    } else if (!isOverPopover) {
      preview.deferHide(() => !!(document.querySelector(".wikilink:hover") || document.querySelector("a:hover")));
    }
  }

  function hidePreview(e: MouseEvent) {
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (
      relatedTarget?.closest(".link-preview-popover") ||
      relatedTarget?.closest(".wikilink") ||
      relatedTarget?.closest("a")
    ) return;
    preview.hide();
  }

  $effect(() => {
    if (!container || scrollSyncRatio === null) return;
    html; // re-run after content is rendered (e.g., mode switch to preview)

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

      const fullPath = findFile($vaultStore.fileTree, fileName);
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
            let fullPath: string | null = null;
            
            if (currentFilePath) {
              try {
                const absPath = resolveRelativePath(decodeURIComponent(href), currentFilePath);
                fullPath = findFile($vaultStore.fileTree, absPath);
              } catch (err) {
                console.error("[Preview Click] Error resolving path relative to currentFilePath:", err);
              }
            }
            
            if (!fullPath) {
              fullPath = findFile($vaultStore.fileTree, resolvedPath);
            }

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
      visible={preview.previewVisible}
      content={preview.previewContent}
      x={preview.previewX}
      y={preview.previewY}
      placement={preview.previewPlacement}
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

  /* Markdown element colors driven by preview-theme CSS variables.
     The `.preview` prefix gives higher specificity than the legacy CSS
     injected by applyTheme(), so these win the cascade. */
  .preview :global(.markdown-body) {
    color: var(--text-color);
  }

  .preview :global(.markdown-body h1),
  .preview :global(.markdown-body h2),
  .preview :global(.markdown-body h3),
  .preview :global(.markdown-body h4),
  .preview :global(.markdown-body h5),
  .preview :global(.markdown-body h6) {
    color: var(--heading-color);
  }

  .preview :global(.markdown-body a) {
    color: var(--link-color);
  }

  .preview :global(.markdown-body a:hover) {
    color: var(--link-hover-color);
  }

  .preview :global(.markdown-body blockquote) {
    border-left: 0.25em solid var(--blockquote-border);
    background-color: var(--blockquote-bg);
    padding-left: 1em;
    margin: 0.75em 0;
  }

  .preview :global(.markdown-body hr) {
    height: 1px;
    border: 0;
    background-color: var(--border-divider);
    margin: 1.5em 0;
  }

  .preview :global(.markdown-body del),
  .preview :global(.markdown-body s) {
    color: var(--text-muted);
  }

  .preview :global(.markdown-body mark) {
    background-color: var(--bg-hover);
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

  /* YAML front matter properties panel (Obsidian-style) */
  .preview :global(.frontmatter-properties) {
    margin: 0 0 1.25em 0;
    border: 1px solid var(--border-divider);
    border-radius: 8px;
    background: var(--bg-hover);
    overflow: hidden;
  }

  .preview :global(.frontmatter-properties summary) {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    font-size: 0.85em;
    font-weight: 600;
    color: var(--text-muted);
    cursor: pointer;
    user-select: none;
    list-style: none;
  }

  .preview :global(.frontmatter-properties summary::-webkit-details-marker) {
    display: none;
  }

  .preview :global(.frontmatter-properties summary::before) {
    content: "▸";
    display: inline-block;
    font-size: 0.75em;
    transition: transform 0.15s ease;
  }

  .preview :global(.frontmatter-properties[open] summary::before) {
    transform: rotate(90deg);
  }

  .preview :global(.frontmatter-properties .property-count) {
    font-size: 0.8em;
    font-weight: 400;
    opacity: 0.7;
  }

  .preview :global(.frontmatter-properties .property-grid) {
    border-top: 1px solid var(--border-divider);
  }

  .preview :global(.frontmatter-properties .property-row) {
    display: grid;
    grid-template-columns: 140px minmax(0, 1fr);
    gap: 12px;
    padding: 6px 12px;
    font-size: 0.92em;
    border-bottom: 1px solid var(--border-divider);
  }

  .preview :global(.frontmatter-properties .property-row:last-child) {
    border-bottom: none;
  }

  .preview :global(.frontmatter-properties .property-key) {
    color: var(--text-muted);
    word-break: break-word;
  }

  .preview :global(.frontmatter-properties .property-value) {
    color: var(--text-color);
    min-width: 0;
    word-break: break-word;
  }

  .preview :global(.frontmatter-properties .property-chip) {
    margin: 0 4px 2px 0;
  }

  .preview :global(.frontmatter-properties .property-null) {
    color: var(--text-muted);
    opacity: 0.6;
  }

  .preview :global(.frontmatter-properties .frontmatter-complex) {
    font-family: var(--font-family, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
    font-size: 0.85em;
    background: rgba(128, 128, 128, 0.06);
    padding: 0.15em 0.4em;
    border-radius: 4px;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .preview :global(.frontmatter-properties .frontmatter-raw pre) {
    margin: 0;
    padding: 10px 12px;
    border-top: 1px solid var(--border-divider);
    border-radius: 0;
    overflow-x: auto;
  }

  .preview :global(.frontmatter-properties .frontmatter-raw code) {
    background: transparent;
    padding: 0;
  }
</style>
