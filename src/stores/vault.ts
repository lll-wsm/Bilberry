import { writable, derived, get } from "svelte/store";
import { invoke } from "@tauri-apps/api/core";
import { editorStore, pendingNavRange } from "./editor";
import { getEncoding, setEncoding } from "./fileEncodings";
import { addToRecent } from "./vaultHistory";
import { loadSession, saveSession, type SessionData } from "./session";
import { expandToPaths } from "./expandToPaths";
import { settingsStore } from "./settings";

export interface FileEntry {
  path: string;
  name: string;
  is_dir: boolean;
  children?: FileEntry[];
}

export interface Vault {
  path: string;
  name: string;
}

export interface WikiLink {
  target: string;
  alias: string | null;
  raw: string;
}

export interface SearchResult {
  path: string;
  title: string;
  snippet: string;
  score: number;
  match_start: number;
  match_end: number;
}

export interface OpenTab {
  path: string;
  content: string;
  encoding: string;
}

interface VaultState {
  vault: Vault | null;
  fileTree: FileEntry[];
  currentFilePath: string | null;
  currentContent: string;
  currentEncoding: string;
  openTabs: OpenTab[];
  scrollPositions: Record<string, { anchor: number; head: number }>;
  searchResults: SearchResult[];
  searchQuery: string;
  searchReady: boolean;
  loading: boolean;
}

const initialState: VaultState = {
  vault: null,
  fileTree: [],
  currentFilePath: null,
  currentContent: "",
  currentEncoding: "UTF-8",
  openTabs: [],
  scrollPositions: {},
  searchResults: [],
  searchQuery: "",
  searchReady: false,
  loading: false,
};

export function isMarkdownPath(path: string | null | undefined): boolean {
  return !!path && path.toLowerCase().endsWith(".md");
}

export function isMermaidPath(path: string | null | undefined): boolean {
  return !!path && /\.(mmd|mermaid)$/i.test(path);
}

export function isPreviewableTextPath(path: string | null | undefined): boolean {
  return isMarkdownPath(path) || isMermaidPath(path);
}

export function isImagePath(path: string | null | undefined): boolean {
  return !!path && /\.(png|jpe?g|gif|webp|bmp|svg|avif|ico)$/i.test(path);
}

