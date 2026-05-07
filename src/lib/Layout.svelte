<script lang="ts">
  import { onMount } from "svelte";
  import { open } from "@tauri-apps/plugin-dialog";
  import { vaultStore } from "../stores/vault";
  import { settingsStore } from "../stores/settings";
  import { loadHistory, addToHistory, removeFromHistory, addToRecent } from "../stores/vaultHistory";
  import { applyTheme, initPreviewThemeSync } from "./preview/themes";

// Apply the cached preview theme immediately to prevent flash
initPreviewThemeSync();
  import Sidebar from "./Sidebar.svelte";
  import EditorPanel from "./editor/EditorPanel.svelte";
  import StatusBar from "./StatusBar.svelte";
  import SettingsModal from "./settings/SettingsModal.svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { invoke } from "@tauri-apps/api/core";
  import { listen, type UnlistenFn } from "@tauri-apps/api/event";
  import { X } from "lucide-svelte";
  import TabBar from "./editor/TabBar.svelte";
  import ContextMenu from "./ui/ContextMenu.svelte";
  import Titlebar from "./ui/Titlebar.svelte";
  import MenuBar from "./ui/MenuBar.svelte";

  let sidebarOpen = $state(true);
  let recentDirs = $state<string[]>([]);
  let showSettings = $state(false);
  let unlisteners: UnlistenFn[] = [];

  onMount(() => {
    loadHistory().then((h) => recentDirs = h);

    let disposed = false;

    const registerListeners = async () => {
      const listeners = await Promise.all([
        listen("menu-show-settings", () => {
          showSettings = true;
        }),
        listen("menu-open-vault", () => {
          handleOpenVault();
        }),
        listen<{ path: string; kind: string }>("menu-open-recent", (event) => {
          const { path, kind } = event.payload;
          if (kind === "vault") {
            handleOpenRecent(path);
            addToRecent(path, "vault");
          } else {
            handleOpenRecentFile(path);
          }
        }),
        listen("menu-close-window", () => {
          vaultStore.closeVault();
          getCurrentWindow().close();
        }),
        listen<string>("file-opened", (event) => {
          handleOpenRecentFile(event.payload);
        }),
        listen("menu-zoom-in", () => {
          settingsStore.update(s => ({ ...s, fontSize: Math.min(s.fontSize + 1, 40) }));
        }),
        listen("menu-zoom-out", () => {
          settingsStore.update(s => ({ ...s, fontSize: Math.max(s.fontSize - 1, 8) }));
        }),
        listen("menu-zoom-reset", () => {
          settingsStore.update(s => ({ ...s, fontSize: 16 }));
        }),
      ]);

      if (disposed) {
        listeners.forEach((unlisten) => unlisten());
        return;
      }

      unlisteners.push(...listeners);

      // Save session when the window is about to close (window button, Cmd+W, Cmd+Q)
    getCurrentWindow().onCloseRequested(() => {
      vaultStore.closeVault();
    }).then((unlisten) => unlisteners.push(unlisten));
      await invoke("notify_frontend_ready");
    };

    registerListeners().catch((error) => {
      console.error("Failed to register native event listeners:", error);
    });

    return () => {
      disposed = true;
      unlisteners.forEach((u) => u());
    };
  });

  async function handleOpenRecentFile(path: string) {
    // Open the parent directory as vault, then open the file
    const parentDir = path.substring(0, path.lastIndexOf("/"));
    try {
      await vaultStore.openVault(parentDir);
      await vaultStore.openNote(path);
      addToRecent(path, "file");
    } catch {
      alert("无法打开文件: " + path);
    }
  }

  let systemIsDark = $state(typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)").matches : false);

  onMount(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      systemIsDark = e.matches;
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  });

  $effect(() => {
    let tid = $settingsStore.previewTheme;
    if (tid === "system") {
      tid = systemIsDark ? "one-dark" : "github-light";
    }
    applyTheme(tid);
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

  function onWelcomeDrag(e: MouseEvent) {
    if ((e.target as HTMLElement).closest("button, input, a, [role='button']")) return;
    e.preventDefault();
    getCurrentWindow().startDragging();
  }
</script>

{#if showWelcome}
  <div class="welcome-container">
    <Titlebar />
    <MenuBar />
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="welcome" onmousedown={onWelcomeDrag}>
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
  </div>
{:else}
  <div class="app-root">
    <Titlebar />
    <MenuBar />
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
    <StatusBar onOpenSettings={() => showSettings = true} />
    <SettingsModal show={showSettings} onclose={() => showSettings = false} />
    <ContextMenu />
  </div>
{/if}

<style>
  .welcome-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: var(--bg-primary);
  }

  .welcome {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
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

  .recent {
    margin-top: 32px;
    width: 360px;
    max-width: 80vw;
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
