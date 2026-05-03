<script lang="ts">
  import { vaultStore } from "../stores/vault";
  import FileExplorer from "./vault/FileExplorer.svelte";
  import SearchPanel from "./vault/SearchPanel.svelte";
  import { FolderOpen, Search } from "lucide-svelte";

  type Tab = "files" | "search";
  let activeTab: Tab = $state("files");
</script>

<div class="sidebar">
  <div class="sidebar-header">
    <span class="vault-name">{$vaultStore.vault?.name ?? ""}</span>
    <div class="tabs">
      <button
        class="tab"
        class:active={activeTab === "files"}
        onclick={() => (activeTab = "files")}
        title="文件"
      ><FolderOpen size={16} /></button>
      <button
        class="tab"
        class:active={activeTab === "search"}
        onclick={() => (activeTab = "search")}
        title="搜索"
      ><Search size={16} /></button>
    </div>
  </div>
  <div class="sidebar-content">
    {#if activeTab === "files"}
      <FileExplorer entries={$vaultStore.fileTree} />
    {:else if activeTab === "search"}
      <SearchPanel />
    {/if}
  </div>
</div>

<style>
  .sidebar {
    width: 240px;
    border-right: 1px solid var(--border-divider);
    display: flex;
    flex-direction: column;
    background: var(--bg-secondary);
  }

  .sidebar-header {
    display: flex;
    flex-direction: column;
    border-bottom: 1px solid var(--border-divider);
  }

  .vault-name {
    font-weight: 600;
    font-size: 13px;
    padding: var(--spacing-2) var(--spacing-3) var(--spacing-1);
    color: var(--text-normal);
  }

  .tabs {
    display: flex;
    gap: 0;
  }

  .tab {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--spacing-2) 0;
    border: none;
    background: transparent;
    cursor: pointer;
    color: var(--text-muted);
    border-bottom: 2px solid transparent;
    transition: all 0.1s ease;
  }

  .tab:hover {
    color: var(--text-normal);
    background: var(--bg-hover);
  }

  .tab.active {
    color: var(--interactive-accent);
    border-bottom-color: var(--interactive-accent);
  }

  .sidebar-content {
    flex: 1;
    overflow-y: auto;
  }
</style>
