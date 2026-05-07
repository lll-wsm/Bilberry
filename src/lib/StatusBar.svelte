<script lang="ts">
  import { currentFileIsImage, vaultStore } from "../stores/vault";
  import { editorStore } from "../stores/editor";
  import { settingsStore } from "../stores/settings";
  import { Settings } from "lucide-svelte";

  let {
    onOpenSettings,
  }: {
    onOpenSettings?: () => void;
  } = $props();

  let wordCount = $derived(
    $vaultStore.currentContent
      ? $vaultStore.currentContent.split(/\s+/).filter(Boolean).length
      : 0,
  );
  let charCount = $derived($vaultStore.currentContent.length);

  let modeLabel = $derived(
    ({ split: "分栏", preview: "预览", source: "源码", live: "即时" } as const)[
      $editorStore.mode
    ] ?? "分栏",
  );

  const encodings = [
    { value: "UTF-8", label: "UTF-8" },
    { value: "GB18030", label: "GBK/GB18030" },
    { value: "Big5", label: "Big5" },
    { value: "Shift_JIS", label: "Shift JIS" },
    { value: "UTF-16LE", label: "UTF-16 LE" },
    { value: "Windows-1252", label: "Win-1252" }
  ];

  function handleEncodingChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    vaultStore.reloadNoteWithEncoding(target.value);
  }
</script>

{#if $vaultStore.vault}
  <div class="statusbar">
    <span class="left">
      <button class="icon-btn" onclick={onOpenSettings} title="设置">
        <Settings size={13} />
      </button>
      <span class="divider"></span>
      <span class="file-name">
        {$vaultStore.currentFilePath
          ? $vaultStore.currentFilePath.split("/").pop()
          : "未选择"}
      </span>
    </span>
    <span class="right">
      <span class="stat">{wordCount} 词</span>
      <span class="stat">{charCount} 字</span>
      
      {#if $vaultStore.currentFilePath && !$currentFileIsImage}
        <select 
          class="encoding-select" 
          value={$vaultStore.currentEncoding} 
          onchange={handleEncodingChange}
          title="重新以该编码加载文件"
        >
          {#each encodings as enc}
            <option value={enc.value}>{enc.label}</option>
          {/each}
        </select>
      {/if}

      <span class="stat mode">{modeLabel}</span>
    </span>
  </div>
{/if}

<style>
  .statusbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 var(--spacing-3);
    border-top: 1px solid var(--border-divider);
    background: var(--bg-secondary);
    color: var(--text-muted);
    font-size: 11px;
    user-select: none;
    height: 24px;
    z-index: 100;
    -webkit-app-region: no-drag;
  }

  .left, .right {
    display: flex;
    align-items: center;
    gap: var(--spacing-3);
  }

  .file-name {
    max-width: 300px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    opacity: 0.9;
  }

  .stat {
    white-space: nowrap;
    opacity: 0.9;
  }

  .mode {
    padding: 2px 6px;
    border-radius: 3px;
    background: var(--bg-hover);
    font-weight: 500;
  }

  .encoding-select {
    background: transparent;
    color: var(--text-muted);
    border: none;
    font-size: 11px;
    outline: none;
    cursor: pointer;
    opacity: 0.9;
    padding: 2px;
  }

  .encoding-select option {
    background: var(--bg-primary);
    color: var(--text-normal);
  }

  .encoding-select:hover, .encoding-select:focus {
    opacity: 1;
    background: var(--bg-hover);
    border-radius: 3px;
  }

  .icon-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-muted);
    padding: 2px;
    border-radius: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.1s ease, background 0.1s ease;
  }

  .icon-btn:hover {
    color: var(--text-normal);
    background: var(--bg-hover);
  }

  .divider {
    width: 1px;
    height: 12px;
    background: var(--border-divider);
    margin: 0 2px;
  }
</style>
