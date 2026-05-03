use std::path::Path;
use crate::vault::FileEntry;

pub fn scan_directory(path: &str) -> Result<Vec<FileEntry>, String> {
    let dir = Path::new(path);
    if !dir.is_dir() {
        return Err(format!("Not a directory: {}", path));
    }

    let mut entries = Vec::new();
    let mut dirs: Vec<_> = std::fs::read_dir(dir)
        .map_err(|e| format!("Failed to read directory: {}", e))?
        .filter_map(|e| e.ok())
        .filter(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            !name.starts_with('.')
        })
        .collect();

    dirs.sort_by_key(|e| {
        let is_dir = e.file_type().map(|t| t.is_dir()).unwrap_or(false);
        let name = e.file_name().to_string_lossy().to_string();
        (!is_dir, name.clone()) // dirs first, then alphabetical
    });

    for entry in dirs {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);

        if is_dir {
            let children = scan_directory(&path.to_string_lossy()).unwrap_or_default();
            let mut fe = FileEntry::new(path.to_string_lossy().to_string(), name, true);
            fe.children = Some(children);
            entries.push(fe);
        } else if name.ends_with(".md") {
            entries.push(FileEntry::new(path.to_string_lossy().to_string(), name, false));
        }
    }

    Ok(entries)
}
