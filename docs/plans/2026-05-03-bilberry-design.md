# Bilberry — Markdown Note Editor Design

## Overview

A full-featured Markdown note-taking application built with Tauri 2 + Svelte 5 + Rust, targeting personal knowledge management with Obsidian-like vault concepts and Typora-like mixed editing modes.

## Tech Stack

| Layer | Choice | Purpose |
|-------|--------|---------|
| Desktop | Tauri 2.x | Cross-platform window, system menu, file dialogs |
| Frontend | Svelte 5 + TypeScript | UI layer, editor embedding |
| Editor Core | CodeMirror 6 | Markdown editing, syntax highlighting, selection control |
| Live Rendering | CodeMirror Decoration API | Inline real-time rendering (bold, italic, headings) |
| Markdown Parse | `marked` + custom extensions | HTML preview rendering |
| Charts/Math | Mermaid + KaTeX | Inline charts and formula in preview |
| Backend | Rust | Vault engine, full-text index, file I/O, wiki link resolution |
| Full-text Search | `tantivy` | Full-text search across notes |
| Storage | Local files (`.md`) + SQLite metadata | Note persistence |

## Project Structure

```
bilberry/
├── src-tauri/          # Rust backend
│   ├── src/
│   │   ├── main.rs
│   │   ├── lib.rs
│   │   ├── vault/          # Vault engine
│   │   ├── wikilink/      # [[wiki link]] parsing
│   │   ├── backlinks/     # Backlink tracking
│   │   ├── search/        # Full-text search
│   │   ├── export/        # HTML/PDF export
│   │   ├── commands/      # Tauri Commands API
│   │   └── db/            # SQLite metadata
│   └── Cargo.toml
├── src/                 # Svelte frontend
│   ├── lib/
│   │   ├── editors/    # CodeMirror 6 wrapper
│   │   ├── preview/    # Preview renderer
│   │   ├── vault/      # Vault browser
│   │   ├── graph/      # Graph view
│   │   └── ui/         # Common UI
│   ├── stores/         # Svelte stores
│   └── App.svelte
├── package.json
├── svelte.config.js
└── tauri.conf.json
```

## Core Features

### MVP (Phase 1-2)
- Create/open/save `.md` files, file tree browsing
- CodeMirror 6 editing: syntax highlighting, line numbers
- Split-pane preview: `marked` + KaTeX + Mermaid
- Vault creation/switching, file scanning
- Dark/light theme toggle
- HTML export

### Phase 3
- Live rendering mode (CodeMirror decoration)
- [[wiki link]] parsing and navigation
- Backlinks panel
- Full-text search (tantivy)
- Image paste/drag-drop
- PDF export

### Phase 4
- Graph view
- Tag management
- Custom themes / CSS snippets
- Auto-save + file change tracking

## Editor Modes

```typescript
type EditorMode = 'split'    // editor + preview side-by-side
                | 'preview'  // pure preview
                | 'source'   // pure edit
                | 'live'     // WYSIWYG (Typora-style)
```

## Component Tree

```
App.svelte
├── CommandPalette.svelte
├── Layout.svelte
│   ├── Sidebar.svelte
│   │   ├── FileExplorer.svelte
│   │   ├── GraphView.svelte
│   │   ├── Backlinks.svelte
│   │   └── Search.svelte
│   ├── EditorPanel.svelte
│   │   ├── Editor.svelte (CodeMirror 6)
│   │   ├── Preview.svelte
│   │   └── EditorToolbar.svelte
│   └── RightSidebar.svelte
│       ├── Outline.svelte
│       └── NoteProperties.svelte
├── StatusBar.svelte
└── Modals/
    ├── NewVault.svelte
    ├── ExportModal.svelte
    └── Settings.svelte
```

## Rust Backend Architecture

```
src-tauri/src/
├── main.rs                 # Tauri entry point
├── lib.rs                  # Plugin registration, command exports
├── vault/                  # Vault engine
├── wikilink/               # Wiki link parsing
├── backlinks/              # Backlink indexing
├── search/                 # tantivy full-text search
├── export/                 # HTML/PDF export
├── commands/               # #[tauri::command] functions
└── db/                     # SQLite metadata store
```

### Key Rust Crates

```toml
tauri = { version = "2", features = ["dialog"] }
serde = { version = "1", features = ["derive"] }
tantivy = "0.22"
rusqlite = "0.31"
notify = "6"
pulldown-cmark = "0.11"
regex = "1"
tokio = { version = "1", features = ["full"] }
```

## Data Flow

```
User Action → Svelte Component → Tauri invoke() → Rust Command
                                                      ↓
                                               File System / SQLite
                                                      ↓
                                          Return → Svelte Store → UI Re-render
```

## Svelte Stores

- `notes.ts` — Current open file and edit state
- `vault.ts` — Vault info, file tree
- `editor.ts` — Editor mode and settings
- `search.ts` — Search results
- `theme.ts` — Theme settings

## Development Phases

### Phase 1 — Project Scaffold (1-2 days)
- Tauri 2 + Svelte init
- CodeMirror 6 integration
- Rust command framework (invoke communication test)
- Dark/light theme toggle

### Phase 2 — Vault Engine (2-3 days)
- Vault scanning and file tree building
- File create/open/save/rename
- File change watcher + incremental updates
- Frontend file explorer bindings

### Phase 3 — Rendering Pipeline (2-3 days)
- Split mode: marked + KaTeX + Mermaid
- Live rendering: CodeMirror decoration
- Mode switching logic
- Preview scroll sync

### Phase 4 — Knowledge Connections (3-4 days)
- [[wiki link]] parsing and navigation
- Backlinks index and panel
- tantivy full-text search
- Graph view

### Phase 5 — Output & Polish (2 days)
- HTML/PDF export
- Performance optimization
- Settings panel

## Error Handling

- Rust → Frontend: Commands return `Result<T, String>` with structured error types
- File operations: Error dialogs for external modifications, missing files
- Frontend: Store-level error field, Toast or inline error display as appropriate
