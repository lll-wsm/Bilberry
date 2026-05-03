<script lang="ts">
  import { vaultStore, type FileEntry } from "../../stores/vault";
  import FileExplorer from "./FileExplorer.svelte";
  import { ChevronRight, ChevronDown, Folder, File, FileText } from "lucide-svelte";

  let { entries = [] }: { entries: FileEntry[] } = $props();

  let expandedDirs = $state(new Set<string>());

  function toggleDir(path: string) {
    if (expandedDirs.has(path)) {
      expandedDirs.delete(path);
    } else {
      expandedDirs.add(path);
    }
    // Trigger reactivity by reassigning
    expandedDirs = new Set(expandedDirs);
  }

  function handleClick(entry: FileEntry) {
    if (entry.is_dir) {
      toggleDir(entry.path);
    } else if (entry.name.endsWith(".md")) {
      vaultStore.openNote(entry.path);
    }
  }

  function fileIcon(name: string) {
    if (name.endsWith(".md")) return FileText;
    return File;
  }
</script>

{#each entries as entry}
  <div class="file-entry">
    <button
      class="entry-row"
      class:dir={entry.is_dir}
      class:expanded={expandedDirs.has(entry.path)}
      class:file={!entry.is_dir}
      class:md={!entry.is_dir && entry.name.endsWith(".md")}
      class:other={!entry.is_dir && !entry.name.endsWith(".md")}
      onclick={() => handleClick(entry)}
    >
      {#if entry.is_dir}
        <span class="chevron">
          {#if expandedDirs.has(entry.path)}
            <ChevronDown size={14} />
          {:else}
            <ChevronRight size={14} />
          {/if}
        </span>
      {:else}
        <span class="chevron placeholder"></span>
      {/if}
      <span class="icon">
        {#if entry.is_dir}
          <Folder size={14} />
        {:else}
          {#if entry.name.endsWith(".md")}
            <FileText size={14} />
          {:else}
            <File size={14} />
          {/if}
        {/if}
      </span>
      <span class="name">{entry.name}</span>
    </button>
    {#if entry.is_dir && expandedDirs.has(entry.path) && entry.children && entry.children.length > 0}
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
    gap: 2px;
    width: 100%;
    padding: 2px 8px;
    padding-left: 4px;
    border: none;
    background: transparent;
    cursor: pointer;
    font-size: 13px;
    color: var(--text-normal);
    border-radius: 4px;
  }

  .entry-row:hover {
    background: var(--bg-hover);
  }

  .entry-row.dir {
    cursor: pointer;
  }

  .entry-row.file {
    cursor: pointer;
  }

  .entry-row.other {
    cursor: default;
    color: var(--text-muted);
  }

  .entry-row.other:hover {
    background: transparent;
  }

  .chevron {
    flex-shrink: 0;
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
  }

  .chevron.placeholder {
    visibility: hidden;
  }

  .icon {
    flex-shrink: 0;
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
  }

  .entry-row.dir .icon {
    color: var(--interactive-accent);
  }

  .entry-row.md .icon {
    color: var(--text-normal);
  }

  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin-left: 2px;
  }

  .children {
    padding-left: 16px;
  }
</style>
