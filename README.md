# Bilberry

A desktop Markdown note editor built with **Tauri 2**, **Svelte 5**, and **Rust**.

![ScreenShot](ScreenShot_2026-05-07_160351_177.png)

## Features

- **Vault-based organization** - Open/create vault directories, browse `.md` files in a file tree with drag-and-drop file opening
- **Multi-mode editor** - Preview, Source (CodeMirror 6), Split (editor + preview side-by-side), and Live modes
- **Markdown rendering** - GFM via `marked`, with KaTeX math (`$...$` / `$$...$$`), Mermaid diagrams, syntax highlighting (`highlight.js`), and YAML frontmatter properties panel
- **Full-text search** - In-memory index with snippet previews and match highlighting
- **WikiLinks** - `[[link]]` and `[[link|alias]]` syntax with Cmd/Ctrl+hover link preview
- **Find in preview** - In-page search with match navigation and case-sensitive toggle
- **Multi-encoding support** - Open and save files in UTF-8, GB18030, Big5, Shift_JIS, Windows-1252, and more
- **Export to HTML** - Single-file styled HTML export
- **Multi-theme** - Light/Dark UI themes plus multiple preview themes (dracula, nord, one-dark, etc.)
- **Bilingual UI** - Chinese and English with native menu localization
- **Native menu** - macOS-native menu bar with full keyboard shortcuts, recent files, and theme switching
- **No external dependencies** - No Node.js backend, no database server; fully self-contained

## Quick Start

### Prerequisites

**macOS:** Xcode Command Line Tools

**Debian/Ubuntu:**
```bash
sudo apt install libglib2.0-dev libgtk-3-dev \
  libjavascriptcoregtk-4.1-dev libsoup-3.0-dev libwebkit2gtk-4.1-dev
```

### Build

```bash
# Install dependencies
npm install

# Start dev server (Vite + Tauri window)
npm run tauri dev

# Production build
npm run tauri build
```

The built application will be at:
- `src-tauri/target/release/bundle/macos/Bilberry.app` (macOS app)
- `src-tauri/target/release/bundle/dmg/Bilberry_0.1.0_aarch64.dmg` (macOS installer)
- `src-tauri/target/release/bundle/deb/bilberry_0.1.0_amd64.deb` (Linux installer)

## Development

```bash
# Frontend-only dev (browser, no Tauri window)
npm run dev

# Rust type check (faster than full build)
cd src-tauri && cargo check

# Svelte type diagnostics
npx svelte-check

# Markdown rendering tests (29 tests)
node --test tests/markdown.test.mjs

# Package macOS release
scripts/package-mac.sh

# Package Debian release
scripts/package-deb.sh
```

> **Tip:** After updating app icons in `src-tauri/icons/`, run `touch src-tauri/tauri.conf.json` before `npm run tauri dev` to force the icon to be re-embedded in the binary.

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  Frontend (Svelte 5 + TypeScript)                        │
│                                                           │
│  Layout ──┬─ Sidebar ──┬─ FileExplorer                    │
│           │             └─ SearchPanel                    │
│           ├─ EditorPanel ──┬─ Editor (CodeMirror 6)       │
│           │                └─ Preview ── PreviewFind       │
│           ├─ Titlebar / MenuBar / StatusBar               │
│           └─ SettingsModal / ExportModal                  │
│                                                           │
│  Shared logic:                                            │
│    vault/findFile.ts        recursive file lookup         │
│    ui/useLinkPreview.ts     hover-preview hook (runes)    │
│    ui/LinkPreview.svelte    preview popover               │
│    preview/markdown.ts      markdown render + frontmatter │
│                                                           │
│  Stores: vault / editor / theme / settings / session      │
│  i18n:   en.ts / zh.ts                                    │
│  └── invoke() ──────────> Tauri IPC bridge ───────────┐   │
├──────────────────────────────────────────────────────────┤
│  Backend (Rust)                                           │
│                                                           │
│  lib.rs        app entry, window spawn, menu event router │
│  menu.rs       native menu build + i18n labels (~60 pairs)│
│  commands/     vault / notes / data / knowledge / recent  │
│  vault/        scanner / watcher / vault ops              │
│  search/       in-memory full-text index                  │
│  wikilink/     [[link]] parser                            │
│  export/       pulldown-cmark HTML generation             │
│  recent.rs     recent files persistence                   │
└──────────────────────────────────────────────────────────┘
```

**Key technology choices:**

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Shell | Tauri 2 | Desktop shell, IPC, native menu, file system access |
| UI | Svelte 5 | Component framework with runes (`$state`, `$derived`, `$effect`) |
| Editor | CodeMirror 6 | Source-mode editing with syntax highlighting |
| Markdown | `marked` + `highlight.js` | GFM rendering with code highlighting |
| Math | KaTeX | LaTeX math typesetting |
| Diagrams | Mermaid | Flowcharts, sequence diagrams, etc. |
| Frontmatter | `js-yaml` | YAML parsing for properties panel |
| Search | Custom in-memory index | Full-text search with snippets |
| Export | `pulldown-cmark` | Markdown → standalone HTML |
| Encoding | `encoding_rs` | Multi-encoding file read/write |
| File watching | `notify` | Vault filesystem watcher |
| Icons | `lucide-svelte` | UI icon set |

## Usage

1. Launch Bilberry
2. Create or open a **Vault** (a directory containing `.md` files)
3. Click a file in the sidebar to open it, or drag-and-drop a file onto the window
4. Use the toolbar to switch between **Preview**, **Source**, **Split**, or **Live** modes
5. **Cmd/Ctrl+hover** a wiki-link or markdown link to preview the target note
6. **Cmd/Ctrl+click** a link to navigate to the target note
7. **Cmd+F** to find within the preview

## License

MIT
