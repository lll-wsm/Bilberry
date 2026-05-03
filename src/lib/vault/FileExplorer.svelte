<script lang="ts">
  import { vaultStore, type FileEntry } from "../../stores/vault";
  import FileExplorer from "./FileExplorer.svelte";

  let { entries = [] }: { entries: FileEntry[] } = $props();

  function handleClick(entry: FileEntry) {
    if (!entry.is_dir) {
      vaultStore.openNote(entry.path);
    }
  }
</script>

{#each entries as entry}
  <div class="file-entry">
    <button
      class="entry-row"
      class:dir={entry.is_dir}
      onclick={() => handleClick(entry)}
    >
      <span class="icon">{entry.is_dir ? "📁" : "📄"}</span>
      <span class="name">{entry.name}</span>
    </button>
    {#if entry.is_dir && entry.children && entry.children.length > 0}
      <div class="children">
        <FileExplorer entries={entry.children} />
      </div>
    {/if}
  </div>
{/each}

<style>
  .file-entry {
    user-select: none;
  }

  .entry-row {
    display: flex;
    align-items: center;
    gap: 4px;
    width: 100%;
    padding: 2px 8px;
    border: none;
    background: transparent;
    cursor: pointer;
    font-size: 13px;
    color: var(--text);
    border-radius: 4px;
  }

  .entry-row:hover {
    background: var(--bg-hover);
  }

  .icon {
    flex-shrink: 0;
    font-size: 12px;
  }

  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .children {
    padding-left: 16px;
  }
</style>
