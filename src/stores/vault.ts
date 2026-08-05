import { writable, derived, get } from "svelte/store";
import { invoke } from "@tauri-apps/api/core";
import { editorStore, pendingNavRange } from "./editor";
import { getEncoding, setEncoding } from "./fileEncodings";
import { addToRecent } from "./vaultHistory";
import { loadSession, saveSession, type SessionData } from "./session";
import { expandToPaths } from "./expandToPaths";
import { settingsStore } from "./settings";
import { t } from "../lib/i18n/i18n.svelte";

/**
 * Normalize line endings to `\n` so that the store content always matches
 * CodeMirror's internal representation (which strips `\r`).  Without this,
 * files with CRLF (`\r\n`) endings cause the Editor's sync `$effect` to
 * see a perpetual mismatch, triggering repeated full-document replacements
 * that reset cursor position and scroll — especially noticeable on large files.
 */
function normalizeLineEndings(text: string): string {
  return text.indexOf('\r') >= 0 ? text.replace(/\r\n?/g, '\n') : text;
}

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

interface VaultState {
  vault: Vault | null;
  fileTree: FileEntry[];
  currentFilePath: string | null;
  currentContent: string;
  currentEncoding: string;
  scrollPositions: Record<string, { anchor: number; head: number }>;
  searchResults: SearchResult[];
  searchQuery: string;
  searchReady: boolean;
  loading: boolean;
  isSingleFile: boolean;
  /** True while a file read is in flight (distinct from `loading`, which is also set by tree refreshes). */
  fileLoading: boolean;
  /** True for an in-memory untitled document that has no file on disk yet. */
  isUntitled: boolean;
}

