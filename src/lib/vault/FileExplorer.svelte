<script lang="ts">
  import { vaultStore, type FileEntry } from "../../stores/vault";
  import { contextMenu } from "../../stores/contextMenu";
  import { fileClipboard } from "../../stores/fileClipboard";
  import { fileTreePending } from "../../stores/fileTreePending";
  import { expandToPaths } from "../../stores/expandToPaths";
  import { writable, get } from "svelte/store";
  import { onMount, tick } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import FileExplorer from "./FileExplorer.svelte";
  import { ChevronRight, ChevronDown, Folder, File, FileText } from "lucide-svelte";

  const editingPath = writable<string | null>(null);

  let { entries = [], depth = 0, isRoot = false }: { entries: FileEntry[]; depth?: number; isRoot?: boolean } = $props();

  let expandedDirs = $state(new Set<string>());

  // Auto-expand the root directory
  $effect(() => {
    if (isRoot && entries.length > 0) {
      const rootPath = entries[0].path;
      if (!expandedDirs.has(rootPath)) {
        expandedDirs.add(rootPath);
        expandedDirs = new Set(expandedDirs);
      }
    }
  });

  // Expand to paths signalled from outside (e.g., session restore).
  onMount(() => {
    const unsub = expandToPaths.subscribe((req) => {
      if (req.paths.length === 0) return;
      const vaultPath = get(vaultStore).vault?.path;
      if (!vaultPath) return;
      let changed = false;
      for (const filePath of req.paths) {
        let dir = filePath.substring(0, filePath.lastIndexOf("/"));
        while (dir && dir.startsWith(vaultPath)) {
          if (!expandedDirs.has(dir)) {
            expandedDirs.add(dir);
            changed = true;
          }
          dir = dir.substring(0, dir.lastIndexOf("/"));
        }
      }
      if (changed) {
        expandedDirs = new Set(expandedDirs);
      }
    });
    return unsub;
  });

  // VS Code-style inline creation — shared state from store
  let pendingValue = $state("");
  let localPending = $state<{ parentPath: string; type: "file" | "directory" } | null>(null);
  let isCommitting = false;

  function focusInput(node: HTMLInputElement) {
    node.focus();
    const val = node.value;
    const dot = val.lastIndexOf(".");
    if (dot > 0 && !node.dataset.dir) {
      node.setSelectionRange(0, dot);
    } else {
      node.select();
    }
  }

  function focusPendingInput(node: HTMLInputElement) {
    // Tick ensures the DOM is ready if we just expanded the folder
    tick().then(() => {
      node.focus();
      node.select();
    });
  }

  function toggleDir(path: string) {
    if (expandedDirs.has(path)) {
      expandedDirs.delete(path);
    } else {
      expandedDirs.add(path);
    }
    expandedDirs = new Set(expandedDirs);
  }

  function handleClick(entry: FileEntry) {
    if (entry.is_dir) {
      toggleDir(entry.path);
    } else {
      vaultStore.openNote(entry.path);
    }
  }

  async function commitRename(path: string, newName: string) {
    const oldName = path.split("/").pop() || "";
    if (newName && newName !== oldName) {
      const parent = path.slice(0, path.lastIndexOf("/"));
      const newPath = parent + "/" + newName;
      try {
        await invoke("rename_note", { oldPath: path, newPath });
        await vaultStore.refreshFileTree();
        vaultStore.handleFileRename(path, newPath);
      } catch (e) {
        alert("重命名失败: " + e);
      }
    }
  }

  function startRename(path: string) {
    contextMenu.hide();
    editingPath.set(path);
  }

  async function handleDelete(path: string, isDir: boolean) {
    if (!confirm(`确定删除${isDir ? "目录" : "文件"} "${path.split("/").pop()}" 吗？`)) return;
    try {
      if (isDir) {
        await invoke("delete_directory", { path });
      } else {
        await invoke("delete_note", { path });
      }
      await vaultStore.refreshFileTree();
      vaultStore.closeTab(path);
    } catch (e) {
      alert("删除失败: " + e);
    }
  }

  function startNewFile(dirPath: string) {
    isCommitting = false;
    localPending = { parentPath: dirPath, type: "file" };
    pendingValue = "";
    if (!expandedDirs.has(dirPath)) {
      expandedDirs.add(dirPath);
      expandedDirs = new Set(expandedDirs);
    }
  }

  function startNewDirectory(dirPath: string) {
    isCommitting = false;
    localPending = { parentPath: dirPath, type: "directory" };
    pendingValue = "";
    if (!expandedDirs.has(dirPath)) {
      expandedDirs.add(dirPath);
      expandedDirs = new Set(expandedDirs);
    }
  }

  async function commitPending() {
    const name = pendingValue.trim();
    const pending = localPending;
    if (!name || !pending) {
      cancelPending();
      return;
    }

    isCommitting = true;
    const path = pending.parentPath + "/" + name;
    try {
      if (pending.type === "file") {
        await invoke("create_note", { path });
      } else {
        await invoke("create_directory", { path });
      }
      await vaultStore.refreshFileTree();
      if (pending.type === "file") {
        await vaultStore.openNote(path);
      }
      localPending = null;
      pendingValue = "";
    } catch (e) {
      alert(`${pending.type === "file" ? "新建文件" : "新建目录"}失败: ${e}`);
      isCommitting = false;
    }
  }

  function cancelPending() {
    if (isCommitting) return;
    // Small timeout to allow click/key events to process before removing the input
    setTimeout(() => {
      if (isCommitting) return;
      localPending = null;
      pendingValue = "";
    }, 150);
  }

  // Sync from global store (for sidebar root-level "new file/dir" triggers)
  $effect(() => {
    const pending = $fileTreePending;
    if (pending && depth === 0) {
      localPending = { parentPath: pending.parentPath, type: pending.type };
      isCommitting = false;
      pendingValue = "";
      if (!expandedDirs.has(pending.parentPath)) {
        expandedDirs.add(pending.parentPath);
        expandedDirs = new Set(expandedDirs);
      }
      fileTreePending.clear();
    }
  });

  function revealInFinder(path: string) {
    invoke("reveal_in_finder", { path });
  }

  function copyRelativePath(path: string) {
    const vaultPath = $vaultStore.vault?.path;
    if (!vaultPath) return;
    const relPath = path.startsWith(vaultPath + "/")
      ? path.slice(vaultPath.length + 1)
      : path;
    navigator.clipboard.writeText(relPath);
  }

  function copyAbsolutePath(path: string) {
    navigator.clipboard.writeText(path);
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

  function refreshFileTree() {
    vaultStore.refreshFileTree();
  }

  function onFileContextMenu(e: MouseEvent, entry: FileEntry) {
    contextMenu.show(e, [
      { label: "刷新", action: () => refreshFileTree() },
      { separator: true, label: "", action: () => {} },
      { label: "在访达中打开", action: () => revealInFinder(entry.path) },
      { separator: true, label: "", action: () => {} },
      { label: "剪切", action: () => fileClipboard.cut(entry.path) },
      { label: "复制", action: () => fileClipboard.copy(entry.path) },
      { label: "删除", action: () => handleDelete(entry.path, entry.is_dir) },
      { label: "重命名", action: () => startRename(entry.path) },
      { separator: true, label: "", action: () => {} },
      { label: "复制相对路径", action: () => copyRelativePath(entry.path) },
      { label: "复制绝对路径", action: () => copyAbsolutePath(entry.path) },
    ]);
  }

  function onDirContextMenu(e: MouseEvent, entry: FileEntry) {
    const clipEntry = get(fileClipboard);

    contextMenu.show(e, [
      { label: "刷新", action: () => refreshFileTree() },
      { separator: true, label: "", action: () => {} },
      { label: "新建文件", action: () => startNewFile(entry.path) },
      { label: "新建目录", action: () => startNewDirectory(entry.path) },
      { separator: true, label: "", action: () => {} },
      { label: "在访达中打开", action: () => revealInFinder(entry.path) },
      { separator: true, label: "", action: () => {} },
      { label: "剪切", action: () => fileClipboard.cut(entry.path) },
      { label: "复制", action: () => fileClipboard.copy(entry.path) },
      { label: "粘贴", disabled: !clipEntry, action: () => handlePaste(entry.path) },
      { label: "删除", action: () => handleDelete(entry.path, true) },
      { label: "重命名", action: () => startRename(entry.path) },
      { separator: true, label: "", action: () => {} },
      { label: "复制相对路径", action: () => copyRelativePath(entry.path) },
      { label: "复制绝对路径", action: () => copyAbsolutePath(entry.path) },
    ]);
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
      oncontextmenu={(e) => {
        if (entry.is_dir) {
          onDirContextMenu(e, entry);
        } else {
          onFileContextMenu(e, entry);
        }
      }}
      title={entry.name}
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
      {#if !entry.is_dir}
        <span class="icon">
          {#if entry.name.endsWith(".md")}
            <FileText size={14} />
          {:else}
            <File size={14} />
          {/if}
        </span>
      {/if}
      {#if $editingPath === entry.path}
        <input
          class="rename-input"
          value={entry.name}
          data-dir={entry.is_dir || undefined}
          use:focusInput
          onkeydown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              const input = e.target as HTMLInputElement;
              commitRename(entry.path, input.value);
              editingPath.set(null);
            } else if (e.key === "Escape") {
              e.preventDefault();
              editingPath.set(null);
            }
          }}
          onblur={(e) => {
            setTimeout(() => editingPath.set(null), 150);
          }}
        />
      {:else}
        <span class="name">{entry.name}</span>
      {/if}
    </button>
    {#if entry.is_dir && expandedDirs.has(entry.path)}
      <div class="children">
        {#if localPending && localPending.parentPath === entry.path}
          <div class="pending-entry">
            <span class="chevron placeholder"></span>
            <span class="icon">
              {#if localPending.type === "file"}
                <FileText size={14} />
              {:else}
                <Folder size={14} />
              {/if}
            </span>
            <input
              class="pending-input"
              bind:value={pendingValue}
              placeholder={localPending.type === "file" ? "文件名.md" : "目录名"}
              use:focusPendingInput
              onkeydown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitPending();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  cancelPending();
                }
              }}
              onblur={() => cancelPending()}
            />
          </div>
        {/if}
        {#if entry.children && entry.children.length > 0}
          <FileExplorer entries={entry.children} depth={depth + 1} />
        {/if}
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
    min-width: 0;
  }

  .rename-input {
    flex: 1;
    min-width: 0;
    margin-left: 2px;
    padding: 0 4px;
    border: 1px solid var(--interactive-accent);
    border-radius: 3px;
    background: var(--bg-primary);
    color: var(--text-normal);
    font-size: 13px;
    font-family: inherit;
    outline: none;
    height: 22px;
  }

  .pending-entry {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 2px 8px;
    padding-left: 4px;
  }

  .pending-input {
    flex: 1;
    min-width: 0;
    margin-left: 2px;
    padding: 0 4px;
    border: 1px solid var(--interactive-accent);
    border-radius: 3px;
    background: var(--bg-primary);
    color: var(--text-normal);
    font-size: 13px;
    font-family: inherit;
    outline: none;
    height: 22px;
  }

  .pending-input::placeholder {
    color: var(--text-muted);
    opacity: 0.6;
  }

  .children {
    padding-left: 16px;
  }
</style>
