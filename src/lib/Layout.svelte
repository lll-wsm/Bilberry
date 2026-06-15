<script lang="ts">
  import { onMount } from "svelte";
  import { open } from "@tauri-apps/plugin-dialog";
  import { vaultStore } from "../stores/vault";
  import { settingsStore } from "../stores/settings";
  import { loadHistory, addToHistory, removeFromHistory, addToRecent } from "../stores/vaultHistory";
  import { applyTheme, initPreviewThemeSync } from "./preview/themes";
  import { editorStore, triggerFindCount, triggerPreviewFindCount } from "../stores/editor";

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

  // Apply the cached preview theme immediately to prevent flash
  initPreviewThemeSync();

  let sidebarOpen = $state(true);
  let recentDirs = $state<string[]>([]);
  let showSettings = $state(false);
  let unlisteners: UnlistenFn[] = [];

  let isCtrlPressed = $state(false);
  let isMetaPressed = $state(false);

  onMount(() => {
    let disposed = false;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Control") isCtrlPressed = true;
      if (e.key === "Meta" || e.key === "Command") isMetaPressed = true;

      if ((e.key === "f" || e.key === "F") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleTriggerFind();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Control") isCtrlPressed = false;
      if (e.key === "Meta" || e.key === "Command") isMetaPressed = false;
    };
    const handleBlur = () => {
      isCtrlPressed = false;
      isMetaPressed = false;
    };
    
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);

    // Check if initial vault/file paths are passed in URL query params
    const params = new URLSearchParams(window.location.search);
    const initialVault = params.get("vault");
    const initialFile = params.get("file");

    loadHistory().then((h) => {
      recentDirs = h;
      
      if (initialVault) {
        vaultStore.openVault(initialVault).then(() => {
          addToHistory(initialVault);
          if (initialFile) {
            vaultStore.openNote(initialFile);
            addToRecent(initialFile, "file");
          }
        }).catch((e) => {
          console.error("Failed to open initial vault from query param:", initialVault, e);
        });
      } else if (initialFile) {
        const parentDir = initialFile.substring(0, initialFile.lastIndexOf("/"));
        vaultStore.openVault(parentDir).then(() => {
          vaultStore.openNote(initialFile);
          addToRecent(initialFile, "file");
        }).catch((e) => {
          console.error("Failed to open parent vault of file:", initialFile, e);
        });
      } else if (h.length > 0) {
        // Auto-open last closed directory on startup if no query parameter is present
        handleOpenRecent(h[0]);
      }
    });

    const registerListeners = async () => {
      const listeners = await Promise.all([
        listen("menu-show-settings", () => {
          showSettings = true;
        }),
        listen("menu-find", () => {
          handleTriggerFind();
        }),
        listen("menu-create-vault", () => {
          handleCreateVault();
        }),
        listen("menu-open-vault", () => {
          handleOpenVault(isCtrlPressed || isMetaPressed);
        }),
        listen<{ path: string; kind: string }>("menu-open-recent", (event) => {
          const { path, kind } = event.payload;
          const newWindow = isCtrlPressed || isMetaPressed;
          if (kind === "vault") {
            handleOpenRecent(path, newWindow);
            addToRecent(path, "vault");
          } else {
            handleOpenRecentFile(path, newWindow);
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
          settingsStore.updateSetting("fontSize", Math.min($settingsStore.fontSize + 1, 40));
        }),
        listen("menu-zoom-out", () => {
          settingsStore.updateSetting("fontSize", Math.max($settingsStore.fontSize - 1, 8));
        }),
        listen("menu-zoom-reset", () => {
          settingsStore.updateSetting("fontSize", 16);
        }),
      ]);

      if (disposed) {
        listeners.forEach((unlisten) => unlisten());
        return;
      }

      unlisteners.push(...listeners);

      // Save session when the window is about to close (window button, Cmd+W, Cmd+Q)
      getCurrentWindow().onCloseRequested(async (event) => {
        event.preventDefault();
        try {
          await vaultStore.ensureSaved();
          vaultStore.closeVault();
        } catch (err) {
          console.error("Failed to save changes before closing:", err);
        } finally {
          getCurrentWindow().destroy();
        }
      }).then((unlisten) => unlisteners.push(unlisten));
      await invoke("notify_frontend_ready");
    };

    registerListeners().catch((error) => {
      console.error("Failed to register native event listeners:", error);
    });

    return () => {
      disposed = true;
      unlisteners.forEach((u) => u());
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  });

  async function handleOpenRecentFile(path: string, newWindow = false) {
    if (newWindow) {
      try {
        await invoke("open_in_new_window", { filePath: path });
      } catch (e) {
        alert("打开新窗口失败: " + e);
      }
    } else {
      // Open the parent directory as vault, then open the file
      const parentDir = path.substring(0, path.lastIndexOf("/"));
      try {
        if ($vaultStore.vault?.path !== parentDir) {
          await vaultStore.openVault(parentDir);
        }
        await vaultStore.openNote(path);
        addToRecent(path, "file");
      } catch {
        alert("无法打开文件: " + path);
      }
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

  async function handleOpenVault(newWindow = false) {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "选择目录",
    });
    if (selected) {
      if (newWindow) {
        try {
          await invoke("open_in_new_window", { vaultPath: selected });
        } catch (e) {
          alert("打开新窗口失败: " + e);
        }
      } else {
        try {
          if ($vaultStore.vault?.path !== selected) {
            await vaultStore.openVault(selected);
          }
          await addToHistory(selected);
          recentDirs = await loadHistory();
        } catch (e) {
          alert("打开目录失败: " + e);
        }
      }
    }
  }

  async function handleCreateVault() {
    const selected = await open({
      directory: true,
      multiple: false,
      canCreateDirectories: true,
      title: "新建或选择目录",
    });
    if (selected) {
      try {
        if ($vaultStore.vault?.path !== selected) {
          await vaultStore.openVault(selected);
        }
        await addToHistory(selected);
        recentDirs = await loadHistory();
      } catch (e) {
        alert("打开目录失败: " + e);
      }
    }
  }

  async function handleOpenRecent(path: string, newWindow = false) {
    if (newWindow) {
      try {
        await invoke("open_in_new_window", { vaultPath: path });
      } catch (e) {
        alert("打开新窗口失败: " + e);
      }
    } else {
      try {
        if ($vaultStore.vault?.path !== path) {
          await vaultStore.openVault(path);
        }
        await addToHistory(path);
        recentDirs = await loadHistory();
      } catch (e) {
        alert("打开目录失败: " + e);
        await removeFromHistory(path);
        recentDirs = await loadHistory();
      }
    }
  }

  function handleTriggerFind() {
    if (!$vaultStore.currentFilePath) return;

    if ($editorStore.mode === "preview") {
      triggerPreviewFindCount.update(n => n + 1);
    } else {
      triggerFindCount.update(n => n + 1);
    }
  }

  function onContentChange(text: string) {
    vaultStore.updateContent($vaultStore.currentFilePath, text);
  }
</script>

<div class="app-root">
  <Titlebar />
  <MenuBar />
  <div class="layout">
    {#if sidebarOpen}
      <Sidebar />
    {/if}
    <main class="main-content">
      <TabBar {sidebarOpen} onToggleSidebar={() => sidebarOpen = !sidebarOpen} />
      {#if $vaultStore.vault}
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
      {:else}
        <div class="empty-state">
          <p>未打开目录。请通过“文件”菜单新建或打开目录。</p>
        </div>
      {/if}
    </main>
  </div>
  <StatusBar onOpenSettings={() => showSettings = true} />
  <SettingsModal show={showSettings} onclose={() => showSettings = false} />
  <ContextMenu />
</div>

<style>
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
