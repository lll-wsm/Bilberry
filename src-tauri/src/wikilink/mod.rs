use serde::Serialize;
use regex::Regex;

#[derive(Debug, Clone, Serialize)]
pub struct WikiLink {
    /// The target of the link (what's inside [[ ]])
    pub target: String,
    /// Optional display name (after |)
    pub alias: Option<String>,
    /// The full matched text (including brackets)
    pub raw: String,
}

/// Extract all [[wiki links]] from markdown content.
/// Handles [[target]] and [[target|alias]] formats.
pub fn extract_wikilinks(content: &str) -> Vec<WikiLink> {
    // Matches [[...]] with optional |alias
    let re = match Regex::new(r"\[\[([^\[\]]+?)(?:\|([^\[\]]*?))?\]\]") {
        Ok(r) => r,
        Err(_) => return Vec::new(),
    };

    re.captures_iter(content)
        .map(|cap| {
            let target = cap.get(1).map(|m| m.as_str().trim()).unwrap_or("").to_string();
            let alias = cap.get(2).map(|m| {
                let a = m.as_str().trim();
                if a.is_empty() { None } else { Some(a.to_string()) }
            }).flatten();
            let raw = cap.get(0).map(|m| m.as_str()).unwrap_or("").to_string();

            WikiLink { target, alias, raw }
        })
        .collect()
}

/// Resolve a wiki link target to a full file path within a vault.
/// If the target already has a path separator or extension, treat as literal path.
/// Otherwise, search for a matching .md file by name.
#[allow(dead_code)]
pub fn resolve_wikilink(target: &str, vault_path: &str) -> Option<String> {
    // If target already looks like a path with extension
    if target.contains('/') || target.contains('\\') || target.ends_with(".md") {
        let full = std::path::Path::new(vault_path).join(target);
        if full.exists() {
            return Some(full.to_string_lossy().to_string());
        }
        return None;
    }

    // Search for a matching .md file in the vault
    let target_lower = target.to_lowercase();
    let all_files = collect_md_files(vault_path);
    for file_path in &all_files {
        let file_stem = std::path::Path::new(file_path)
            .file_stem()
            .map(|s| s.to_string_lossy().to_lowercase())
            .unwrap_or_default();
        if file_stem == target_lower {
            return Some(file_path.clone());
        }
    }

    None
}

/// Collect all .md file paths recursively in a directory.
#[allow(dead_code)]
fn collect_md_files(path: &str) -> Vec<String> {
    let mut files = Vec::new();
    let dir = match std::fs::read_dir(path) {
        Ok(d) => d,
        Err(_) => return files,
    };

    for entry in dir.flatten() {
        let entry_path = entry.path();
        if entry_path.is_dir() {
            files.extend(collect_md_files(&entry_path.to_string_lossy()));
        } else if entry_path.extension().map(|e| e == "md").unwrap_or(false) {
            files.push(entry_path.to_string_lossy().to_string());
        }
    }

    files
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_simple_link() {
        let links = extract_wikilinks("Hello [[Note]] world");
        assert_eq!(links.len(), 1);
        assert_eq!(links[0].target, "Note");
        assert!(links[0].alias.is_none());
    }

    #[test]
    fn test_extract_link_with_alias() {
        let links = extract_wikilinks("See [[Note|My Note]] here");
        assert_eq!(links.len(), 1);
        assert_eq!(links[0].target, "Note");
        assert_eq!(links[0].alias.as_deref(), Some("My Note"));
    }

    #[test]
    fn test_extract_multiple_links() {
        let links = extract_wikilinks("[[A]] and [[B]] and [[C|See]]");
        assert_eq!(links.len(), 3);
    }

    #[test]
    fn test_no_links() {
        let links = extract_wikilinks("Just text without brackets");
        assert_eq!(links.len(), 0);
    }
}
