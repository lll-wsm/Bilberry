import { writable, derived } from "svelte/store";
import { invoke } from "@tauri-apps/api/core";
import { editorStore } from "./editor";

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
}

interface VaultState {
  vault: Vault | null;
  fileTree: FileEntry[];
  currentFilePath: string | null;
  currentContent: string;
  currentEncoding: string;
  searchResults: SearchResult[];
  searchQuery: string;
  loading: boolean;
}

const initialState: VaultState = {
  vault: null,
  fileTree: [],
  currentFilePath: null,
  currentContent: "",
  currentEncoding: "UTF-8",
  searchResults: [],
  searchQuery: "",
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
        return { ...s, currentEncoding: encoding };
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
        // Build search index
        invoke("build_search_index", { vaultPath: path });
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
      // Keep existing encoding if we just switch file, or default to UTF-8
      let encoding = "UTF-8";
      update((s) => {
        encoding = s.currentEncoding || "UTF-8";
        return { ...s, loading: true, currentFilePath: path, currentContent: "" };
      });
      editorStore.setMode("preview");
      try {
        const content = await invoke<string>("read_note", { path, encoding });
        update((s) => ({ ...s, currentContent: content, loading: false }));
      } catch (e) {
        console.error("Failed to read note:", e);
        update((s) => ({ ...s, loading: false }));
        alert("读取笔记失败: " + e);
      }
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
        update((s) => ({ ...s, currentContent: content, loading: false }));
        lastSavedContent = content;
        lastSavedEncoding = encoding;
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
          return { ...s, currentContent: content };
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
      const results = await invoke<SearchResult[]>("search_notes", {
        query,
        limit: 20,
      });
      update((s) => ({ ...s, searchResults: results }));
    },

    closeVault() {
      set(initialState);
    },
  };
}

export const vaultStore = createVaultStore();

export const currentFile = derived(vaultStore, ($v) => $v.currentFilePath);
export const isVaultOpen = derived(vaultStore, ($v) => $v.vault !== null);
;
