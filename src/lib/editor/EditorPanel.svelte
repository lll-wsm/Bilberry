<script lang="ts">
  import { editorStore } from "../../stores/editor";
  import Editor from "./Editor.svelte";
  import EditorToolbar from "./EditorToolbar.svelte";
  import Preview from "../preview/Preview.svelte";

  let { content = "", onContentChange }: {
    content?: string;
    onContentChange?: (text: string) => void;
  } = $props();
</script>

<div class="editor-panel">
  <EditorToolbar />
  <div class="workspace" class:split={$editorStore.mode === "split"}>
    {#if $editorStore.mode === "preview"}
      <Preview source={content} />
    {:else if $editorStore.mode === "live"}
      <Editor {content} {onContentChange} />
    {:else if $editorStore.mode === "split"}
      <div class="pane editor-pane">
        <Editor {content} {onContentChange} />
      </div>
      <div class="pane preview-pane">
        <Preview source={content} />
      </div>
    {:else}
      <Editor {content} {onContentChange} />
    {/if}
  </div>
</div>

<style>
  .editor-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--bg-primary);
  }

  .workspace {
    flex: 1;
    display: flex;
    overflow: hidden;
  }

  .workspace.split {
    flex-direction: row;
    background: var(--border-divider);
    gap: 2px;
  }

  .pane {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--bg-primary);
  }

  .editor-pane {
    border-right: none;
  }
</style>
