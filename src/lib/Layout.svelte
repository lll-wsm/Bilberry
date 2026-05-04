<script lang="ts">
  import { onMount } from "svelte";
  import { open } from "@tauri-apps/plugin-dialog";
  import { vaultStore } from "../stores/vault";
  import { settingsStore } from "../stores/settings";
  import { loadHistory, addToHistory, removeFromHistory } from "../stores/vaultHistory";
  import { applyTheme } from "./preview/themes";
  import Sidebar from "./Sidebar.svelte";
  import EditorPanel from "./editor/EditorPanel.svelte";
  import StatusBar from "./StatusBar.svelte";
  import SettingsModal from "./settings/SettingsModal.svelte";
  import { toggle, theme } from "../stores/theme";
  import { X } from "lucide-svelte";
  import TabBar from "./editor/TabBar.svelte";
  import ContextMenu from "./ui/ContextMenu.svelte";

  let sidebarOpen = $state(true);
  let recentDirs = $state<string[]>([]);
  let showSettings = $state(false);

  onMount(() => {
    loadHistory().then((h) => recentDirs = h);
  });

  $effect(() => {
    applyTheme($settingsStore.previewTheme);
  });

  async function handleOpenVault() {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "选择目录",
    });
    if (selected) {
      try {
        await vaultStore.openVault(selected);
        await addToHistory(selected);
        recentDirs = await loadHistory();
      } catch (e) {
        alert("打开目录失败: " + e);
      }
    }
  }

  async function handleCreateVault() {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "选择目录",
    });
    if (selected) {
      const name = prompt("输入目录名称:");
      if (name) {
        try {
          await vaultStore.createVault(`${selected}/${name}`);
          await addToHistory(`${selected}/${name}`);
          recentDirs = await loadHistory();
        } catch (e) {
          alert("创建目录失败: " + e);
        }
      }
    }
  }

  async function handleOpenRecent(path: string) {
    try {
      await vaultStore.openVault(path);
      await addToHistory(path);
      recentDirs = await loadHistory();
    } catch (e) {
      alert("打开目录失败: " + e);
      await removeFromHistory(path);
      recentDirs = await loadHistory();
    }
  }

  async function handleRemoveHistory(path: string) {
    await removeFromHistory(path);
    recentDirs = await loadHistory();
  }

  function onContentChange(text: string) {
    vaultStore.updateContent($vaultStore.currentFilePath, text);
  }

  let showWelcome = $derived(!$vaultStore.vault);
</script>

{#if showWelcome}
  <div class="welcome">
    <h1>Bilberry</h1>
    <p class="subtitle">Markdown 笔记编辑器</p>
    <div class="actions">
      <button class="btn" onclick={handleCreateVault}>新建目录</button>
      <button class="btn" onclick={handleOpenVault}>打开目录</button>
    </div>
    {#if recentDirs.length > 0}
      <div class="recent">
        <p class="recent-label">最近打开</p>
        {#each recentDirs as dir}
          <div class="recent-item" onclick={() => handleOpenRecent(dir)} onkeydown={(e) => { if (e.key === 'Enter') handleOpenRecent(dir); }} role="button" tabindex="0" title={dir}>
            <span class="recent-name">{dir.split("/").pop()}</span>
            <button class="recent-remove" onclick={(e) => { e.stopPropagation(); handleRemoveHistory(dir); }}>
              <X size={14} />
            </button>
          </div>
        {/each}
      </div>
    {/if}
  </div>
{:else}
  <div class="app-root">
        <div class="layout">
      {#if sidebarOpen}
        <Sidebar />
      {/if}
      <main class="main-content">
        <TabBar {sidebarOpen} onToggleSidebar={() => sidebarOpen = !sidebarOpen} />
        {#if $vaultStore.currentFilePath}
          <EditorPanel
            content={$vaultStore.currentContent}
            {onContentChange}
          />
        {:else}
          <div class="empty-state">
            <p>选择一篇笔记开始编辑</p>
          </div>
        {/if}
      </main>
    </div>
    <StatusBar onToggleTheme={toggle} onOpenSettings={() => showSettings = true} />
    <SettingsModal show={showSettings} onclose={() => showSettings = false} />
    <ContextMenu />
  </div>
{/if}

<style>
  .welcome {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    gap: 16px;
    background: var(--bg-primary);
    color: var(--text-normal);
    padding-top: 28px;
    -webkit-app-region: drag;
  }

  .welcome h1 {
    font-size: 32px;
    font-weight: 700;
  }

  .subtitle {
    color: var(--text-muted);
  }

  .actions {
    display: flex;
    gap: 12px;
    margin-top: 24px;
    -webkit-app-region: no-drag;
  }

  .btn {
    padding: var(--spacing-2) var(--spacing-4);
    border: 1px solid var(--border-divider);
    border-radius: 4px;
    background: var(--bg-secondary);
    cursor: pointer;
    font-size: 14px;
    color: var(--text-normal);
    transition: background 0.1s ease;
  }

  .btn:hover {
    background: var(--bg-hover);
  }

  .recent {
    margin-top: 32px;
    width: 360px;
    max-width: 80vw;
    -webkit-app-region: no-drag;
  }

  .recent-label {
    font-size: 12px;
    color: var(--text-muted);
    text-align: center;
    margin-bottom: 8px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .recent-item {
    display: flex;
    align-items: center;
    gap: var(--spacing-2);
    width: 100%;
    padding: var(--spacing-2) var(--spacing-3);
    border: none;
    border-radius: 4px;
    background: transparent;
    cursor: pointer;
    text-align: left;
    transition: background 0.1s ease;
  }

  .recent-item:hover {
    background: var(--bg-hover);
  }

  .recent-name {
    font-size: 14px;
    color: var(--text-normal);
    font-weight: 500;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .recent-remove {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 4px;
    color: var(--text-muted);
    opacity: 0;
    transition: opacity 0.1s ease;
  }

  .recent-item:hover .recent-remove {
    opacity: 1;
  }

  .recent-remove:hover {
    background: var(--bg-hover);
    color: var(--text-normal);
  }

  .app-root {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
  }

  .layout {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  .main-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .empty-state {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
  }
</style>
