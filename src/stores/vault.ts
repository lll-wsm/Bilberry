import { writable, derived } from "svelte/store";
import { invoke } from "@tauri-apps/api/core";
import { editorStore } from "./editor";
import { getEncoding, setEncoding } from "./fileEncodings";

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
  searchResults: [],
  searchQuery: "",
  searchReady: false,
  loading: false,
};

function createVaultStore() {
  const { subscribe, set, update } = writable<VaultState>(initialState);
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let lastSavedContent = "";
  let lastSavedEncoding = "UTF-8";

  function debouncedSave(path: string | null, content: string, encoding: string) {
    if (!path) return;
    lastSavedContent = content;
    lastSavedEncoding = encoding;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      invoke("write_note", { path, content, encoding }).catch(console.error);
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
      update((s) => ({ ...s, loading: true }));
      try {
        const vault = await invoke<Vault>("open_vault", { path });
        const fileTree = await invoke<FileEntry[]>("get_file_tree", { path });
        update(() => ({
          ...initialState,
          vault,
          fileTree,
          loading: false,
        }));
        // Build search index in background
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

    async createVault(path: string) {
      update((s) => ({ ...s, loading: true }));
      try {
        const vault = await invoke<Vault>("create_vault", { path });
        update(() => ({
          ...initialState,
          vault,
          loading: false,
        }));
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
      const fileTree = await invoke<FileEntry[]>("get_file_tree", {
        path: currentPath,
      });
      update((s) => ({ ...s, fileTree, loading: false }));
    },

    async openNote(path: string) {
      // Check if already open in a tab
      let isAlreadyOpen = false;
      update((s) => {
        isAlreadyOpen = s.openTabs.some(t => t.path === path);
        return s;
      });

      if (isAlreadyOpen) {
        // Just switch to the existing tab
        this.switchTab(path);
        return;
      }

      // New file - add tab
      const savedEnc = await getEncoding(path);
      let encoding = savedEnc || "UTF-8";
      update((s) => {
        return {
          ...s,
          loading: true,
          currentFilePath: path,
          currentContent: "",
          currentEncoding: encoding,
          openTabs: [...s.openTabs, { path, content: "", encoding }],
        };
      });
      editorStore.setMode("preview");
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
      } catch (e) {
        console.error("Failed to read note:", e);
        update((s) => {
          // Remove the failed tab, revert to previous if needed
          const remaining = s.openTabs.filter(t => t.path !== path);
          if (remaining.length === 0) {
            return { ...s, loading: false, currentFilePath: null, currentContent: "", openTabs: [] };
          }
          const last = remaining[remaining.length - 1];
          return {
            ...s,
            loading: false,
            currentFilePath: last.path,
            currentContent: last.content,
            currentEncoding: last.encoding,
            openTabs: remaining,
          };
        });
        alert("读取笔记失败: " + e);
      }
    },

    switchTab(path: string) {
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
        return {
          ...s,
          currentFilePath: target.path,
          currentContent: target.content,
          currentEncoding: target.encoding,
          openTabs: updatedTabs,
        };
      });
    },

    closeTab(path: string) {
      update((s) => {
        if (path === s.currentFilePath) {
          // Save current content then close
          const savedTabs = s.openTabs.map(t =>
            t.path === s.currentFilePath
              ? { ...t, content: s.currentContent, encoding: s.currentEncoding }
              : t
          ).filter(t => t.path !== path);

          if (savedTabs.length === 0) {
            return {
              ...s,
              currentFilePath: null,
              currentContent: "",
              currentEncoding: "UTF-8",
              openTabs: [],
            };
          }

          // Switch to adjacent tab (prefer the one to the left)
          const currentIdx = s.openTabs.findIndex(t => t.path === path);
          const newIdx = Math.min(currentIdx, savedTabs.length - 1);
          const next = savedTabs[newIdx];
          return {
            ...s,
            currentFilePath: next.path,
            currentContent: next.content,
            currentEncoding: next.encoding,
            openTabs: savedTabs,
          };
        }

        // Close a non-active tab
        return {
          ...s,
          openTabs: s.openTabs.filter(t => t.path !== path),
        };
      });
    },

    handleFileRename(oldPath: string, newPath: string) {
      update((s) => {
        const updatedTabs = s.openTabs.map(t =>
          t.path === oldPath ? { ...t, path: newPath } : t
        );
        return {
          ...s,
          openTabs: updatedTabs,
          currentFilePath: s.currentFilePath === oldPath ? newPath : s.currentFilePath,
          currentContent: s.currentFilePath === oldPath ? s.currentContent : s.currentContent,
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
      if (path) {
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
      if (current?.currentFilePath && (lastSavedContent !== current.currentContent || lastSavedEncoding !== current.currentEncoding)) {
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
      if (saveTimer) clearTimeout(saveTimer);
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
;
