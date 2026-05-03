<script lang="ts">
  import { onMount, tick } from "svelte";
  import { settingsStore } from "../../stores/settings";
  import { renderMarkdown, type RenderResult } from "./markdown";

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

  onMount(() => {
    applyMermaid();
  });

  $effect(() => {
    // Re-run mermaid when content changes
    if (result?.mermaidBlocks && result.mermaidBlocks.length > 0) {
      applyMermaid();
    }
  });

  async function applyMermaid() {
    if (!result?.mermaidBlocks.length) return;

    // Wait for DOM update
    await tick();
    // We need to wait for the next microtask
    await new Promise((r) => setTimeout(r, 50));

    try {
      const mermaid = await import("mermaid");
      mermaid.default.init(undefined, document.querySelectorAll(".mermaid-container"));
    } catch (e) {
      console.error("Mermaid render error:", e);
    }
  }

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
</style>
