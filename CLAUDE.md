# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Dev Commands

```bash
# Dev (Vite dev server + Tauri window)
npm run tauri dev

# Full production build (frontend + Rust + .app/.dmg)
npm run tauri build

# Frontend-only build (Vite)
npm run build

# Rust-only check (faster than full build)
cd src-tauri && cargo check

# Run Rust tests
cd src-tauri && cargo test

# Svelte type checking + diagnostics
npx svelte-check
```

Note: `svelte-check` catches type errors but does NOT verify reactivity correctness (e.g., `$derived()` reading non-reactive variables, `$effect()` dependency tracking). Always test reactive flows manually.

## Project Architecture

**Bilberry** is a Markdown note editor: Tauri 2 desktop shell, Svelte 5 + TypeScript frontend, Rust backend.

### Frontend (src/)

**Stores** — writable Svelte stores mediate all data flow between UI and Rust:
- `vault.ts` — central store: vault info, file tree, current note content + encoding, search results. All Tauri `invoke()` calls go through store methods. Supports multi-encoding (UTF-8, GB18030, Big5, Shift_JIS, etc.) via `encoding_rs` on the Rust side.
- `editor.ts` — editor mode (`preview`/`split`/`source`/`live`). Default mode is `preview`. Opening a note auto-switches to preview mode.
- `theme.ts` — light/dark toggle, persisted via writable store
- `settings.ts` — font size/family/line-height, persisted to localStorage

**Component layout** from `Layout.svelte`:
- Toggleable left sidebar (`Sidebar.svelte`) with tabs for FileExplorer and SearchPanel (no graph tab)
- Center panel (`EditorPanel.svelte`) dispatches between Editor.svelte (CodeMirror 6) and Preview.svelte (marked + KaTeX + Mermaid) based on mode
- `StatusBar.svelte` at bottom shows word/char count, encoding selector dropdown, and mode label
- No right sidebar (BacklinksPanel removed)

**UI conventions:**
- Icons via `lucide-svelte` (import `{ IconName } from "lucide-svelte"`, use as `<IconName size={16} />`)
- CSS variables use `--bg-primary`, `--bg-secondary`, `--bg-hover`, `--text-normal`, `--text-muted`, `--border-divider`, `--interactive-accent`, `--spacing-*` naming
- No Tailwind or CSS framework — all styles are scoped `<style>` blocks

**Key patterns:**
- Props use Svelte 5 `$props()` rune
- Components use `$state()` for local state, `$derived()` for computed values
- Store values accessed with `$storeName` prefix
- Tauri invoke: `import { invoke } from "@tauri-apps/api/core"`
- Dialog API: `import { open, save } from "@tauri-apps/plugin-dialog"`

**Svelte 5 reactivity gotchas:**
- `$derived()` only tracks `$state`, `$derived`, and `$props` values. If it reads a plain `let` variable (even one set inside `$effect`), it won't re-evaluate when that variable changes. Use `$state.raw()` if you need a reactive variable that stores a complex object but replaces it atomically.
- `$effect()` tracks dependencies at runtime by reading them in the callback. If the effect returns early (e.g., `if (!view) return`), any variables after the return are NOT tracked. Always read all dependencies before any early return.
- `onMount` fires before the initial `$effect` run within the same component.
- Avoid setting `$state` inside `$effect` if that `$state` is also a dependency of the `$effect` — this creates infinite loops. Use `untrack()` to break cycles.
- `$state.raw()` is preferred over `$state()` for objects/arrays that are replaced entirely (no deep reactivity needed).

### Rust Backend (src-tauri/src/)

**lib.rs** registers modules and builds the Tauri app with all plugins and commands. Managed state uses `Mutex<Option<T>>`:
- `SearchState(Mutex<Option<SearchIndex>>)` — only managed state (backlinks removed)

**Module list:**
- `vault/` — Vault struct (create/open), file scanner (recursive .md scan), file watcher (notify crate, not wired up)
- `wikilink/` — `[[link]]` and `[[link|alias]]` regex parser, resolves targets to file paths
- `search/` — tantivy full-text search: schema (path/title/body), index all files, search with snippets
- `export/` — pulldown-cmark → complete styled HTML page
- `commands/` — three submodules: `vault_commands.rs` (open/create vault, file tree), `notes_commands.rs` (CRUD + encoding support), `knowledge_commands.rs` (search + wikilinks), all re-exported via `mod.rs`

**Key patterns for Rust commands:**
- All commands return `Result<T, String>`; errors surfaced via `alert()` on frontend
- File reading uses `encoding_rs::Encoding::for_label().decode()` for multi-encoding support
- `read_note(path, encoding?)` — reads raw bytes then decodes with specified encoding
- `write_note(path, content, encoding?)` — encodes string then writes bytes

**Key crates:** tauri 2, tantivy 0.22, pulldown-cmark 0.11, notify 7, regex, tokio, chrono, encoding_rs 0.8

### Tauri 2 Configuration

- `src-tauri/tauri.conf.json` — window size (1200x800), app identifier (`com.bilberry.desktop`), CSP (`null` = disabled), bundle settings
- `src-tauri/capabilities/default.json` — permission scopes. Custom Rust `#[tauri::command]` functions bypass the capability system; capabilities only restrict built-in plugins (`dialog`, `fs`, `shell`, `core`).
- Icons stored in `src-tauri/icons/` (32x32.png, 128x128.png, 128x128@2x.png, icon.icns, icon.ico)

### Data Flow

```
UI Event → Svelte Store method → invoke("command", args) → Rust #[tauri::command]
                                                              ↓
                                                       File I/O / Search Index
                                                              ↓
                                                    Return value → Store update → UI reactive update
```

## Current State

Remaining work items / known issues:
- `live` editor mode (CodeMirror decoration) — skeleton in place, full implementation pending
- File watcher integration for external change detection (watcher.rs exists, not wired up)
- Command palette (Cmd+P)
- Image paste/drag-drop
- Tag management system
- SQLite metadata layer (db/ module planned but not created)
- Preview scroll sync with editor
- DEBUG overlay in Preview.svelte (red debug bar showing source/html length) — remove before release
- Backlinks/Graph features were removed in a simplification pass; may be re-added later
