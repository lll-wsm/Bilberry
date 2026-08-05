import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { json } from "@codemirror/lang-json";
import { keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";

/**
 * Base set of editor extensions shared by every file. Language parsing is NOT
 * included here — it is selected per file via `getLanguageExtension()` and
 * applied through a `Compartment` so that plain-text files (`.txt`, `.log`,
 * `.csv`, …) are not parsed/styled as Markdown.
 */
export function createExtensions() {
  return [
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    EditorView.lineWrapping,
    EditorView.theme({
      "&": { height: "100%" },
      ".cm-scroller": { overflow: "auto" },
    }),
  ];
}

/**
 * Returns the language extension appropriate for a file path.
 *
 * - `.md` / `.markdown` → Markdown (with nested language support)
 * - `.json`             → JSON
 * - everything else     → plain text (no parser, no Markdown styling, no
 *   Markdown-only fold ranges)
 */
export function getLanguageExtension(path: string | null | undefined): Extension {
  if (!path) return [];
  const p = path.toLowerCase();
  if (p.endsWith(".md") || p.endsWith(".markdown")) {
    return markdown({ base: markdownLanguage });
  }
  if (p.endsWith(".json")) {
    return json();
  }
  return [];
}
