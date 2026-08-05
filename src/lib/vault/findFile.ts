/**
 * Recursively search a file tree for a note matching `targetPath`.
 *
 * Matching strategy (first hit wins):
 *  1. Exact path match (with or without `.md` extension).
 *  2. Full path ending match - e.g. "folder/file" matches ".../folder/file.md".
 *  3. Filename-only match - e.g. "file" matches "any/folder/file.md".
 *
 * Shared by the editor (CodeMirror) and preview (rendered DOM) link
 * navigation / hover-preview features, so it stays framework-agnostic.
 */
export interface FileEntry {
  path: string;
  name: string;
  is_dir?: boolean;
  children?: FileEntry[];
}

export function findFile(entries: FileEntry[], targetPath: string): string | null {
  const normalizedTarget = targetPath.toLowerCase().replace(/\.md$/i, "");

  for (const entry of entries) {
    if (!entry.is_dir) {
      const entryPath = entry.path.toLowerCase();
      // Exact match check first (for absolute/resolved paths)
      if (entryPath === targetPath.toLowerCase() || entryPath === (targetPath + ".md").toLowerCase()) {
        return entry.path;
      }

      const entryNameNoExt = entry.name.toLowerCase().replace(/\.md$/i, "");

      // Match A: Full path ending match (e.g., "folder/file" matches ".../folder/file.md")
      if (entryPath.endsWith(normalizedTarget + ".md") || entryPath.endsWith(normalizedTarget)) {
        return entry.path;
      }

      // Match B: Just filename match (e.g., "file" matches "any/folder/file.md")
      if (entryNameNoExt === normalizedTarget || entryNameNoExt === normalizedTarget.split("/").pop()) {
        return entry.path;
      }
    }

    if (entry.children) {
      const found = findFile(entry.children, targetPath);
      if (found) return found;
    }
  }
  return null;
}
