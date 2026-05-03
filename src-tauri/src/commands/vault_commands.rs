use crate::vault::{scan_directory, Vault};

#[tauri::command]
pub fn open_vault(path: String) -> Result<Vault, String> {
    let vault = Vault::open(&path)?;
    Ok(vault)
}

#[tauri::command]
pub fn create_vault(path: String) -> Result<Vault, String> {
    let vault = Vault::create(&path)?;
    Ok(vault)
}

#[tauri::command]
pub fn get_file_tree(path: String) -> Result<Vec<crate::vault::FileEntry>, String> {
    scan_directory(&path)
}
