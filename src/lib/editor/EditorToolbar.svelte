<script lang="ts">
  import { editorStore, type EditorMode } from "../../stores/editor";
  import ExportModal from "../export/ExportModal.svelte";
  import { PanelRight } from "lucide-svelte";

  const modes: { value: EditorMode; label: string; icon: string }[] = [
    { value: "source", label: "源码", icon: "📝" },
    { value: "split", label: "分栏", icon: "📄" },
    { value: "preview", label: "预览", icon: "👁️" },
  ];

  let showExport = $state(false);
  let expanded = $state(false);
</script>

<div class="right-toolbar" class:expanded>
  {#if expanded}
    <div class="toolbar-panel">
      {#each modes as m}
        <button
          class="tool-btn"
          class:active={$editorStore.mode === m.value}
          onclick={() => editorStore.setMode(m.value)}
          title={m.label}
        >
          <span class="btn-icon">{m.icon}</span>
        </button>
      {/each}
      <div class="separator"></div>
      <button class="tool-btn" onclick={() => (showExport = true)} title="导出">
        <span class="btn-icon">📤</span>
      </button>
      <div class="separator"></div>
      <button
        class="tool-btn collapse-btn"
        onclick={() => (expanded = false)}
        title="收起"
      >
        <PanelRight size={16} />
      </button>
    </div>
  {:else}
    <button class="expand-btn" onclick={() => (expanded = true)} title="展开工具栏">
      <PanelRight size={16} />
    </button>
  {/if}
</div>

<ExportModal show={showExport} onclose={() => (showExport = false)} />

<style>
  .right-toolbar {
    position: absolute;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
    z-index: 50;
    display: flex;
    align-items: center;
  }

  .right-toolbar.expanded {
    opacity: 0.75;
    transition: opacity 0.2s;
  }

  .right-toolbar.expanded:hover {
    opacity: 1;
  }

  .toolbar-panel {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-divider);
    border-right: none;
    border-radius: 8px 0 0 8px;
    padding: 6px 4px;
    box-shadow: -2px 0 8px rgba(0, 0, 0, 0.1);
  }

  .separator {
    width: 20px;
    height: 1px;
    background: var(--border-divider);
    margin: 3px 0;
  }

  .tool-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: none;
    background: transparent;
    cursor: pointer;
    border-radius: 6px;
    color: var(--text-muted);
    font-size: 16px;
    transition: all 0.15s;
  }

  .tool-btn:hover {
    background: var(--bg-hover);
    color: var(--text-normal);
  }

  .tool-btn.active {
    background: var(--bg-hover);
    color: var(--text-normal);
  }

  .tool-btn.active .btn-icon {
    filter: none;
  }

  .collapse-btn {
    color: var(--text-muted);
    opacity: 0.5;
    font-size: 14px;
  }

  .collapse-btn:hover {
    opacity: 1;
    color: var(--text-normal);
  }

  .expand-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 48px;
    border: 1px solid var(--border-divider);
    border-right: none;
    background: color-mix(in srgb, var(--bg-secondary) 80%, transparent);
    cursor: pointer;
    border-radius: 6px 0 0 6px;
    color: var(--text-muted);
    box-shadow: -2px 0 8px rgba(0, 0, 0, 0.08);
    transition: all 0.15s;
    backdrop-filter: blur(4px);
  }

  .expand-btn:hover {
    background: var(--bg-hover);
    color: var(--text-normal);
  }

  .btn-icon {
    line-height: 1;
  }
</style>