function createVaultStore() {
  const { subscribe, set, update } = writable<VaultState>(initialState);
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let lastSavedContent = "";
  let lastSavedEncoding = "UTF-8";
  let fileWatcherUnlisten: (() => void) | null = null;
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;

  function debouncedRefreshTree() {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      vaultStore.refreshFileTree();
    }, 200);
  }

  async function handleFileWatcherEvent(payload: { type: string; path: string; old_path?: string }) {
    const { type, path, old_path } = payload;

    if (type === "create" || type === "remove" || type === "rename") {
      debouncedRefreshTree();
    }

    let state: VaultState | undefined;
    const unsub = subscribe((s) => { state = s; });
    unsub();
    if (!state) return;

    if (type === "rename" && old_path) {
      vaultStore.handleFileRename(old_path, path);
    } else if (type === "remove") {
      if (state.currentFilePath === path) {
        alert(`当前编辑的文件已被外部删除: ${path.split("/").pop()}`);
        vaultStore.closeTab(path);
      } else if (state.openTabs.some(t => t.path === path)) {
        vaultStore.closeTab(path);
      }
    } else if (type === "modify") {
      const tab = state.openTabs.find(t => t.path === path);
      if (!tab) return;

      try {
        const encoding = tab.encoding || "UTF-8";
        const newContent = await invoke<string>("read_note", { path, encoding });

        if (state.currentFilePath === path) {
          if (state.currentContent === newContent) {
            return;
          }

          const isDirty = state.currentContent !== lastSavedContent;
          if (!isDirty) {
            update((s) => ({
              ...s,
              currentContent: newContent,
              openTabs: s.openTabs.map(t => t.path === path ? { ...t, content: newContent } : t)
            }));
            lastSavedContent = newContent;
          } else {
            const confirmReload = confirm(
              `文件 "${path.split("/").pop()}" 已在外部被修改。\n\n是否重新加载外部版本？这会覆盖您的本地未保存修改。`
            );
            if (confirmReload) {
              update((s) => ({
                ...s,
                currentContent: newContent,
                openTabs: s.openTabs.map(t => t.path === path ? { ...t, content: newContent } : t)
              }));
              lastSavedContent = newContent;
            }
          }
        } else {
          if (tab.content === newContent) return;
          update((s) => ({
            ...s,
            openTabs: s.openTabs.map(t => t.path === path ? { ...t, content: newContent } : t)
          }));
        }
      } catch (e) {
        console.error("Failed to sync file content on modify event:", e);
      }
    }
  }


  function persistSession(state: VaultState) {
    if (!state.vault) return;
    const data: SessionData = {
      openTabs: state.openTabs.map(t => t.path),
      activeTab: state.currentFilePath,
      scrollPositions: state.scrollPositions,
    };
    saveSession(state.vault.path, data);
  }

  function debouncedSave(path: string | null, content: string, encoding: string) {
    if (!path) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      invoke("write_note", { path, content, encoding })
        .then(() => {
          lastSavedContent = content;
          lastSavedEncoding = encoding;
        })
        .catch(console.error);
    }, 1000);
  }

  return {
    subscribe,

    setEncoding(encoding: string) {
      update((s) => {
        if (s.currentFilePath) {
          debouncedSave(s.currentFilePath, s.currentContent, encoding);
        }
        return {
          ...s,
          currentEncoding: encoding,
          openTabs: s.openTabs.map(t =>
            t.path === s.currentFilePath ? { ...t, encoding } : t
          ),
        };
      });
    },
    async openVault(path: string) {
      await this.ensureSaved();
      update((s) => ({ ...s, loading: true }));
      try {
        const vault = await invoke<Vault>("open_vault", { path });
        const showHidden = get(settingsStore).showHiddenFiles;
        const fileTree = await invoke<FileEntry[]>("get_file_tree", { path, showHidden });
        const session = await loadSession(path);

        update(() => ({
          ...initialState,
          vault,
          fileTree,
          loading: false,
          scrollPositions: session?.scrollPositions || {},
        }));

        lastSavedContent = "";
        lastSavedEncoding = "UTF-8";

        // Restore tabs
        if (session && session.openTabs.length > 0) {
          for (const tabPath of session.openTabs) {
            await this.openNote(tabPath, false);
          }
          
          let activeTabRestored = false;
          if (session.activeTab) {
            this.switchTab(session.activeTab);
            let currentState: VaultState | undefined;
            const unsub = subscribe((s) => { currentState = s; });
            unsub();
            if (currentState && currentState.currentFilePath === session.activeTab) {
              activeTabRestored = true;
              const pos = session.scrollPositions[session.activeTab];
              if (pos) {
                pendingNavRange.set(pos);
              }
            }
          }

          // Fallback if the active tab was deleted or not restored
          if (!activeTabRestored) {
            let currentState: VaultState | undefined;
            const unsub = subscribe((s) => { currentState = s; });
            unsub();
            if (currentState && currentState.openTabs.length > 0) {
              const fallbackTab = currentState.openTabs[currentState.openTabs.length - 1].path;
              this.switchTab(fallbackTab);
            }
          }

          // Persist the restored session state so it's not lost if the app closes
          let restoredSnapshot: VaultState | undefined;
          const restoreUnsub = subscribe((s) => { restoredSnapshot = s; });
          restoreUnsub();
          if (restoredSnapshot) persistSession(restoredSnapshot);
        }

        // Expand file tree to reveal restored files
        if (session && session.openTabs.length > 0) {
          expandToPaths.reveal(session.openTabs);
        }

        addToRecent(path, "vault");
        // Build search index in background
        try {
          await invoke("build_search_index", { vaultPath: path });
          update((s) => ({ ...s, searchReady: true }));
        } catch (e) {
          console.error("Search index build failed:", e);
        }

        // Register file watcher
        if (fileWatcherUnlisten) {
          fileWatcherUnlisten();
          fileWatcherUnlisten = null;
        }
        const { listen } = await import("@tauri-apps/api/event");
        fileWatcherUnlisten = await listen<{ type: string; path: string; old_path?: string }>(
          "vault-file-changed",
          (event) => {
            handleFileWatcherEvent(event.payload);
          }
        );
      } catch (e) {
        update((s) => ({ ...s, loading: false }));
        throw e;
      }
    },

    async createVault(path: string) {
      update((s) => ({ ...s, loading: true }));
      try {
        const vault = await invoke<Vault>("create_vault", { path });
        const showHidden = get(settingsStore).showHiddenFiles;
        const fileTree = await invoke<FileEntry[]>("get_file_tree", { path, showHidden });
        const newState: VaultState = {
          ...initialState,
          vault,
          fileTree,
          loading: false,
        };
        update(() => newState);
        persistSession(newState);
        try {
          await invoke("build_search_index", { vaultPath: path });
          update((s) => ({ ...s, searchReady: true }));
        } catch (e) {
          console.error("Search index build failed:", e);
        }
      } catch (e) {
        update((s) => ({ ...s, loading: false }));
        throw e;
      }
    },

    async refreshFileTree() {
      let currentPath = "";
      update((s) => {
        currentPath = s.vault?.path ?? "";
        return { ...s, loading: true };
      });
      if (!currentPath) return;
      const showHidden = get(settingsStore).showHiddenFiles;
      const fileTree = await invoke<FileEntry[]>("get_file_tree", {
        path: currentPath,
        showHidden,
      });
      update((s) => ({ ...s, fileTree, loading: false }));
    },

    async openNote(path: string, focus = true) {
      // Check if already open in a tab
      let isAlreadyOpen = false;
      update((s) => {
        isAlreadyOpen = s.openTabs.some(t => t.path === path);
        return s;
      });

      if (isAlreadyOpen) {
        if (focus) {
          this.switchTab(path);
        }
        return;
      }

      // New file — add tab
      const savedEnc = await getEncoding(path);
      let encoding = savedEnc || "UTF-8";
      update((s) => {
        // Only set currentFilePath when focusing (restore skips this)
        const updateFields: Partial<VaultState> = {
          loading: true,
          currentContent: "",
          currentEncoding: encoding,
          openTabs: [...s.openTabs, { path, content: "", encoding }],
        };
        if (focus) {
          updateFields.currentFilePath = path;
        }
        return { ...s, ...updateFields };
      });
      if (focus) {
        editorStore.syncModeForFile(isPreviewableTextPath(path));
        lastSavedContent = "";
        lastSavedEncoding = encoding;
      }
      try {
        const content = isImagePath(path)
          ? ""
          : await invoke<string>("read_note", { path, encoding });
        update((s) => ({
          ...s,
          currentContent: focus ? content : s.currentContent,
          loading: false,
          openTabs: s.openTabs.map(t =>
            t.path === path ? { ...t, content, encoding } : t
          ),
        }));
        if (focus) {
          editorStore.syncModeForFile(isPreviewableTextPath(path));
          lastSavedContent = content;
          lastSavedEncoding = encoding;
        }

        // Persist session after opening a new tab
        if (focus) {
          update((s) => {
            persistSession(s);
            return s;
          });
        }
      } catch (e) {
        console.error("Failed to read note:", e);
        update((s) => {
          const remaining = s.openTabs.filter(t => t.path !== path);
          if (remaining.length === 0) {
            return { ...s, loading: false, currentFilePath: null, currentContent: "", openTabs: [] };
          }
          if (focus) {
            const last = remaining[remaining.length - 1];
            return {
              ...s,
              loading: false,
              currentFilePath: last.path,
              currentContent: last.content,
              currentEncoding: last.encoding,
              openTabs: remaining,
            };
          }
          return { ...s, loading: false, openTabs: remaining };
        });
        if (focus) {
          alert("读取笔记失败: " + e);
        }
      }
    },

    switchTab(path: string) {
      this.ensureSaved();
      editorStore.syncModeForFile(isPreviewableTextPath(path));
      update((s) => {
        if (path === s.currentFilePath) return s;
        // Save content from current tab
        const updatedTabs = s.openTabs.map(t =>
          t.path === s.currentFilePath
            ? { ...t, content: s.currentContent, encoding: s.currentEncoding }
            : t
        );
        // Find target tab
        const target = updatedTabs.find(t => t.path === path);
        if (!target) return s;

        lastSavedContent = target.content;
        lastSavedEncoding = target.encoding;

        const newState = {
          ...s,
          currentFilePath: target.path,
          currentContent: target.content,
          currentEncoding: target.encoding,
          openTabs: updatedTabs,
        };

        // Restore scroll position
        const pos = s.scrollPositions[path];
        if (pos) {
          pendingNavRange.set(pos);
        }

        persistSession(newState);
        return newState;
      });
    },
    closeTab(path: string) {
      this.ensureSaved();
      update((s) => {
        // If path is a directory (doesn't end with a known extension, or we can check via tree)
        // For simplicity and safety, we close any tab that starts with this path (for directories)
        // OR matches the path exactly (for files).
        const filteredTabs = s.openTabs.filter(t => 
          t.path !== path && !t.path.startsWith(path + "/")
        );
        
        // If current file was in the deleted/closed set, move focus
        const isCurrentClosed = s.currentFilePath === path || (s.currentFilePath?.startsWith(path + "/"));

        if (isCurrentClosed) {
          if (filteredTabs.length === 0) {
            editorStore.reset();
            const newState = {
              ...s,
              currentFilePath: null,
              currentContent: "",
              currentEncoding: "UTF-8",
              openTabs: [],
            };
            persistSession(newState);
            return newState;
          } else {
            const currentIdx = s.openTabs.findIndex(t => t.path === s.currentFilePath);
            const newIdx = Math.min(currentIdx, filteredTabs.length - 1);
            const next = filteredTabs[newIdx >= 0 ? newIdx : 0];
            editorStore.syncModeForFile(isPreviewableTextPath(next.path));
            
            lastSavedContent = next.content;
            lastSavedEncoding = next.encoding;

            const newState = {
              ...s,
              currentFilePath: next.path,
              currentContent: next.content,
              currentEncoding: next.encoding,
              openTabs: filteredTabs,
            };
            persistSession(newState);
            return newState;
          }
        }

        const newState = {
          ...s,
          openTabs: filteredTabs,
        };
        persistSession(newState);
        return newState;
      });
    },

    updateScrollPosition(path: string, pos: { anchor: number; head: number }) {
      update((s) => {
        const newState = {
          ...s,
          scrollPositions: {
            ...s.scrollPositions,
            [path]: pos
          }
        };
        persistSession(newState);
        return newState;
      });
    },

    handleFileRename(oldPath: string, newPath: string) {
      update((s) => {
        const isCurrentDirMatch = s.currentFilePath === oldPath || s.currentFilePath?.startsWith(oldPath + "/");
        
        const updatedTabs = s.openTabs.map(t => {
          if (t.path === oldPath) {
            return { ...t, path: newPath };
          } else if (t.path.startsWith(oldPath + "/")) {
            const relativePart = t.path.slice(oldPath.length);
            return { ...t, path: newPath + relativePart };
          }
          return t;
        });

        let newCurrentFilePath = s.currentFilePath;
        if (s.currentFilePath === oldPath) {
          newCurrentFilePath = newPath;
        } else if (s.currentFilePath?.startsWith(oldPath + "/")) {
          const relativePart = s.currentFilePath.slice(oldPath.length);
          newCurrentFilePath = newPath + relativePart;
        }

        if (isCurrentDirMatch && newCurrentFilePath) {
          editorStore.syncModeForFile(isPreviewableTextPath(newCurrentFilePath));
        }

        return {
          ...s,
          openTabs: updatedTabs,
          currentFilePath: newCurrentFilePath,
        };
      });
    },

    async reloadNoteWithEncoding(encoding: string) {
      let path = "";
      update((s) => {
        path = s.currentFilePath || "";
        return { ...s, loading: true, currentEncoding: encoding };
      });
      if (!path) return;
      try {
        const content = await invoke<string>("read_note", { path, encoding });
        update((s) => ({
          ...s,
          currentContent: content,
          loading: false,
          openTabs: s.openTabs.map(t =>
            t.path === path ? { ...t, content, encoding } : t
          ),
        }));
        lastSavedContent = content;
        lastSavedEncoding = encoding;
        await setEncoding(path, encoding);
      } catch (e) {
        console.error("Failed to read note with encoding:", e);
        update((s) => ({ ...s, loading: false }));
        alert("使用指定编码读取失败: " + e);
      }
    },

    updateContent(path: string | null, content: string) {
      if (path && !isImagePath(path)) {
        let encoding = "UTF-8";
        update((s) => {
          encoding = s.currentEncoding;
          return {
            ...s,
            currentContent: content,
            openTabs: s.openTabs.map(t =>
              t.path === path ? { ...t, content, encoding: s.currentEncoding } : t
            ),
          };
        });
        debouncedSave(path, content, encoding);
      }
    },

    async saveNote(path: string, content: string) {
      if (saveTimer) clearTimeout(saveTimer);
      let encoding = "UTF-8";
      update((s) => {
        encoding = s.currentEncoding;
        return { ...s, currentContent: content };
      });
      await invoke("write_note", { path, content, encoding });
      lastSavedContent = content;
      lastSavedEncoding = encoding;
    },

    async ensureSaved() {
      if (saveTimer) clearTimeout(saveTimer);
      // Read current state via a one-shot subscription
      let current: VaultState | undefined;
      const unsub = subscribe((s) => { current = s; });
      unsub();

      if (!current || current.loading || !current.currentFilePath) return;

      if (lastSavedContent !== current.currentContent || lastSavedEncoding !== current.currentEncoding) {
        await invoke("write_note", { 
          path: current.currentFilePath, 
          content: current.currentContent, 
          encoding: current.currentEncoding 
        });
        lastSavedContent = current.currentContent;
        lastSavedEncoding = current.currentEncoding;
      }
    },

    async createNote(path: string) {
      await invoke("create_note", { path });
      await this.refreshFileTree();
    },

    async deleteNote(path: string) {
      await invoke("delete_note", { path });
      await this.refreshFileTree();
    },

    async search(query: string) {
      update((s) => ({ ...s, searchQuery: query }));
      if (!query.trim()) {
        update((s) => ({ ...s, searchResults: [] }));
        return;
      }

      // 1. File name search (instant, JavaScript side)
      let fileNameResults: SearchResult[] = [];
      let fileTree: FileEntry[] = [];
      let vaultPath = "";
      let searchReady = false;
      update((s) => {
        fileTree = s.fileTree;
        vaultPath = s.vault?.path ?? "";
        searchReady = s.searchReady;
        return s;
      });

      const qLower = query.toLowerCase();
      const matchedPaths = new Set<string>();
      const flatFiles = flattenFileTree(fileTree);

      for (const file of flatFiles) {
        if (file.name.toLowerCase().includes(qLower)) {
          matchedPaths.add(file.path);
          const title = file.name.replace(/\.md$/i, "");
          fileNameResults.push({
            path: file.path,
            title,
            snippet: "文件名匹配",
            score: 100,
            match_start: 0,
            match_end: 0,
          });
        }
      }

      // 2. Tantivy content search
      let contentResults: SearchResult[] = [];
      if (searchReady) {
        try {
          contentResults = await invoke<SearchResult[]>("search_notes", {
            query,
            limit: 50,
          });
        } catch (e) {
          console.error("Search failed:", e);
        }
      }

      // 3. Merge: deduplicate by path, filename results take priority
      const seen = new Set(matchedPaths);
      const merged = [...fileNameResults];
      for (const r of contentResults) {
        if (!seen.has(r.path)) {
          seen.add(r.path);
          merged.push(r);
        }
      }

      update((s) => ({ ...s, searchResults: merged }));
    },

    closeVault() {
      if (fileWatcherUnlisten) {
        fileWatcherUnlisten();
        fileWatcherUnlisten = null;
      }
      this.ensureSaved();
      // Persist session before clearing
      let snapshot: VaultState | undefined;
      const unsub = subscribe((s) => { snapshot = s; });
      unsub();
      if (snapshot?.vault) {
        persistSession(snapshot);
      }
      set(initialState);
    },
  };
}

