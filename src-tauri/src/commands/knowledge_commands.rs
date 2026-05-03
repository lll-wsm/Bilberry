use std::sync::Mutex;
use crate::search::{SearchIndex, SearchResult};
use crate::wikilink::{extract_wikilinks, WikiLink};

/// Tauri-managed state for the search index
pub struct SearchState(pub Mutex<Option<SearchIndex>>);

#[tauri::command]
pub fn get_wikilinks(path: String) -> Result<Vec<WikiLink>, String> {
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read file: {}", e))?;
    Ok(extract_wikilinks(&content))
}

#[tauri::command]
pub fn build_search_index(
    vault_path: String,
    state: tauri::State<'_, SearchState>,
) -> Result<(), String> {
    let index = SearchIndex::new(&vault_path)?;
    index.index_all()?;
    let mut lock = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    *lock = Some(index);
    Ok(())
}

#[tauri::command]
pub fn search_notes(
    query: String,
    limit: Option<usize>,
    state: tauri::State<'_, SearchState>,
) -> Result<Vec<SearchResult>, String> {
    let lock = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    match lock.as_ref() {
        Some(index) => index.search(&query, limit.unwrap_or(20)),
        None => Ok(Vec::new()),
    }
}

