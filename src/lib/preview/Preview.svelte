<script lang="ts">
  import { onMount, tick } from "svelte";
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
    <div class="markdown-body">{@html html}</div>
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
    line-height: 1.6;
    font-size: 15px;
    color: var(--text-normal);
  }

  .markdown-body :global(h1) { font-size: 1.8em; font-weight: 700; margin: 1em 0 0.5em; border-bottom: 1px solid var(--border-divider); padding-bottom: 0.3em; }
  .markdown-body :global(h2) { font-size: 1.5em; font-weight: 600; margin: 1em 0 0.5em; border-bottom: 1px solid var(--border-divider); padding-bottom: 0.3em; }
  .markdown-body :global(h3) { font-size: 1.25em; font-weight: 600; margin: 1em 0 0.5em; }
  .markdown-body :global(p) { margin: 0.5em 0; }
  
  .markdown-body :global(code) { background: var(--bg-secondary); padding: 2px 4px; border-radius: 4px; font-size: 0.9em; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
  .markdown-body :global(pre) { background: var(--bg-secondary); padding: var(--spacing-4); border-radius: 6px; overflow-x: auto; border: 1px solid var(--border-divider); }
  .markdown-body :global(pre code) { background: none; padding: 0; }
  
  .markdown-body :global(blockquote) { 
    border-left: 4px solid var(--interactive-accent); 
    padding-left: var(--spacing-4); 
    margin: 1em 0; 
    color: var(--text-muted);
    font-style: italic;
    background: var(--bg-secondary);
    padding-top: var(--spacing-2);
    padding-bottom: var(--spacing-2);
    border-radius: 0 4px 4px 0;
  }
  
  .markdown-body :global(table) { border-collapse: collapse; width: 100%; margin: 1em 0; }
  .markdown-body :global(th), .markdown-body :global(td) { border: 1px solid var(--border-divider); padding: var(--spacing-2) var(--spacing-3); text-align: left; }
  .markdown-body :global(th) { background: var(--bg-secondary); }
  .markdown-body :global(img) { max-width: 100%; border-radius: 4px; }
  .markdown-body :global(ul), .markdown-body :global(ol) { padding-left: 24px; margin: 0.5em 0; }
  
  .markdown-body :global(a) { color: var(--interactive-accent); text-decoration: none; }
  .markdown-body :global(a:hover) { text-decoration: underline; }

  .empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--text-muted);
    font-size: 14px;
  }
</style>
