mod scanner;
mod vault;
mod watcher;

pub use scanner::*;
pub use vault::*;

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct FileEntry {
    pub path: String,
    pub name: String,
    pub is_dir: bool,
    pub children: Option<Vec<FileEntry>>,
}

impl FileEntry {
    pub fn new(path: String, name: String, is_dir: bool) -> Self {
        FileEntry {
            path,
            name,
            is_dir,
            children: if is_dir { Some(Vec::new()) } else { None },
        }
    }
}
