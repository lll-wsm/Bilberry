import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { json } from "@codemirror/lang-json";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
} from "@codemirror/view";
import { EditorState, type Extension } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  foldGutter,
  indentOnInput,
  bracketMatching,
  foldKeymap,
} from "@codemirror/language";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { closeBrackets, autocompletion, closeBracketsKeymap, completionKeymap } from "@codemirror/autocomplete";

/**
 * Compact formatter for line numbers on very large files.
 *
 * CodeMirror sizes the line-number gutter to fit the *widest* line number: it
 * renders a hidden spacer containing the largest number that has the same
 * digit count as the file's line count. A 150k-line novel would therefore
 * force a 6-digit gutter even though the lines visible on screen are in the
 * low thousands.
 *
 * Numbers below 100,000 are shown verbatim (5 digits max). Above that they are
 * compacted to "123k" / "1.2M" so the gutter never grows wider than ~5
 * characters no matter how many lines the file has.
 */
function formatLineNumber(n: number): string {
  if (n >= 1_000_000) {
    const millions = n / 1_000_000;
    return (millions >= 10 ? Math.floor(millions) : Math.floor(millions * 10) / 10) + "M";
  }
  if (n >= 100_000) {
    return Math.floor(n / 1000) + "k";
  }
  return String(n);
}

/**
 * Equivalent of the `codemirror` package's `basicSetup`, with one change: the
 * default `lineNumbers()` is replaced by `lineNumbers({ formatNumber })` so the
 * gutter stays narrow on files with hundreds of thousands of lines.
 *
 * This is copied instead of composing on top of `basicSetup` because
 * CodeMirror does not de-duplicate `lineNumbers()` — adding a second one would
 * render a duplicate line-number column next to the first.
 */
export function createBasicSetup(): Extension {
  return [
    lineNumbers({ formatNumber: formatLineNumber }),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    foldGutter(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    bracketMatching(),
    closeBrackets(),
    autocompletion(),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...foldKeymap,
      ...completionKeymap,
    ]),
  ];
}

/**
 * Base set of editor extensions shared by every file. Language parsing is NOT
 * included here — it is selected per file via `getLanguageExtension()` and
 * applied through a `Compartment` so that plain-text files (`.txt`, `.log`,
 * `.csv`, …) are not parsed/styled as Markdown.
 */
export function createExtensions() {
  return [
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
