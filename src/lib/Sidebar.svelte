<script lang="ts">
  import { vaultStore } from "../stores/vault";
  import { settingsStore } from "../stores/settings";
  import { contextMenu } from "../stores/contextMenu";
  import { fileClipboard } from "../stores/fileClipboard";
  import { fileTreePending } from "../stores/fileTreePending";
  import { get } from "svelte/store";
  import { invoke } from "@tauri-apps/api/core";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import FileExplorer from "./vault/FileExplorer.svelte";
  import SearchPanel from "./vault/SearchPanel.svelte";
  import { FolderOpen, FolderPlus, Search } from "lucide-svelte";
  import { t } from "./i18n/i18n.svelte";

  let {
    onOpenVault = () => {},
    onCreateVault = () => {},
  }: {
    onOpenVault?: () => void;
    onCreateVault?: () => void;
  } = $props();

  type Tab = "files" | "search";
  let activeTab: Tab = $state("files");

  const vaultPath = $derived($vaultStore.vault?.path ?? "");

  function revealInFinder(path: string) {
    invoke("reveal_in_finder", { path });
  }

  function copyRelativePath(path: string) {
    const vp = $vaultStore.vault?.path;
    if (!vp) return;
    const relPath = path.startsWith(vp + "/")
      ? path.slice(vp.length + 1)
      : path;
    navigator.clipboard.writeText(relPath);
  }

  function copyAbsolutePath(path: string) {
    navigator.clipboard.writeText(path);
  }

  function handleNewFile() {
    fileTreePending.start(vaultPath, "file");
  }

  function handleNewDirectory() {
    fileTreePending.start(vaultPath, "directory");
  }

  let renamingRoot = $state(false);
  let rootRenameValue = $state("");

  function startRootRename() {
    rootRenameValue = vaultPath.split("/").pop() || "";
    renamingRoot = true;
  }

  async function commitRootRename() {
    renamingRoot = false;
    const oldName = vaultPath.split("/").pop() || "";
    if (!rootRenameValue || rootRenameValue === oldName) return;
    const parent = vaultPath.slice(0, vaultPath.lastIndexOf("/"));
    const newPath = parent + "/" + rootRenameValue;
    try {
      await invoke("rename_note", { oldPath: vaultPath, newPath });
      await vaultStore.refreshFileTree();
    } catch (e) {
      alert(t("alert.renameFailed", { error: String(e) }));
    }
  }

  function focusRenameInput(node: HTMLInputElement) {
    node.focus();
    node.select();
  }

  async function handleDelete(path: string) {
    if (!confirm(t("common.confirmDelete", { name: path.split("/").pop() ?? "" }))) return;
    try {
      await invoke("delete_directory", { path });
      await vaultStore.refreshFileTree();
    } catch (e) {
      alert(t("alert.deleteFailed", { error: String(e) }));
    }
  }

  async function handlePaste(dirPath: string) {
    const entry = get(fileClipboard);
    if (!entry) return;
    const oldName = entry.path.split("/").pop() || "";
    const destPath = dirPath + "/" + oldName;
    try {
      if (entry.action === "cut") {
        await invoke("rename_note", { oldPath: entry.path, newPath: destPath });
      } else {
        await invoke("copy_file", { source: entry.path, dest: destPath });
      }
      fileClipboard.clear();
      await vaultStore.refreshFileTree();
    } catch (e) {
      alert(t("alert.pasteFailed", { error: String(e) }));
    }
  }

  function onEmptyContextMenu(e: MouseEvent) {
    if (!vaultPath) return;
    const clipEntry = get(fileClipboard);

    contextMenu.show(e, [
      { label: t("common.refresh"), action: () => vaultStore.refreshFileTree() },
      { separator: true, label: "", action: () => {} },
      { label: t("common.newFile"), action: () => handleNewFile() },
      { label: t("common.newDirectory"), action: () => handleNewDirectory() },
      { separator: true, label: "", action: () => {} },
      { label: t("common.revealInFinder"), action: () => revealInFinder(vaultPath) },
      { separator: true, label: "", action: () => {} },
      { label: t("common.cut"), action: () => fileClipboard.cut(vaultPath) },
      { label: t("common.copy"), action: () => fileClipboard.copy(vaultPath) },
      { label: t("common.paste"), disabled: !clipEntry, action: () => handlePaste(vaultPath) },
      { label: t("common.rename"), action: () => { contextMenu.hide(); startRootRename(); } },
      { label: t("common.delete"), action: () => handleDelete(vaultPath) },
      { separator: true, label: "", action: () => {} },
      { label: t("common.copyRelativePath"), action: () => copyRelativePath(vaultPath) },
      { label: t("common.copyAbsolutePath"), action: () => copyAbsolutePath(vaultPath) },
    ]);
  }

  function startResize(e: MouseEvent) {
    e.preventDefault();
    const startWidth = $settingsStore.sidebarWidth;
    const startX = e.clientX;

    function onMouseMove(moveEvent: MouseEvent) {
      const deltaX = moveEvent.clientX - startX;
      // Constraint: sidebar width between 160px and 600px
      const newWidth = Math.max(160, Math.min(600, startWidth + deltaX));
      settingsStore.updateSetting("sidebarWidth", newWidth);
    }

    function onMouseUp() {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="sidebar" style="width: {$settingsStore.sidebarWidth}px">
  {#if $vaultStore.vault}
    <div class="sidebar-header">
      <div class="tabs">
        <button
          class="tab"
          class:active={activeTab === "files"}
          onclick={() => (activeTab = "files")}
          title={t("sidebar.files")}
        ><FolderOpen size={16} /></button>
        <button
          class="tab"
          class:active={activeTab === "search"}
          onclick={() => (activeTab = "search")}
          title={t("sidebar.search")}
        ><Search size={16} /></button>
      </div>
    </div>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="sidebar-content"
      class:hidden-files={activeTab !== "files"}
      oncontextmenu={onEmptyContextMenu}
    >
      <FileExplorer
        entries={[{
          name: $vaultStore.vault.name,
          path: $vaultStore.vault.path,
          is_dir: true,
          children: $vaultStore.fileTree
        }]}
        isRoot={true}
      />
    </div>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="sidebar-content"
      class:hidden-search={activeTab !== "search"}
    >
      <SearchPanel />
    </div>
  {:else}
    <div class="sidebar-empty">
      <button class="empty-btn primary" onclick={onOpenVault}>
        <FolderOpen size={16} />
        <span>{t("sidebar.openDirectory")}</span>
      </button>
      <button class="empty-btn" onclick={onCreateVault}>
        <FolderPlus size={16} />
        <span>{t("sidebar.createDirectory")}</span>
      </button>
    </div>
  {/if}
  <div
    class="resize-handle"
    onmousedown={startResize}
  ></div>
</div>

<style>
  .sidebar {
    width: 240px;
    border-right: 1px solid var(--border-divider);
    display: flex;
    flex-direction: column;
    background: var(--bg-primary);
    position: relative;
    overflow: hidden;
  }

  .sidebar-header {
    display: flex;
    flex-direction: column;
    border-bottom: 1px solid var(--border-divider);
    height: 31px;
    box-sizing: border-box;
  }

  .vault-name {
    font-weight: 600;
    font-size: 13px;
    padding: var(--spacing-2) var(--spacing-3) var(--spacing-1);
    color: var(--text-normal);
  }

  .vault-rename-input {
    margin: var(--spacing-2) var(--spacing-3) var(--spacing-1);
    padding: 2px 6px;
    border: 1px solid var(--interactive-accent);
    border-radius: 3px;
    background: var(--bg-primary);
    color: var(--text-normal);
    font-size: 13px;
    font-weight: 600;
    font-family: inherit;
    outline: none;
  }

  .tabs {
    display: flex;
    height: 100%;
    gap: 0;
  }

  .tab {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    height: 100%;
    border: none;
    background: transparent;
    cursor: pointer;
    color: var(--text-muted);
    border-bottom: 2px solid transparent;
    transition: all 0.1s ease;
    box-sizing: border-box;
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
    overflow-x: hidden;
  }

  .sidebar-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 16px;
  }

  .empty-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    padding: 8px 12px;
    border: 1px solid var(--border-divider);
    border-radius: 6px;
    background: var(--bg-secondary);
    color: var(--text-normal);
    font-size: 13px;
    cursor: pointer;
  }

  .empty-btn:hover {
    background: var(--bg-hover);
  }

  .empty-btn.primary {
    background: var(--interactive-accent);
    color: white;
    border-color: var(--interactive-accent);
  }

  .empty-btn.primary:hover {
    opacity: 0.9;
  }

  .hidden-files,
  .hidden-search {
    display: none;
  }

  .resize-handle {
    position: absolute;
    top: 0;
    right: 0;
    width: 5px;
    height: 100%;
    cursor: col-resize;
    z-index: 10;
  }
</style>
