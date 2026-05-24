use std::path::Path;
use serde::Serialize;
use encoding_rs::Encoding;

#[derive(Debug, Clone, Serialize)]
pub struct SearchResult {
    pub path: String,
    pub title: String,
    pub snippet: String,
    pub score: f32,
    pub match_start: usize,
    pub match_end: usize,
}

pub struct SearchIndex {
    entries: Vec<SearchEntry>,
}

struct SearchEntry {
    path: String,
    title: String,
    content: String,
}

impl SearchIndex {
    pub fn new(vault_path: &str) -> Result<Self, String> {
        let files = collect_md_files(vault_path);
        let mut entries = Vec::with_capacity(files.len());

        for file_path in &files {
            let content = read_file_safe(file_path);
            let title = Path::new(file_path)
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default();

            let display_title = content
                .lines()
                .find(|l| l.starts_with("# "))
                .map(|l| l.trim_start_matches("# ").to_string())
                .unwrap_or(title);

            entries.push(SearchEntry {
                path: file_path.clone(),
                title: display_title,
                content,
            });
        }

        Ok(SearchIndex { entries })
    }

    /// Re-index all files (rebuild from scratch)
    pub fn index_all(&self) -> Result<(), String> {
        // Entries are already populated in new(), nothing to do
        Ok(())
    }

    /// Update index for a single file (called on create/modify)
    pub fn update_file(&mut self, path: &str) -> Result<(), String> {
        let content = read_file_safe(path);
        let filename_title = Path::new(path)
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default();

        let display_title = content
            .lines()
            .find(|l| l.starts_with("# "))
            .map(|l| l.trim_start_matches("# ").to_string())
            .unwrap_or(filename_title);

        if let Some(entry) = self.entries.iter_mut().find(|e| e.path == path) {
            entry.title = display_title;
            entry.content = content;
        } else {
            self.entries.push(SearchEntry {
                path: path.to_string(),
                title: display_title,
                content,
            });
        }
        Ok(())
    }

    /// Remove a file from the index (called on delete)
    pub fn remove_file(&mut self, path: &str) {
        self.entries.retain(|e| e.path != path);
    }

    /// Search for query string across all indexed content
    pub fn search(&self, query_str: &str, limit: usize) -> Result<Vec<SearchResult>, String> {
        let query_lower = query_str.to_lowercase();
        let mut results: Vec<SearchResult> = Vec::new();

        for entry in &self.entries {
            let content_lower = entry.content.to_lowercase();
            let title_lower = entry.title.to_lowercase();

            if !content_lower.contains(&query_lower) && !title_lower.contains(&query_lower) {
                continue;
            }

            let snippet = generate_snippet(&entry.content, query_str, 120);

            // Calculate character offset of the first match for cursor navigation
            let match_start = content_lower.find(&query_lower)
                .map(|pos| content_lower[..pos].chars().count())
                .unwrap_or(0);
            let query_chars = query_str.chars().count();
            let match_end = match_start + query_chars;

            results.push(SearchResult {
                path: entry.path.clone(),
                title: entry.title.clone(),
                snippet,
                score: 0.0,
                match_start,
                match_end,
            });

            if results.len() >= limit {
                break;
            }
        }

        Ok(results)
    }
}

/// Read file with encoding detection (try UTF-8 first, then GB18030, Big5, Shift_JIS)
fn read_file_safe(path: &str) -> String {
    let bytes = match std::fs::read(path) {
        Ok(b) => b,
        Err(_) => return String::new(),
    };

    // Try UTF-8 first
    if let Ok(s) = String::from_utf8(bytes.clone()) {
        return s;
    }

    // Fall back to encoding_rs decoding
    for enc_name in &["GB18030", "Big5", "Shift_JIS", "UTF-16LE", "Windows-1252"] {
        if let Some(enc) = Encoding::for_label(enc_name.as_bytes()) {
            let (result, _, had_errors) = enc.decode(&bytes);
            if !had_errors {
                return result.into_owned();
            }
        }
    }

    // Last resort: UTF-8 with replacement
    let (result, _, _) = encoding_rs::UTF_8.decode(&bytes);
    result.into_owned()
}

/// Generate a snippet with context around the first match
/// Uses character indices to avoid panicking on multi-byte characters
fn generate_snippet(body: &str, query: &str, context_chars: usize) -> String {
    let lower_body = body.to_lowercase();
    let lower_query = query.to_lowercase();

    if let Some(pos) = lower_body.find(&lower_query) {
        // Convert byte position to character position (important for multi-byte text)
        let char_pos = lower_body[..pos].chars().count();
        let query_chars = query.chars().count();

        let char_indices: Vec<(usize, usize)> = body.char_indices()
            .map(|(i, c)| (i, c.len_utf8()))
            .collect();

        let total_chars = char_indices.len();

        let start_char = char_pos.saturating_sub(context_chars / 2);
        let start_byte = char_indices.get(start_char).map(|&(i, _)| i).unwrap_or(0);

        let end_char = (char_pos + query_chars + context_chars / 2).min(total_chars);
        let end_byte = if end_char >= total_chars {
            body.len()
        } else {
            char_indices.get(end_char).map(|&(i, _)| i).unwrap_or(body.len())
        };

        let snippet = &body[start_byte..end_byte];
        if start_char > 0 {
            format!("...{}...", snippet)
        } else {
            format!("{}...", snippet)
        }
    } else {
        body.chars().take(context_chars).collect::<String>() + "..."
    }
}

fn collect_md_files(path: &str) -> Vec<String> {
    let mut files = Vec::new();
    let dir = match std::fs::read_dir(path) {
        Ok(d) => d,
        Err(_) => return files,
    };

    for entry in dir.flatten() {
        let entry_path = entry.path();
        if entry_path.is_dir() {
            if entry_path
                .file_name()
                .map(|n| n == ".bilberry")
                .unwrap_or(false)
            {
                continue;
            }
            files.extend(collect_md_files(&entry_path.to_string_lossy()));
        } else if entry_path.extension().map(|e| e == "md").unwrap_or(false) {
            files.push(entry_path.to_string_lossy().to_string());
        }
    }

    files
}
