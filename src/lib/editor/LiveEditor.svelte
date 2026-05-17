<script lang="ts">
  import Preview from "../preview/Preview.svelte";
  import { splitMarkdownBlocks, type MarkdownBlock } from "../preview/markdown";

  let { content = "", currentFilePath = null, documentMode = "markdown", onContentChange }: {
    content?: string;
    currentFilePath?: string | null;
    documentMode?: "markdown" | "mermaid";
    onContentChange?: (text: string) => void;
  } = $props();

  let editingIndex = $state<number | null>(null);
  let activeTextarea = $state<HTMLTextAreaElement | null>(null);

  let blocks = $derived(
    documentMode === "mermaid"
      ? [{
          type: "mermaid",
          source: content,
          startLine: 1,
          endLine: Math.max(content.split("\n").length, 1),
          startOffset: 0,
          endOffset: content.length,
        } satisfies MarkdownBlock]
      : splitMarkdownBlocks(content),
  );

  $effect(() => {
    if (editingIndex === null || !activeTextarea) return;
    activeTextarea.focus();
    const length = activeTextarea.value.length;
    activeTextarea.setSelectionRange(length, length);
  });

  function isModuleBlock(block: MarkdownBlock): boolean {
    return ["code", "mermaid", "image", "table"].includes(block.type);
  }

  function setEditing(index: number) {
    editingIndex = index;
  }

  function stopEditing() {
    editingIndex = null;
  }

  function replaceBlock(index: number, nextSource: string) {
    const block = blocks[index];
    if (!block || !onContentChange) return;
    const nextContent = content.slice(0, block.startOffset) + nextSource + content.slice(block.endOffset);
    onContentChange(nextContent);
  }

  function exactLineNumbers(block: MarkdownBlock): number[] {
    return Array.from({ length: block.endLine - block.startLine + 1 }, (_, idx) => block.startLine + idx);
  }

  function handleTextareaKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      stopEditing();
    }
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      stopEditing();
    }
  }

  function autoResize(node: HTMLTextAreaElement) {
    const adjustHeight = () => {
      node.style.height = "auto";
      node.style.height = node.scrollHeight + 2 + "px";
    };

    // Use a small delay or tick to ensure the DOM has updated with the value
    setTimeout(adjustHeight, 0);

    node.addEventListener("input", adjustHeight);
    return {
      destroy() {
        node.removeEventListener("input", adjustHeight);
      },
    };
  }
</script>

<div class="live-editor">
  {#if blocks.length === 0}
    <div class="live-block editing">
      <div class="line-gutter">
        <div class="line-no">1</div>
      </div>
      <div class="block-body">
        <textarea
          bind:this={activeTextarea}
          use:autoResize
          class="source-editor"
          placeholder="开始录入新内容..."
          oninput={(e) => onContentChange?.((e.currentTarget as HTMLTextAreaElement).value)}
          onkeydown={handleTextareaKeydown}
        ></textarea>
      </div>
    </div>
  {:else}
    {#each blocks as block, index (block.startOffset)}
      <div class="live-block" class:editing={editingIndex === index}>
        <div class="line-gutter" class:module={isModuleBlock(block)}>
          {#if editingIndex === index}
            {#each exactLineNumbers(block) as lineNo}
              <div class="line-no">{lineNo}</div>
            {/each}
          {:else if block.startLine === block.endLine}
            <div class="line-no">{block.startLine}</div>
          {:else}
            <div class="line-no">{block.startLine}</div>
            <div class="line-gap">⋮</div>
            <div class="line-no">{block.endLine}</div>
          {/if}
        </div>

        <div class="block-body">
          {#if editingIndex === index}
            <textarea
              bind:this={activeTextarea}
              use:autoResize
              class="source-editor"
              value={block.source}
              oninput={(e) => replaceBlock(index, (e.currentTarget as HTMLTextAreaElement).value)}
              onblur={stopEditing}
              onkeydown={handleTextareaKeydown}
            ></textarea>
          {:else}
            <button class="preview-shell" onclick={() => setEditing(index)}>
              <Preview
                source={block.source}
                mode={documentMode === "mermaid" ? "mermaid" : "markdown"}
                currentFilePath={currentFilePath}
                embedded={true}
              />
            </button>
          {/if}
        </div>
      </div>
    {/each}
  {/if}
</div>

<style>
  .live-editor {
    flex: 1;
    overflow-y: auto;
    padding: var(--spacing-4) 24px;
    background: var(--bg-primary);
  }

  .live-block {
    display: grid;
    grid-template-columns: 56px minmax(0, 1fr);
    gap: 12px;
    align-items: start;
    margin-bottom: 8px;
    border-radius: 8px;
  }

  .live-block.editing {
    background: rgba(128, 128, 128, 0.05);
  }

  .line-gutter {
    position: sticky;
    top: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    padding-top: 4px;
    color: var(--text-muted);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    font-size: 12px;
    user-select: none;
  }

  .line-no,
  .line-gap {
    min-height: 20px;
    line-height: 20px;
  }

  .line-gap {
    opacity: 0.5;
  }

  .block-body {
    min-width: 0;
  }

  .preview-shell {
    display: block;
    width: 100%;
    padding: 8px 12px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    cursor: text;
    text-align: left;
  }

  .preview-shell:hover {
    border-color: var(--border-divider);
    background: rgba(128, 128, 128, 0.03);
  }

  .source-editor {
    width: 100%;
    min-height: 28px;
    padding: 8px 12px;
    border: 1px solid var(--interactive-accent);
    border-radius: 8px;
    background: var(--bg-primary);
    color: var(--text-normal);
    resize: none;
    font: inherit;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    line-height: 1.6;
    outline: none;
    box-sizing: border-box;
    overflow: hidden;
  }
</style>
