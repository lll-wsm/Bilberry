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
  import { FolderOpen, Search } from "lucide-svelte";

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
      alert("重命名失败: " + e);
    }
  }

  function focusRenameInput(node: HTMLInputElement) {
    node.focus();
    node.select();
  }

  async function handleDelete(path: string) {
    if (!confirm(`确定删除 "${path.split("/").pop()}" 吗？`)) return;
    try {
      await invoke("delete_directory", { path });
      await vaultStore.refreshFileTree();
    } catch (e) {
      alert("删除失败: " + e);
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
      alert("粘贴失败: " + e);
    }
  }

  function onEmptyContextMenu(e: MouseEvent) {
    if (!vaultPath) return;
    const clipEntry = get(fileClipboard);

    contextMenu.show(e, [
      { label: "刷新", action: () => vaultStore.refreshFileTree() },
      { separator: true, label: "", action: () => {} },
      { label: "新建文件", action: () => handleNewFile() },
      { label: "新建目录", action: () => handleNewDirectory() },
      { separator: true, label: "", action: () => {} },
      { label: "在访达中打开", action: () => revealInFinder(vaultPath) },
      { separator: true, label: "", action: () => {} },
      { label: "剪切", action: () => fileClipboard.cut(vaultPath) },
      { label: "复制", action: () => fileClipboard.copy(vaultPath) },
      { label: "粘贴", disabled: !clipEntry, action: () => handlePaste(vaultPath) },
      { label: "重命名", action: () => { contextMenu.hide(); startRootRename(); } },
      { label: "删除", action: () => handleDelete(vaultPath) },
      { separator: true, label: "", action: () => {} },
      { label: "复制相对路径", action: () => copyRelativePath(vaultPath) },
      { label: "复制绝对路径", action: () => copyAbsolutePath(vaultPath) },
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
  <div class="sidebar-header">
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
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="sidebar-content"
    class:hidden-files={activeTab !== "files"}
    oncontextmenu={onEmptyContextMenu}
  >
    {#if $vaultStore.vault}
      <FileExplorer
        entries={[{
          name: $vaultStore.vault.name,
          path: $vaultStore.vault.path,
          is_dir: true,
          children: $vaultStore.fileTree
        }]}
        isRoot={true}
      />
    {/if}
  </div>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="sidebar-content"
    class:hidden-search={activeTab !== "search"}
  >
    <SearchPanel />
  </div>
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
    background: var(--bg-secondary);
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
    transition: background-color 0.2s;
  }

  .resize-handle:hover,
  .resize-handle:active {
    background-color: var(--interactive-accent);
  }
</style>
