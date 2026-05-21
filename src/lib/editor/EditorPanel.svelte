<script lang="ts">
  import { editorStore, triggerFindCount } from "../../stores/editor";
  import { currentFileIsImage, currentFileIsMermaid, currentFileSupportsPreview, currentFile } from "../../stores/vault";
  import { contextMenu, type ContextMenuItem } from "../../stores/contextMenu";
  import { readText } from "@tauri-apps/plugin-clipboard-manager";
  import Editor from "./Editor.svelte";
  import EditorToolbar from "./EditorToolbar.svelte";
  import ImageViewer from "./ImageViewer.svelte";
  import Preview from "../preview/Preview.svelte";

  let { content = "", onContentChange }: {
    content?: string;
    onContentChange?: (text: string) => void;
  } = $props();

  let viewScrollRatio = $state(0);

  function triggerFind() {
    triggerFindCount.update(n => n + 1);
  }

  async function handlePaste() {
    try {
      const text = await readText();
      if (text) {
        // Try to insert text at cursor
        document.execCommand("insertText", false, text);
      }
    } catch (err) {
      console.error("Failed to read clipboard:", err);
      // Fallback to native paste if Tauri plugin fails
      document.execCommand("paste");
    }
  }

  function onWorkspaceContextMenu(e: MouseEvent) {
    if ($currentFileIsImage) return;

    const items: ContextMenuItem[] = [
      { label: "剪切", action: () => document.execCommand("cut") },
      { label: "复制", action: () => document.execCommand("copy") },
      { label: "删除", action: () => document.execCommand("delete") },
      { label: "粘贴", action: () => handlePaste() },
    ];

    if ($editorStore.mode !== "preview") {
      items.push({ separator: true, label: "", action: () => {} });
      items.push({ label: "搜索", action: () => triggerFind() });
    }

    contextMenu.show(e, items);
  }
</script>

<div class="editor-panel">
  {#if $currentFileSupportsPreview}
    <EditorToolbar />
  {/if}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="workspace" class:split={$editorStore.mode === "split"} oncontextmenu={onWorkspaceContextMenu}>
    {#if $currentFileIsImage}
      <ImageViewer path={$currentFile ?? ""} />
    {:else if $editorStore.mode === "preview"}
      <Preview
        source={content}
        mode={$currentFileIsMermaid ? "mermaid" : "markdown"}
        currentFilePath={$currentFile}
        scrollSyncRatio={viewScrollRatio}
        onScrollChange={(ratio) => {
          viewScrollRatio = ratio;
        }}
      />
    {:else if $editorStore.mode === "split"}
      <div class="pane editor-pane">
        <Editor
          {content}
          {onContentChange}
          initialScrollRatio={viewScrollRatio}
          onScrollChange={(ratio) => {
            viewScrollRatio = ratio;
          }}
        />
      </div>
      <div class="pane preview-pane">
        <Preview
          source={content}
          mode={$currentFileIsMermaid ? "mermaid" : "markdown"}
          currentFilePath={$currentFile}
          scrollSyncRatio={viewScrollRatio}
        />
      </div>
    {:else}
      <Editor
        {content}
        {onContentChange}
        initialScrollRatio={viewScrollRatio}
        onScrollChange={(ratio) => {
          viewScrollRatio = ratio;
        }}
      />
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
    position: relative;
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