const initialState: VaultState = {
  vault: null,
  fileTree: [],
  currentFilePath: null,
  currentContent: "",
  currentEncoding: "UTF-8",
  scrollPositions: {},
  searchResults: [],
  searchQuery: "",
  searchReady: false,
  loading: false,
  isSingleFile: false,
  fileLoading: false,
  isUntitled: false,
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

  // Tracks content the app itself just wrote, so the file-watcher can
  // distinguish its own save echoes from genuine external modifications.
  const selfSaveMarker = new Map<string, { content: string; time: number }>();
  const SELF_SAVE_WINDOW_MS = 5000;

  function markSelfSave(path: string, content: string) {
    selfSaveMarker.set(path, { content, time: Date.now() });
  }

  function isSelfSave(path: string, newContent: string): boolean {
    const marker = selfSaveMarker.get(path);
    if (!marker) return false;
    if (Date.now() - marker.time > SELF_SAVE_WINDOW_MS) {
      selfSaveMarker.delete(path);
      return false;
    }
    if (marker.content === newContent) {
      selfSaveMarker.delete(path);
      return true;
    }
    return false;
  }

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

    const state = get(vaultStore);
    if (!state) return;

    if (type === "rename" && old_path) {
      vaultStore.handleFileRename(old_path, path);
    } else if (type === "remove") {
      if (state.currentFilePath === path) {
        alert(t("alert.fileDeletedExternally", { name: path.split("/").pop() ?? "" }));
        vaultStore.closeCurrentFile();
      }
    } else if (type === "modify") {
      if (state.currentFilePath !== path) return;

      try {
        const encoding = state.currentEncoding || "UTF-8";
        const newContent = normalizeLineEndings(await invoke<string>("read_note", { path, encoding }));

        if (isSelfSave(path, newContent)) {
          return;
        }

        if (state.currentContent === newContent) {
          return;
        }

        const isDirty = state.currentContent !== lastSavedContent;
        if (!isDirty) {
          update((s) => ({ ...s, currentContent: newContent }));
          lastSavedContent = newContent;
        } else {
          const confirmReload = confirm(
            t("alert.fileModifiedExternally", { name: path.split("/").pop() ?? "" })
          );
          if (confirmReload) {
            update((s) => ({ ...s, currentContent: newContent }));
            lastSavedContent = newContent;
          }
        }
      } catch (e) {
        console.error("Failed to sync file content on modify event:", e);
      }
    }
  }


  function persistSession(state: VaultState) {
    if (!state.vault || state.isSingleFile) return;
    const data: SessionData = {
      activeTab: state.currentFilePath,
      scrollPositions: state.scrollPositions,
    };
    saveSession(state.vault.path, data);
  }

  function debouncedSave(path: string | null, content: string, encoding: string) {
    if (!path) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      markSelfSave(path, content);
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
        if (s.currentFilePath && !s.loading) {
          debouncedSave(s.currentFilePath, s.currentContent, encoding);
        }
        return { ...s, currentEncoding: encoding };
      });
    },

    /** Start editing a new untitled document (in-memory, no file on disk). */
    newUntitled() {
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
      lastSavedContent = "";
      lastSavedEncoding = "UTF-8";
      editorStore.setMode("source");
      update((s) => ({
        ...s,
        isUntitled: true,
        currentFilePath: null,
        currentContent: "",
        currentEncoding: "UTF-8",
        fileLoading: false,
        loading: false,
      }));
    },

    /** Write the current content to a chosen path and switch to normal file mode. */
    async saveAsFile(path: string) {
      let content = "";
      let encoding = "UTF-8";
      let hasVault = false;
      update((s) => {
        content = s.currentContent;
        encoding = s.currentEncoding;
        hasVault = s.vault !== null;
        return s;
      });
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
      await invoke("write_note", { path, content, encoding });
      markSelfSave(path, content);
      lastSavedContent = content;
      lastSavedEncoding = encoding;
      editorStore.syncModeForFile(isPreviewableTextPath(path));
      update((s) => ({
        ...s,
        isUntitled: false,
        currentFilePath: path,
        currentContent: content,
        currentEncoding: encoding,
      }));
      if (hasVault) {
        await this.refreshFileTree();
      }
      await addToRecent(path, "file");
    },

    /** Explicit save (Cmd+S). Flushes immediately if a path exists; no-op for untitled. */
    async saveCurrent() {
      let path: string | null = null;
      let content = "";
      update((s) => {
        path = s.currentFilePath;
        content = s.currentContent;
        return s;
      });
      if (path) {
        await this.saveNote(path, content);
      }
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

        // Restore last active file
        if (session && session.activeTab) {
          await this.openNote(session.activeTab);

          const pos = session.scrollPositions[session.activeTab];
          if (pos) {
            pendingNavRange.set(pos);
          }

          // Persist the restored session state so it's not lost if the app closes
          let restoredSnapshot: VaultState | undefined;
          const restoreUnsub = subscribe((s) => { restoredSnapshot = s; });
          restoreUnsub();
          if (restoredSnapshot) persistSession(restoredSnapshot);

          // Expand file tree to reveal restored file
          expandToPaths.reveal([session.activeTab]);
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

    async openSingleFile(path: string) {
      await this.openFiles([path]);
    },

    async openFiles(paths: string[]) {
      await this.ensureSaved();

      // Single-file mode: only open the last path
      const path = paths[paths.length - 1];
      if (!path) return;

      // Skip if already the current file
      const snapshot = get(vaultStore);
      if (!snapshot) return;
      if (snapshot.currentFilePath === path) return;

      try {
        const lastSlash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
        const parentDir = lastSlash !== -1 ? path.substring(0, lastSlash) : "";

        const savedEnc = await getEncoding(path);
        const encoding = savedEnc || "UTF-8";

        if (!snapshot.vault) {
          // First file -- set up vault with parent directory
          const vault = await invoke<Vault>("open_vault", { path: parentDir });
          const showHidden = get(settingsStore).showHiddenFiles;
          const fileTree = await invoke<FileEntry[]>("get_file_tree", { path: parentDir, showHidden });
          update((s) => ({
            ...s,
            vault,
            isSingleFile: true,
            isUntitled: false,
            fileTree,
            loading: true,
            fileLoading: true,
            currentFilePath: path,
            currentEncoding: encoding,
            currentContent: "",
          }));

          if (fileWatcherUnlisten) {
            fileWatcherUnlisten();
            fileWatcherUnlisten = null;
          }
          const { listen } = await import("@tauri-apps/api/event");
          fileWatcherUnlisten = await listen<{ type: string; path: string; old_path?: string }>(
            "vault-file-changed",
            (event) => { handleFileWatcherEvent(event.payload); }
          );
        } else {
          update((s) => ({
            ...s,
            isUntitled: false,
            loading: true,
            fileLoading: true,
            currentFilePath: path,
            currentEncoding: encoding,
            currentContent: "",
          }));
        }

        lastSavedContent = "";
        lastSavedEncoding = encoding;
        // Sync the editor mode before the read so non-previewable files
        // (txt, source, etc.) immediately render in the source editor rather
        // than flashing the markdown preview (whose toolbar is hidden for them).
        editorStore.syncModeForFile(isPreviewableTextPath(path));

        const raw = isImagePath(path)
          ? ""
          : await invoke<string>("read_note", { path, encoding });
        const content = normalizeLineEndings(raw);

        update((s) => ({
          ...s,
          currentContent: content,
          loading: false,
          fileLoading: false,
        }));

        // Restore the last cursor/scroll position for this file, if any.
        let savedPos: { anchor: number; head: number } | null = null;
        const posUnsub = subscribe((s) => { savedPos = s.scrollPositions[path] ?? null; });
        posUnsub();
        if (savedPos) pendingNavRange.set(savedPos);

        lastSavedContent = content;
        lastSavedEncoding = encoding;
      } catch (e) {
        update((s) => ({ ...s, loading: false, fileLoading: false }));
        alert(t("alert.cannotOpenFile", { path }) + "\n" + e);
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

    async openNote(path: string, _focus = true) {
      // Skip if already the current file
      const snapshot = get(vaultStore);
      if (snapshot && snapshot.currentFilePath === path) return;

      await this.ensureSaved();

      const savedEnc = await getEncoding(path);
      const encoding = savedEnc || "UTF-8";

      update((s) => ({
        ...s,
        isUntitled: false,
        loading: true,
        fileLoading: true,
        currentFilePath: path,
        currentContent: "",
        currentEncoding: encoding,
      }));

      editorStore.syncModeForFile(isPreviewableTextPath(path));
      lastSavedContent = "";
      lastSavedEncoding = encoding;

      try {
        const raw = isImagePath(path)
          ? ""
          : await invoke<string>("read_note", { path, encoding });
        const content = normalizeLineEndings(raw);

        update((s) => ({
          ...s,
          currentContent: content,
          loading: false,
          fileLoading: false,
        }));

        // Restore the last cursor/scroll position for this file, if any,
        // so re-opening a file doesn't always jump back to the first line.
        let savedPos: { anchor: number; head: number } | null = null;
        const posUnsub = subscribe((s) => { savedPos = s.scrollPositions[path] ?? null; });
        posUnsub();
        if (savedPos) pendingNavRange.set(savedPos);

        editorStore.syncModeForFile(isPreviewableTextPath(path));
        lastSavedContent = content;
        lastSavedEncoding = encoding;

        update((s) => { persistSession(s); return s; });
      } catch (e) {
        console.error("Failed to read note:", e);
        update((s) => ({
          ...s,
          loading: false,
          fileLoading: false,
          currentFilePath: null,
          currentContent: "",
        }));
        alert(t("alert.readNoteFailed", { error: String(e) }));
      }
    },

    closeCurrentFile() {
      this.ensureSaved();
      editorStore.reset();
      update((s) => {
        const newState = {
          ...s,
          isUntitled: false,
          currentFilePath: null,
          currentContent: "",
          currentEncoding: "UTF-8",
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
        let newCurrentFilePath = s.currentFilePath;
        if (s.currentFilePath === oldPath) {
          newCurrentFilePath = newPath;
        } else if (s.currentFilePath?.startsWith(oldPath + "/")) {
          const relativePart = s.currentFilePath.slice(oldPath.length);
          newCurrentFilePath = newPath + relativePart;
        }

        if (newCurrentFilePath !== s.currentFilePath && newCurrentFilePath) {
          editorStore.syncModeForFile(isPreviewableTextPath(newCurrentFilePath));
        }

        return { ...s, currentFilePath: newCurrentFilePath };
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
        const content = normalizeLineEndings(await invoke<string>("read_note", { path, encoding }));
        update((s) => ({ ...s, currentContent: content, loading: false }));
        lastSavedContent = content;
        lastSavedEncoding = encoding;
        await setEncoding(path, encoding);
      } catch (e) {
        console.error("Failed to read note with encoding:", e);
        update((s) => ({ ...s, loading: false }));
        alert(t("alert.encodingReadFailed", { error: String(e) }));
      }
    },

    updateContent(path: string | null, content: string) {
      let encoding = "UTF-8";
      update((s) => {
        encoding = s.currentEncoding;
        return { ...s, currentContent: content };
      });
      if (path && !isImagePath(path)) {
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
      // Read current state synchronously
      const current = get(vaultStore);
      if (!current || current.loading || current.isUntitled || !current.currentFilePath) return;

      if (lastSavedContent !== current.currentContent || lastSavedEncoding !== current.currentEncoding) {
        markSelfSave(current.currentFilePath, current.currentContent);
        await invoke("write_note", { 
          path: current.currentFilePath, 
          content: current.currentContent, 
          encoding: current.currentEncoding 
        });
        // Only update tracking variables if we are still on the same file.
        // A file switch may have run during the await.
        let latest: VaultState | undefined;
        const unsub2 = subscribe((s) => { latest = s; });
        unsub2();
        if (latest && latest.currentFilePath === current.currentFilePath) {
          lastSavedContent = current.currentContent;
          lastSavedEncoding = current.currentEncoding;
        }
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
            snippet: t("search.fileNameMatch"),
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
      const snapshot = get(vaultStore);
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
export const currentFileIsMarkdown = derived(vaultStore, ($v) => isMarkdownPath($v.currentFilePath) || $v.isUntitled);
export const currentFileIsMermaid = derived(vaultStore, ($v) => isMermaidPath($v.currentFilePath));
export const currentFileSupportsPreview = derived(vaultStore, ($v) => isPreviewableTextPath($v.currentFilePath) || $v.isUntitled);
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
