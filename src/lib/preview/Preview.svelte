<script lang="ts">
  import { tick } from "svelte";
  import { settingsStore } from "../../stores/settings";
  import { theme } from "../../stores/theme";
  import { renderMarkdown, renderMermaidBlocks, type RenderResult } from "./markdown";
  import { themes } from "./themes";

  let { source = "" }: { source?: string } = $props();

  let container: HTMLDivElement;
  let result: RenderResult | undefined = $state.raw();
  let renderError: string | null = $state(null);

  $effect(() => {
    try {
      result = renderMarkdown(source);
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

  let html = $derived(result?.html ?? "");
</script>

<div bind:this={container} class="preview">
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
    padding: 8px;
  }
</style>
