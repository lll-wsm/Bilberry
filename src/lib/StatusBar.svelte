<script lang="ts">
  import { currentFileIsImage, vaultStore } from "../stores/vault";
  import { editorStore } from "../stores/editor";
  import { t } from "./i18n/i18n.svelte";

  // Word/char counts are computed debounced: for large documents splitting the
  // whole content on every keystroke would add noticeable main-thread work.
  let wordCount = $state(0);
  let charCount = $state(0);
  let countTimer: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    const content = $vaultStore.currentContent;
    if (countTimer) clearTimeout(countTimer);
    countTimer = setTimeout(() => {
      wordCount = content ? content.split(/\s+/).filter(Boolean).length : 0;
      charCount = content.length;
    }, 150);
    return () => {
      if (countTimer) clearTimeout(countTimer);
    };
  });

  let modeLabel = $derived(
    t(
      ({ split: "status.split", preview: "status.preview", source: "status.source" } as const)[
        $editorStore.mode
      ] ?? "status.split",
    ),
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
    <span class="left"></span>
    <span class="right">
      <span class="stat">{t("status.words", { count: wordCount })}</span>
      <span class="stat">{t("status.chars", { count: charCount })}</span>
      
      {#if $vaultStore.currentFilePath && !$currentFileIsImage}
        <select 
          class="encoding-select" 
          value={$vaultStore.currentEncoding} 
          onchange={handleEncodingChange}
          title={t("status.reloadWithEncoding")}
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
    background: var(--header-bg);
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
</style>
