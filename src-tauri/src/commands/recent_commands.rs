use crate::recent;
use serde::Serialize;

#[derive(Clone, Serialize)]
pub struct RecentEntryPayload {
    pub path: String,
    pub kind: String,
    pub timestamp: i64,
}

impl From<recent::RecentEntry> for RecentEntryPayload {
    fn from(e: recent::RecentEntry) -> Self {
        RecentEntryPayload {
            path: e.path,
            kind: e.kind,
            timestamp: e.timestamp,
        }
    }
}

#[tauri::command]
pub fn add_to_recent(path: String, kind: String) {
    recent::add_recent(&path, &kind);
}

#[tauri::command]
pub fn get_recent_list() -> Vec<RecentEntryPayload> {
    recent::load_recent()
        .into_iter()
        .map(RecentEntryPayload::from)
        .collect()
}

#[tauri::command]
pub fn remove_from_recent(path: String) {
    recent::remove_recent(&path);
}
