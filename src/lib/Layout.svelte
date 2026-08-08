<script lang="ts">
  import { onMount } from "svelte";
  import { open, save, ask } from "@tauri-apps/plugin-dialog";
  import { vaultStore } from "../stores/vault";
  import { settingsStore } from "../stores/settings";
  import { loadHistory, addToHistory, removeFromHistory, addToRecent } from "../stores/vaultHistory";
  import { themeManager } from "./themes/theme-manager";
  import { previewThemes } from "./themes/preview-themes";
  import { editorStore, triggerFindCount } from "../stores/editor";

  import Sidebar from "./Sidebar.svelte";
  import EditorPanel from "./editor/EditorPanel.svelte";
  import StatusBar from "./StatusBar.svelte";
  import SettingsModal from "./settings/SettingsModal.svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { invoke } from "@tauri-apps/api/core";
  import { listen, type UnlistenFn } from "@tauri-apps/api/event";
  import { X } from "lucide-svelte";
  import ContextMenu from "./ui/ContextMenu.svelte";
  import Titlebar from "./ui/Titlebar.svelte";
  import MenuBar from "./ui/MenuBar.svelte";
  import { initI18n, t } from "./i18n/i18n.svelte";

  // Apply the cached preview theme immediately to prevent flash
  themeManager.initSync();

  let sidebarOpen = $state(false);
  let recentDirs = $state<string[]>([]);
  let showSettings = $state(false);
  let unlisteners: UnlistenFn[] = [];

  let isCtrlPressed = $state(false);
  let isMetaPressed = $state(false);

  $effect(() => {
    getCurrentWindow().setTitle("");
  });

  onMount(() => {
    // Resolve the UI language (system-detected or user override) and keep the
    // native application menu in sync.
    initI18n();

    // Single source of truth for the native Theme menu: push the preview theme
    // list so the macOS menu shows exactly the themes the app ships (instead
    // of a hardcoded Rust-side copy that can drift).
    invoke("set_theme_list", {
      themes: previewThemes.map((t) => ({ id: t.id, label: t.label, mode: t.mode })),
    }).catch(() => {});


    let disposed = false;
    let hasOpenedFile = false;

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
    const isUntitled = params.get("untitled") === "1";

    // Wait a brief moment to let the event loop process OS file-open events on startup
    setTimeout(() => {
      if (disposed) return;
      loadHistory().then(async (h) => {
        recentDirs = h;

        if (initialVault) {
          vaultStore.openVault(initialVault).then(() => {
            addToHistory(initialVault);
            sidebarOpen = true;
            if (initialFile) {
              vaultStore.openNote(initialFile);
              addToRecent(initialFile, "file");
            }
          }).catch((e) => {
            console.error("Failed to open initial vault from query param:", initialVault, e);
          });
        } else if (initialFile) {
          vaultStore.openSingleFile(initialFile).then(() => {
            addToRecent(initialFile, "file");
          }).catch((e) => {
            console.error("Failed to open file in single file mode:", initialFile, e);
          });
        } else if (isUntitled) {
          vaultStore.newUntitled();
        }
      });
    }, 150);

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
        listen("menu-open-file", () => {
          handleOpenFile();
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
          hasOpenedFile = true;
          vaultStore.openSingleFile(event.payload).then(() => {
            addToRecent(event.payload, "file");
          }).catch((e) => {
            alert(t("alert.openFileError", { error: String(e) }));
          });
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
        listen("menu-toggle-sidebar", () => {
          sidebarOpen = !sidebarOpen;
        }),
        listen<string>("menu-set-theme", (event) => {
          settingsStore.setThemeMode(event.payload as "light" | "dark" | "system");
        }),
        listen<string>("menu-set-preview-theme", (event) => {
          settingsStore.setPreviewTheme(event.payload);
        }),
        listen("menu-save", () => {
          handleSave();
        }),
        listen("menu-save-as", () => {
          handleSaveAs();
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
          // Prompt to save untitled documents that have content before closing.
          if ($vaultStore.isUntitled && $vaultStore.currentContent.trim()) {
            const shouldSave = await ask(t("dialog.saveBeforeClose"), { kind: "warning" });
            if (shouldSave) {
              await handleSaveAs();
              // If the user cancelled the save dialog, don't close.
              if ($vaultStore.isUntitled) return;
            }
          }
          await vaultStore.ensureSaved();
          vaultStore.closeVault();
        } catch (err) {
          console.error("Failed to save changes before closing:", err);
        } finally {
          getCurrentWindow().destroy();
        }
      }).then((unlisten) => unlisteners.push(unlisten));

      // Drag-and-drop file opening (Tauri 2 window-level API)
      const unlistenDragDrop = await getCurrentWindow().onDragDropEvent((event) => {
        if (event.payload.type === "drop") {
          const paths = event.payload.paths;
          if (paths && paths.length > 0) {
            vaultStore.openFiles(paths).then(() => {
              for (const p of paths) {
                addToRecent(p, "file");
              }
            }).catch((e) => {
              console.error("Failed to open dropped files:", e);
            });
          }
        }
      });
      unlisteners.push(unlistenDragDrop);

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
        alert(t("alert.openNewWindowFailed", { error: String(e) }));
      }
    } else {
      try {
        if ($vaultStore.vault && !$vaultStore.isSingleFile && (path.startsWith($vaultStore.vault.path + "/") || path.startsWith($vaultStore.vault.path + "\\"))) {
          await vaultStore.openNote(path);
        } else {
          await vaultStore.openSingleFile(path);
        }
        addToRecent(path, "file");
      } catch {
        alert(t("alert.cannotOpenFile", { path }));
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
    let previewThemeId = $settingsStore.previewTheme;
    let uiThemeId: "light" | "dark";

    if (previewThemeId === "system") {
      if (systemIsDark) {
        previewThemeId = "cobalt";
        uiThemeId = "dark";
      } else {
        previewThemeId = "default";
        uiThemeId = "light";
      }
    } else {
      const previewTheme = previewThemes.find(t => t.id === previewThemeId);
      if (!previewTheme) {
        // Saved theme was deleted or not found — fall back to a valid one.
        previewThemeId = systemIsDark ? "cobalt" : "default";
        uiThemeId = systemIsDark ? "dark" : "light";
      } else {
        uiThemeId = previewTheme.mode === "dark" ? "dark" : "light";
      }
    }

    themeManager.apply(uiThemeId, previewThemeId);

    // Keep the native menu's theme checkmark in sync with the stored setting
    // (no-op outside macOS, where the native menu is not used).
    invoke("set_theme", { theme: $settingsStore.theme }).catch(() => {});
    invoke("set_preview_theme", { theme: $settingsStore.previewTheme }).catch(() => {});
  });

  async function handleOpenVault(newWindow = false) {
    const selected = await open({
      directory: true,
      multiple: false,
      title: t("dialog.selectDirectory"),
    });
    if (selected) {
      if (newWindow) {
        try {
          await invoke("open_in_new_window", { vaultPath: selected });
        } catch (e) {
          alert(t("alert.openNewWindowFailed", { error: String(e) }));
        }
      } else {
        try {
          if ($vaultStore.vault?.path !== selected) {
            await vaultStore.openVault(selected);
          }
          await addToHistory(selected);
          recentDirs = await loadHistory();
          sidebarOpen = true;
        } catch (e) {
          alert(t("alert.openDirectoryFailed", { error: String(e) }));
        }
      }
    }
  }

  async function handleCreateVault() {
    const selected = await open({
      directory: true,
      multiple: false,
      canCreateDirectories: true,
      title: t("dialog.createOrSelectDirectory"),
    });
    if (selected) {
      try {
        if ($vaultStore.vault?.path !== selected) {
          await vaultStore.openVault(selected);
        }
        await addToHistory(selected);
        recentDirs = await loadHistory();
        sidebarOpen = true;
      } catch (e) {
        alert(t("alert.openDirectoryFailed", { error: String(e) }));
      }
    }
  }

  async function handleOpenFile() {
    const selected = await open({
      multiple: true,
      title: t("dialog.selectFiles"),
      filters: [
        {
          name: t("dialog.filterSupported"),
          extensions: [
            "md", "markdown", "mmd", "mermaid",
            "txt", "json", "log", "csv",
            "png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif", "ico",
          ],
        },
        { name: t("dialog.filterAllFiles"), extensions: ["*"] },
      ],
    });
    if (selected) {
      const paths = Array.isArray(selected) ? selected : [selected];
      await vaultStore.openFiles(paths);
      for (const p of paths) {
        await addToRecent(p, "file");
      }
    }
  }

  async function handleOpenRecent(path: string, newWindow = false) {
    if (newWindow) {
      try {
        await invoke("open_in_new_window", { vaultPath: path });
      } catch (e) {
        alert(t("alert.openNewWindowFailed", { error: String(e) }));
      }
    } else {
      try {
        if ($vaultStore.vault?.path !== path) {
          await vaultStore.openVault(path);
        }
        await addToHistory(path);
        recentDirs = await loadHistory();
        sidebarOpen = true;
      } catch (e) {
        alert(t("alert.openDirectoryFailed", { error: String(e) }));
        await removeFromHistory(path);
        recentDirs = await loadHistory();
      }
    }
  }

  function handleTriggerFind() {
    if (!$vaultStore.currentFilePath) return;
    triggerFindCount.update(n => n + 1);
  }

  function onContentChange(text: string) {
    vaultStore.updateContent($vaultStore.currentFilePath, text);
  }

  async function handleSave() {
    if ($vaultStore.isUntitled) {
      await handleSaveAs();
    } else if ($vaultStore.currentFilePath) {
      await vaultStore.saveCurrent();
    }
  }

  async function handleSaveAs() {
    const filePath = await save({
      defaultPath: $vaultStore.vault?.path ?? undefined,
      filters: [{ name: "Markdown", extensions: ["md"] }],
    });
    if (filePath) {
      await vaultStore.saveAsFile(filePath);
    }
  }
</script>

<div class="app-root">
  <Titlebar />
  <MenuBar />
  <div class="layout">
    {#if sidebarOpen}
      <Sidebar
        onOpenVault={() => handleOpenVault()}
        onCreateVault={() => handleCreateVault()}
      />
    {/if}
    <main class="main-content">
      {#if $vaultStore.currentFilePath || $vaultStore.isUntitled}
        <EditorPanel
          content={$vaultStore.currentContent}
          {onContentChange}
        />
      {:else}
        <div class="empty-state"></div>
      {/if}
    </main>
  </div>
  <StatusBar />
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
  }
</style>
