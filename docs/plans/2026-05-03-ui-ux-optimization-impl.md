# UI/UX Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the "Structural & Dense" UI/UX design, including semantic color tokens, tight typography/spacing, and professional icons.

**Architecture:** CSS variables in `app.css` will be updated first to establish the semantic color and spacing scale. Then, individual Svelte components (`Layout.svelte`, `Sidebar.svelte`, `EditorPanel.svelte`, `Preview.svelte`) will be updated to use the new tokens, improved structural layout, and `lucide-svelte` icons.

**Tech Stack:** Svelte 5, CSS, lucide-svelte

---

### Task 1: CSS Foundation Update

**Files:**
- Modify: `src/app.css`

- [ ] **Step 1: Update CSS Variables**
Replace the current `:root` and `.dark` variables with the new semantic palette and add a spacing scale.

```css
/* src/app.css */
:root {
  --bg-primary: #ffffff;
  --bg-secondary: #f3f4f6;
  --bg-hover: #e5e7eb;
  --bg-active: #d1d5db;
  --text-normal: #1f2937;
  --text-muted: #6b7280;
  --border-divider: #d1d5db;
  --interactive-accent: #2563eb;
  
  --spacing-1: 4px;
  --spacing-2: 8px;
  --spacing-3: 12px;
  --spacing-4: 16px;
}

.dark {
  --bg-primary: #1e1e1e;
  --bg-secondary: #252526;
  --bg-hover: #2d2d30;
  --bg-active: #37373d;
  --text-normal: #cccccc;
  --text-muted: #858585;
  --border-divider: #3c3c3c;
  --interactive-accent: #007acc;
}

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color: var(--text-normal);
  background-color: var(--bg-primary);
}

/* Reset default focus */
*:focus-visible {
  outline: 2px solid var(--interactive-accent);
  outline-offset: -1px;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app.css
git commit -m "style: update semantic color and spacing variables"
```

---

### Task 2: Layout Structure Update

**Files:**
- Modify: `src/lib/Layout.svelte`

- [ ] **Step 1: Update Layout CSS and apply new variables**

Update `<style>` block in `src/lib/Layout.svelte`:

```svelte
<style>
  /* ... keep welcome styles, update background ... */
  .welcome {
    /* ... */
    background: var(--bg-primary);
    color: var(--text-normal);
  }
  
  .btn {
    padding: var(--spacing-2) var(--spacing-4);
    border: 1px solid var(--border-divider);
    border-radius: 4px;
    background: var(--bg-secondary);
    color: var(--text-normal);
    transition: background 0.1s ease;
  }
  
  .btn:hover {
    background: var(--bg-hover);
  }
  
  /* ... */
  .right-sidebar {
    width: 240px; /* match left sidebar */
    border-left: 1px solid var(--border-divider);
    background: var(--bg-secondary);
    overflow-y: auto;
  }
  
  .editor-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-2) var(--spacing-4);
    border-bottom: 1px solid var(--border-divider);
    background: var(--bg-secondary);
  }
  
  .current-file {
    font-size: 13px;
    color: var(--text-muted);
  }
  
  .icon-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-muted);
    padding: var(--spacing-1);
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.1s ease, color 0.1s ease;
  }
  
  .icon-btn:hover {
    background: var(--bg-hover);
    color: var(--text-normal);
  }
</style>
```

- [ ] **Step 2: Replace Toggle Icon**

Import from lucide:
```svelte
<script lang="ts">
  import { open } from "@tauri-apps/plugin-dialog";
  import { vaultStore } from "../stores/vault";
  import Sidebar from "./Sidebar.svelte";
  import EditorPanel from "./editor/EditorPanel.svelte";
  import BacklinksPanel from "./vault/BacklinksPanel.svelte";
  import StatusBar from "./StatusBar.svelte";
  import { toggle, themeStore } from "../stores/theme";
  import { Sun, Moon } from "lucide-svelte";
  
  // ...
</script>
```

Update the button:
```svelte
<button class="icon-btn" onclick={toggle} title="Toggle Theme">
  {#if $themeStore === 'dark'}
    <Sun size={16} />
  {:else}
    <Moon size={16} />
  {/if}
</button>
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/Layout.svelte
git commit -m "style: update Layout component with new tokens and icons"
```

---

### Task 3: Sidebar Redesign

**Files:**
- Modify: `src/lib/Sidebar.svelte`

- [ ] **Step 1: Replace emojis with Lucide icons and update tabs UI**

