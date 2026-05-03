<script lang="ts">
  import { editorStore, type EditorMode } from "../../stores/editor";
  import ExportModal from "../export/ExportModal.svelte";
  import SettingsModal from "../settings/SettingsModal.svelte";

  const modes: { value: EditorMode; label: string; icon: string }[] = [
    { value: "source", label: "源码", icon: "📝" },
    { value: "split", label: "分栏", icon: "📄" },
    { value: "preview", label: "预览", icon: "👁️" },
    { value: "live", label: "即时", icon: "✨" },
  ];

  let showExport = $state(false);
  let showSettings = $state(false);
</script>

<div class="toolbar">
  <div class="mode-group">
    {#each modes as m}
      <button
        class="mode-btn"
        class:active={$editorStore.mode === m.value}
        onclick={() => editorStore.setMode(m.value)}
        title={m.label}
      >
        <span class="icon">{m.icon}</span>
      </button>
    {/each}
  </div>
  <div class="spacer"></div>
  <button class="mode-btn" onclick={() => (showExport = true)} title="导出">
    <span class="icon">📤</span>
  </button>
  <button class="mode-btn" onclick={() => (showSettings = true)} title="设置">
    <span class="icon">⚙️</span>
  </button>
</div>

<ExportModal show={showExport} onclose={() => (showExport = false)} />
<SettingsModal show={showSettings} onclose={() => (showSettings = false)} />

<style>
  .toolbar {
    display: flex;
    align-items: center;
    padding: 4px 12px;
    border-bottom: 1px solid var(--border);
    background: var(--bg-toolbar);
    gap: 8px;
  }

  .mode-group {
    display: flex;
    gap: 2px;
    background: var(--bg);
    border-radius: 6px;
    padding: 2px;
    border: 1px solid var(--border);
  }

  .spacer {
    flex: 1;
  }

  .mode-btn {
    padding: 4px 8px;
    border: none;
    background: transparent;
    cursor: pointer;
    border-radius: 4px;
    font-size: 13px;
    color: var(--text-muted);
    transition: all 0.15s;
  }

  .mode-btn:hover {
    background: var(--bg-hover);
    color: var(--text);
  }

  .mode-btn.active {
    background: var(--bg-hover);
    color: var(--text);
  }

  .icon {
    font-size: 14px;
  }
</style>
