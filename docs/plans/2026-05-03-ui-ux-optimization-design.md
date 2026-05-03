# Bilberry UI/UX Optimization Design Plan

## Overview
This document outlines the UI/UX optimization strategy for the Bilberry application. The goal is to transition the current basic interface into a "Structural & Dense" professional workspace, drawing inspiration from tools like Obsidian and VS Code. The focus is on clear pane dividers, high information density, functional toolbars, and a highly structured layout.

## 1. Theme System & Typography

### Semantic Color Palette
Upgrade `app.css` to use a rich, semantic token system to create natural depth without relying entirely on harsh 1px borders.
- `--bg-primary`: Main editor background (pure white in light mode, deep gray in dark mode).
- `--bg-secondary`: Sidebars and toolbars (slightly darker/lighter tone than primary).
- `--bg-hover`: Subtle highlight for interactive elements.
- `--bg-active`: Highlight for selected files or active tabs.
- `--border-divider`: For structural borders between panes.
- `--text-normal`: Main body text.
- `--text-muted`: UI text, timestamps, secondary information.
- `--interactive-accent`: Primary brand color for active indicators (e.g., active tab underline).

### Typography Scale
Implement a dual-scale typography system:
- **UI Elements (Sidebars, Tabs, Status Bar):** Compact, dense system font size (12px–13px) to maximize screen real estate for file trees and metadata.
- **Note Content (Editor/Preview):** Comfortable reading scale (15px base, modular heading sizes, e.g., H1: 1.8em, H2: 1.5em).

### Spacing System
Enforce a strict spacing scale (4px, 8px, 12px, 16px).
- Tighten padding in sidebars and toolbars to increase information density.

## 2. UI Component Upgrades

### Professional Iconography
Replace existing emoji icons (📁, 🔍, 🔗, 🌓) with crisp, monochromatic SVG icons.
- **Action:** Integrate a lightweight SVG icon library (e.g., `lucide-svelte`) for all UI icons.

### Tab System (`Sidebar.svelte`)
Redesign sidebar tabs to mirror native IDE tabs:
- Squared edges.
- No background gaps between tabs.
- Active state indicated by a distinct background color and a primary accent bottom-border.
- Muted text color for inactive tabs.

## 3. Workspace, Editor, and Preview Optimization

### Split Pane Gutter (`EditorPanel.svelte`)
- Replace the `1px solid var(--border)` in the split view with a slightly thicker (2px-4px) subtle "gutter" background color.
- Make it visually resemble a grabbable resize handle, aligning with standard IDE mechanics.

### Markdown Preview Styling (`Preview.svelte`)
Refine the raw HTML styling to resemble a polished document:
- **Headings:** Align font-weights (e.g., 600 or 700) and adjust margin collapse.
- **Code Blocks:** Ensure `pre` and `code` tags use a distinct, slightly darker/lighter background tone with subtle rounded corners (4px-6px) and proper internal padding.
- **Blockquotes:** Stylize with a noticeable left border (accent or muted color) and italicized text.

### CodeMirror Integration
- Ensure the CodeMirror 6 editor container seamlessly blends with `--bg-primary`.
- Sync the CodeMirror cursor, selection highlight, and active-line background with the global theme tokens to remove the "boxed-in" feeling.

## 4. Interactive States & Information Density

### Hover & Focus States
- Apply a rapid, subtle background-color transition (`transition: background 0.1s ease`) to all clickable elements (sidebar items, toolbar buttons).
- Implement clean, distinct focus rings for keyboard accessibility, disabling the default browser blue outline.

### File Explorer Density (`FileExplorer.svelte`)
- Reduce row height and padding.
- Align file icons and text perfectly horizontally.
- Use visual hierarchy: Folders slightly bolder text, files slightly muted until hovered or selected.

### Status Bar (`StatusBar.svelte`)
- Reduce height to a thin, dense strip (e.g., 24px).
- Use the smallest readable font size (11px-12px).
- Anchor information (word count, mode, sync state) cleanly to the left and right edges.
