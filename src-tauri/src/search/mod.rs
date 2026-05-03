use std::path::Path;
use std::sync::Mutex;
use serde::Serialize;
use tantivy::collector::TopDocs;
use tantivy::query::QueryParser;
use tantivy::schema::*;
use tantivy::{doc, Index, IndexWriter, ReloadPolicy, TantivyDocument};

#[derive(Debug, Clone, Serialize)]
pub struct SearchResult {
    pub path: String,
    pub title: String,
    pub snippet: String,
    pub score: f32,
}

pub struct SearchIndex {
    index: Index,
    schema: Schema,
    writer: Mutex<IndexWriter>,
    vault_path: String,
}

impl SearchIndex {
    pub fn new(vault_path: &str) -> Result<Self, String> {
        let index_dir = Path::new(vault_path).join(".bilberry/search");
        std::fs::create_dir_all(&index_dir)
            .map_err(|e| format!("Failed to create search index dir: {}", e))?;

        let mut schema_builder = Schema::builder();
        schema_builder.add_text_field("path", STRING | STORED);
        schema_builder.add_text_field("title", TEXT | STORED);
        schema_builder.add_text_field("body", TEXT | STORED);
        let schema = schema_builder.build();

        let index = if index_dir.join("meta.json").exists() {
            Index::open_in_dir(&index_dir)
                .map_err(|e| format!("Failed to open search index: {}", e))?
        } else {
            Index::create_in_dir(&index_dir, schema.clone())
                .map_err(|e| format!("Failed to create search index: {}", e))?
        };

        let writer = index
            .writer(50_000_000)
            .map_err(|e| format!("Failed to create index writer: {}", e))?;

        Ok(SearchIndex {
            index,
            schema,
            writer: Mutex::new(writer),
            vault_path: vault_path.to_string(),
        })
    }

    /// Index all .md files in the vault
    pub fn index_all(&self) -> Result<(), String> {
        let path_field = self.schema.get_field("path").map_err(|e| e.to_string())?;
        let title_field = self.schema.get_field("title").map_err(|e| e.to_string())?;
        let body_field = self.schema.get_field("body").map_err(|e| e.to_string())?;

        let files = collect_md_files(&self.vault_path);
        let mut writer = self.writer.lock().map_err(|e| format!("Lock error: {}", e))?;

        for file_path in &files {
            let content = std::fs::read_to_string(file_path)
                .map_err(|e| format!("Failed to read {}: {}", file_path, e))?;

            let title = Path::new(file_path)
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default();

            // Extract first heading as a better title if available
            let display_title = content
                .lines()
                .find(|l| l.starts_with("# "))
                .map(|l| l.trim_start_matches("# ").to_string())
                .unwrap_or(title);

            writer
                .add_document(doc!(
                    path_field => file_path.as_str(),
                    title_field => display_title,
                    body_field => content.as_str(),
                ))
                .map_err(|e| format!("Failed to add document: {}", e))?;
        }

        writer
            .commit()
            .map_err(|e| format!("Failed to commit index: {}", e))?;

        Ok(())
    }

    /// Search the index for a query string
    pub fn search(&self, query_str: &str, limit: usize) -> Result<Vec<SearchResult>, String> {
        let path_field = self.schema.get_field("path").map_err(|e| e.to_string())?;
        let title_field = self.schema.get_field("title").map_err(|e| e.to_string())?;
        let body_field = self.schema.get_field("body").map_err(|e| e.to_string())?;

        let reader = self
            .index
            .reader_builder()
            .reload_policy(ReloadPolicy::OnCommitWithDelay)
            .try_into()
            .map_err(|e| format!("Failed to create reader: {}", e))?;

        let searcher = reader.searcher();

        let query_parser = QueryParser::for_index(&self.index, vec![title_field, body_field]);
        let query = query_parser
            .parse_query(query_str)
            .map_err(|e| format!("Failed to parse query: {}", e))?;

        let top_docs = searcher
            .search(&query, &TopDocs::with_limit(limit))
            .map_err(|e| format!("Search failed: {}", e))?;

        let mut results = Vec::new();
        for (score, doc_address) in top_docs {
            let doc: TantivyDocument = searcher
                .doc::<TantivyDocument>(doc_address)
                .map_err(|e| format!("Failed to get doc: {}", e))?;

            let path = doc
                .get_first(path_field)
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let title = doc
                .get_first(title_field)
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let body = doc
                .get_first(body_field)
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            // Generate a snippet from the body around the matched text
            let snippet = generate_snippet(&body, query_str, 120);

            results.push(SearchResult {
                path,
                title,
                snippet,
                score,
            });
        }

        Ok(results)
    }
}

/// Generate a snippet with context around the first match
fn generate_snippet(body: &str, query: &str, context_chars: usize) -> String {
    let lower_body = body.to_lowercase();
    let lower_query = query.to_lowercase();

    if let Some(pos) = lower_body.find(&lower_query) {
        let start = pos.saturating_sub(context_chars / 2);
        let end = (pos + query.len() + context_chars / 2).min(body.len());
        let snippet = &body[start..end];
        if start > 0 {
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
            // Skip .bilberry directory
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