```svelte
<script lang="ts">
  import { vaultStore } from "../stores/vault";
  import FileExplorer from "./vault/FileExplorer.svelte";
  import SearchPanel from "./vault/SearchPanel.svelte";
  import GraphView from "./vault/GraphView.svelte";
  import { FolderOpen, Search, Share2 } from "lucide-svelte";

  type Tab = "files" | "search" | "graph";
  let activeTab: Tab = $state("files");
</script>

<div class="sidebar">
  <div class="sidebar-header">
    <span class="vault-name">{$vaultStore.vault?.name ?? "No Vault"}</span>
    <div class="tabs">
      <button
        class="tab"
        class:active={activeTab === "files"}
        onclick={() => (activeTab = "files")}
        title="Files"
      ><FolderOpen size={16} /></button>
      <button
        class="tab"
        class:active={activeTab === "search"}
        onclick={() => (activeTab = "search")}
        title="Search"
      ><Search size={16} /></button>
      <button
        class="tab"
        class:active={activeTab === "graph"}
        onclick={() => (activeTab = "graph")}
        title="Graph"
      ><Share2 size={16} /></button>
    </div>
  </div>
  <!-- ... -->
</div>

<style>
  .sidebar {
    width: 240px;
    border-right: 1px solid var(--border-divider);
    display: flex;
    flex-direction: column;
    background: var(--bg-secondary);
  }
  
  .sidebar-header {
    border-bottom: 1px solid var(--border-divider);
  }
  
  .vault-name {
    font-weight: 600;
    font-size: 13px;
    padding: var(--spacing-2) var(--spacing-3) var(--spacing-1);
    color: var(--text-normal);
  }
  
  .tabs {
    display: flex;
    gap: 0;
  }
  
  .tab {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--spacing-2) 0;
    border: none;
    background: transparent;
    cursor: pointer;
    color: var(--text-muted);
    border-bottom: 2px solid transparent;
    transition: all 0.1s ease;
  }
  
  .tab:hover {
    color: var(--text-normal);
    background: var(--bg-hover);
  }
  
  .tab.active {
    color: var(--interactive-accent);
    border-bottom-color: var(--interactive-accent);
  }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/Sidebar.svelte
git commit -m "style: update Sidebar tabs with new design and icons"
```

---

### Task 4: Editor & Split Pane Update

**Files:**
- Modify: `src/lib/editor/EditorPanel.svelte`

- [ ] **Step 1: Update split pane gutter and pane colors**

```svelte
<style>
  .editor-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--bg-primary);
  }

  .workspace {
    flex: 1;
    display: flex;
    overflow: hidden;
  }

  .workspace.split {
    flex-direction: row;
    background: var(--border-divider); /* Gutter background */
    gap: 2px; /* Gutter thickness */
  }

  .pane {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--bg-primary);
  }

  .editor-pane {
    border-right: none; /* Replaced by gap */
  }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/editor/EditorPanel.svelte
git commit -m "style: implement thicker split pane gutter"
```

---

### Task 5: Markdown Preview Refinement

**Files:**
- Modify: `src/lib/preview/Preview.svelte`

- [ ] **Step 1: Update Markdown typography and styling**

```svelte
<style>
  .preview {
    flex: 1;
    overflow-y: auto;
    padding: var(--spacing-4) 32px;
    background: var(--bg-primary);
  }

  .markdown-body {
    max-width: 800px;
    margin: 0 auto;
    line-height: 1.6;
    font-size: 15px;
    color: var(--text-normal);
  }

  .markdown-body :global(h1) { font-size: 1.8em; font-weight: 700; margin: 1em 0 0.5em; border-bottom: 1px solid var(--border-divider); padding-bottom: 0.3em; }
  .markdown-body :global(h2) { font-size: 1.5em; font-weight: 600; margin: 1em 0 0.5em; border-bottom: 1px solid var(--border-divider); padding-bottom: 0.3em; }
  .markdown-body :global(h3) { font-size: 1.25em; font-weight: 600; margin: 1em 0 0.5em; }
  
  .markdown-body :global(code) { background: var(--bg-secondary); padding: 2px 4px; border-radius: 4px; font-size: 0.9em; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
  .markdown-body :global(pre) { background: var(--bg-secondary); padding: var(--spacing-4); border-radius: 6px; overflow-x: auto; border: 1px solid var(--border-divider); }
  
  .markdown-body :global(blockquote) { 
    border-left: 4px solid var(--interactive-accent); 
    padding-left: var(--spacing-4); 
    margin: 1em 0; 
    color: var(--text-muted);
    font-style: italic;
    background: var(--bg-secondary);
    padding-top: var(--spacing-2);
    padding-bottom: var(--spacing-2);
    border-radius: 0 4px 4px 0;
  }
  
  .markdown-body :global(table) { border-collapse: collapse; width: 100%; margin: 1em 0; }
  .markdown-body :global(th), .markdown-body :global(td) { border: 1px solid var(--border-divider); padding: var(--spacing-2) var(--spacing-3); }
  .markdown-body :global(th) { background: var(--bg-secondary); }
  
  .markdown-body :global(a) { color: var(--interactive-accent); text-decoration: none; }
  .markdown-body :global(a:hover) { text-decoration: underline; }
  
  .empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--text-muted);
    font-size: 14px;
  }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/preview/Preview.svelte
git commit -m "style: refine Markdown preview styling"
```

---

### Task 6: Status Bar Update

**Files:**
- Modify: `src/lib/StatusBar.svelte`

- [ ] **Step 1: Increase density**

*(Note: Assuming StatusBar currently exists but needs css updates)*

```svelte
<style>
  .status-bar {
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 var(--spacing-3);
    background: var(--interactive-accent);
    color: white;
    font-size: 12px;
    z-index: 100;
  }
  
  /* Additional updates to sub-elements to ensure they fit 24px height seamlessly */
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/StatusBar.svelte
git commit -m "style: compress status bar height"
```
