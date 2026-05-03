<script lang="ts">
  import { open } from "@tauri-apps/plugin-dialog";
  import { vaultStore } from "../stores/vault";
  import Sidebar from "./Sidebar.svelte";
  import EditorPanel from "./editor/EditorPanel.svelte";
  import StatusBar from "./StatusBar.svelte";
  import { toggle, theme } from "../stores/theme";
  import { Sun, Moon, PanelLeftClose, PanelLeft } from "lucide-svelte";

  let sidebarOpen = $state(true);

  async function handleOpenVault() {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "选择 Vault 目录",
    });
    if (selected) {
      try {
        await vaultStore.openVault(selected);
      } catch (e) {
        alert("打开 Vault 失败: " + e);
      }
    }
  }

  async function handleCreateVault() {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "选择创建 Vault 的位置",
    });
    if (selected) {
      const name = prompt("输入 Vault 名称:");
      if (name) {
        try {
          await vaultStore.createVault(`${selected}/${name}`);
        } catch (e) {
          alert("创建 Vault 失败: " + e);
        }
      }
    }
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
      <button class="btn" onclick={handleCreateVault}>新建 Vault</button>
      <button class="btn" onclick={handleOpenVault}>打开 Vault</button>
    </div>
  </div>
{:else}
  <div class="app-root">
    <div class="layout">
      {#if sidebarOpen}
        <Sidebar />
      {/if}
      <main class="main-content">
        <div class="editor-header">
          <div class="header-left">
            <button class="icon-btn" onclick={() => sidebarOpen = !sidebarOpen} title="Toggle Sidebar">
              {#if sidebarOpen}
                <PanelLeftClose size={16} />
              {:else}
                <PanelLeft size={16} />
              {/if}
            </button>
            {#if $vaultStore.currentFilePath}
              <span class="current-file">{$vaultStore.currentFilePath}</span>
            {/if}
          </div>
          <div class="header-actions">
            <button class="icon-btn" onclick={toggle} title="Toggle Theme">
              {#if $theme === 'dark'}
                <Sun size={16} />
              {:else}
                <Moon size={16} />
              {/if}
            </button>
          </div>
        </div>
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
    <StatusBar />
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

  .editor-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-2) var(--spacing-4);
    border-bottom: 1px solid var(--border-divider);
    background: var(--bg-secondary);
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: var(--spacing-2);
  }

  .current-file {
    font-size: 13px;
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .header-actions {
    display: flex;
    gap: 4px;
  }

  .icon-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-muted);
    padding: var(--spacing-1);
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.1s ease, color 0.1s ease;
  }

  .icon-btn:hover {
    background: var(--bg-hover);
    color: var(--text-normal);
  }

  .empty-state {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
  }
</style>
