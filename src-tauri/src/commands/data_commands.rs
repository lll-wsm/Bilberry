use std::path::PathBuf;
use std::fs;

fn data_dir() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    PathBuf::from(home).join(".bilberry")
}

#[tauri::command]
pub fn save_data_file(filename: String, content: String) -> Result<(), String> {
    let dir = data_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create data dir: {}", e))?;
    let path = dir.join(&filename);
    fs::write(&path, &content).map_err(|e| format!("Failed to write {}: {}", filename, e))
}

#[tauri::command]
pub fn load_data_file(filename: String) -> Result<String, String> {
    let path = data_dir().join(&filename);
    fs::read_to_string(&path).map_err(|e| format!("Failed to read {}: {}", filename, e))
}
