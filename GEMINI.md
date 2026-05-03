# Bilberry — Markdown Note Editor

Bilberry is a modern, local-first Markdown note-taking application built with **Tauri 2**, **Svelte 5**, and **Rust**. It draws inspiration from tools like Obsidian and Typora, providing a robust vault-based system for personal knowledge management.

## Project Overview

- **Frontend:** Svelte 5 + TypeScript, styled with Vanilla CSS.
- **Editor:** CodeMirror 6 with custom extensions for Markdown and Live Rendering.
- **Backend:** Tauri 2 (Rust) for file I/O, search indexing, and system integration.
- **Storage:** Local `.md` files + SQLite for metadata (planned).
- **Search:** Full-text search powered by `tantivy`.
- **Features:** Wiki-links (`[[link]]`), Backlinks, Graph View, LaTeX (KaTeX), Diagrams (Mermaid), and HTML/PDF export.

## Architecture & Data Flow

### Frontend (`src/`)
- **Layout:** Three-column layout (`Layout.svelte`):
    - **Left Sidebar:** File Explorer, Search, Graph View.
    - **Center Panel:** Editor (CodeMirror) and Preview (Marked).
    - **Right Sidebar:** Backlinks and Note Properties.
- **Stores:** Centralize all data flow and Tauri command invocations.
    - `vault.ts`: Manages the file tree, current note content, search results, and backlinks.
    - `editor.ts`: Manages editor modes (`split`, `preview`, `source`, `live`).
    - `theme.ts`: Manages light/dark mode.
    - `settings.ts`: Persisted user configuration.
- **Conventions:**
    - Use Svelte 5 runes: `$state()`, `$derived()`, `$props()`, `$effect()`.
    - Components should be modular and reside in `src/lib/`.

### Backend (`src-tauri/`)
- **`lib.rs`**: Core setup, plugin registration, and managed state (indexes).
- **`vault/`**: Handles vault scanning, file operations, and change watching.
- **`search/`**: Tantivy-based full-text search engine.
- **`backlinks/`**: Reverse-index for tracking note connections.
- **`wikilink/`**: Parser for wiki-style links and aliases.
- **`commands/`**: Domain-grouped Tauri command handlers.

### Data Flow
`UI Event` → `Svelte Store Method` → `Tauri invoke()` → `Rust Command` → `Store Update` → `UI Refresh`

## Development Guide

### Prerequisites
- Node.js & npm
- Rust & Cargo (with Tauri 2 target dependencies)

### Key Commands

| Task | Command |
| :--- | :--- |
| **Development** | `npm run tauri dev` |
| **Production Build** | `npm run tauri build` |
| **Frontend Check** | `npx svelte-check` |
| **Rust Check** | `cd src-tauri && cargo check` |
| **Rust Tests** | `cd src-tauri && cargo test` |

### Coding Standards
- **Surgical Changes:** Minimize diff size; focus on the specific task.
- **Error Handling:** Rust commands must return `Result<T, String>`. Errors are displayed on the frontend via alerts or store-level error states.
- **State Integrity:** Backend indexes (search, backlinks) are maintained in memory via `Mutex<Option<T>>` and updated incrementally where possible.
- **Typing:** Strict TypeScript on the frontend; shared types should match Rust structs (via `serde`).

## Important Files
- `CLAUDE.md`: Comprehensive guide for AI assistants.
- `tauri.conf.json`: Tauri application configuration.
- `src/stores/vault.ts`: Heart of the frontend state logic.
- `src-tauri/src/lib.rs`: Entry point for backend logic and state management.
