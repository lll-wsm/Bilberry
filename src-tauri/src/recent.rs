use std::path::PathBuf;
use std::fs;
use serde::{Deserialize, Serialize};
use chrono::Utc;

const MAX_RECENT: usize = 10;
const RECENT_FILE_NAME: &str = "recent-files.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentEntry {
    pub path: String,
    pub kind: String,
    pub timestamp: i64,
}

fn data_dir() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    PathBuf::from(home).join(".bilberry")
}

fn recent_file_path() -> PathBuf {
    data_dir().join(RECENT_FILE_NAME)
}

pub fn load_recent() -> Vec<RecentEntry> {
    let path = recent_file_path();
    if let Ok(content) = fs::read_to_string(&path) {
        if let Ok(entries) = serde_json::from_str::<Vec<RecentEntry>>(&content) {
            return entries;
        }
    }
    Vec::new()
}

fn save_recent(entries: &[RecentEntry]) {
    let dir = data_dir();
    fs::create_dir_all(&dir).ok();
    let path = recent_file_path();
    if let Ok(json) = serde_json::to_string_pretty(entries) {
        fs::write(&path, &json).ok();
    }
}

pub fn add_recent(path: &str, kind: &str) {
    let mut entries = load_recent();
    entries.retain(|e| e.path != path);
    entries.insert(0, RecentEntry {
        path: path.to_string(),
        kind: kind.to_string(),
        timestamp: Utc::now().timestamp(),
    });
    entries.truncate(MAX_RECENT);
    save_recent(&entries);
}

pub fn remove_recent(path: &str) {
    let mut entries = load_recent();
    entries.retain(|e| e.path != path);
    save_recent(&entries);
}
