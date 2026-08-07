import { StateEffect, StateField, type Extension } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";

export interface SearchMatch {
  from: number;
  to: number;
}

interface SearchState {
  matches: SearchMatch[];
  currentIndex: number;
}

/// Effect to update the search match decorations in the editor.
/// Carries all match positions and the index of the currently active match.
export const setSearchMatches = StateEffect.define<SearchState>();

const matchDecoration = Decoration.mark({ class: "cm-find-match" });
const currentMatchDecoration = Decoration.mark({ class: "cm-find-match-current" });

function buildDecorations(matches: SearchMatch[], currentIndex: number): DecorationSet {
  if (matches.length === 0) return Decoration.none;
  const decos = matches.map((m, i) =>
    (i === currentIndex ? currentMatchDecoration : matchDecoration).range(m.from, m.to),
  );
  return Decoration.set(decos, true);
}

/// StateField that holds search match decorations for the editor.
///
/// - Receives `setSearchMatches` effects from the FindWidget to update highlights.
/// - Maps decoration positions through document changes so they stay accurate
///   when the user edits the document while searching.
export const searchHighlightField: StateField<DecorationSet> = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decos, tr) {
    decos = decos.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(setSearchMatches)) {
        decos = buildDecorations(effect.value.matches, effect.value.currentIndex);
      }
    }
    return decos;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/// Combined extension to add to the editor for search highlight support.
export const searchExtension: Extension = searchHighlightField;