export const vaultStore = createVaultStore();

function flattenFileTree(entries: FileEntry[]): { path: string; name: string }[] {
  const result: { path: string; name: string }[] = [];
  for (const entry of entries) {
    if (!entry.is_dir) {
      result.push({ path: entry.path, name: entry.name });
    }
    if (entry.children) {
      result.push(...flattenFileTree(entry.children));
    }
  }
  return result;
}

export const currentFile = derived(vaultStore, ($v) => $v.currentFilePath);
export const isVaultOpen = derived(vaultStore, ($v) => $v.vault !== null);
export const currentFileIsMarkdown = derived(vaultStore, ($v) => isMarkdownPath($v.currentFilePath));
export const currentFileIsMermaid = derived(vaultStore, ($v) => isMermaidPath($v.currentFilePath));
export const currentFileSupportsPreview = derived(vaultStore, ($v) => isPreviewableTextPath($v.currentFilePath));
export const currentFileIsImage = derived(vaultStore, ($v) => isImagePath($v.currentFilePath));

// Subscribe to settings changes to refresh file tree when showHiddenFiles changes
let lastShowHidden: boolean | undefined;
settingsStore.subscribe(($settings) => {
  if ($settings) {
    const showHidden = $settings.showHiddenFiles;
    if (lastShowHidden !== undefined && lastShowHidden !== showHidden) {
      const state = get(vaultStore);
      if (state.vault) {
        vaultStore.refreshFileTree();
      }
    }
    lastShowHidden = showHidden;
  }
});
