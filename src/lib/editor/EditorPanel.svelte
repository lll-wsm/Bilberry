<script lang="ts">
  import { editorStore, triggerFindCount } from "../../stores/editor";
  import { currentFileIsImage, currentFileIsMermaid, currentFileSupportsPreview, currentFile, vaultStore } from "../../stores/vault";
  import { contextMenu, type ContextMenuItem } from "../../stores/contextMenu";
  import { readText } from "@tauri-apps/plugin-clipboard-manager";
  import Editor from "./Editor.svelte";
  import EditorToolbar from "./EditorToolbar.svelte";
  import ImageViewer from "./ImageViewer.svelte";
  import Preview from "../preview/Preview.svelte";
  import FindWidget from "./FindWidget.svelte";
  import { t } from "../i18n/i18n.svelte";

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
      { label: t("common.cut"), action: () => document.execCommand("cut") },
      { label: t("common.copy"), action: () => document.execCommand("copy") },
      { label: t("common.delete"), action: () => document.execCommand("delete") },
      { label: t("common.paste"), action: () => handlePaste() },
      { separator: true, label: "", action: () => {} },
      { label: t("editor.search"), action: () => triggerFind() },
    ];

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
    {:else if $currentFileSupportsPreview && $editorStore.mode === "preview"}
      <Preview
        source={content}
        mode={$currentFileIsMermaid ? "mermaid" : "markdown"}
        currentFilePath={$currentFile}
        scrollSyncRatio={viewScrollRatio}
        onScrollChange={(ratio) => {
          viewScrollRatio = ratio;
        }}
      />
    {:else if $currentFileSupportsPreview && $editorStore.mode === "split"}
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

  <FindWidget />

  {#if $vaultStore.fileLoading}
    <div class="loading-overlay">
      <span class="loading-text">{t("editor.loading")}</span>
    </div>
  {/if}
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

  .loading-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--bg-primary) 72%, transparent);
    z-index: 60;
    /* Visual-only: never blocks input, so the editor is always interactive. */
    pointer-events: none;
  }

  .loading-text {
    font-size: 13px;
    color: var(--text-muted);
  }
</style>
