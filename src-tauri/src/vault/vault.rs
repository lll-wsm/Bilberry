use std::path::PathBuf;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct Vault {
    pub path: String,
    pub name: String,
}

impl Vault {
    pub fn open(path: &str) -> Result<Self, String> {
        let p = PathBuf::from(path);
        if !p.exists() {
            return Err(format!("Vault path does not exist: {}", path));
        }
        let name = p
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "Untitled".to_string());
        Ok(Vault {
            path: p.to_string_lossy().to_string(),
            name,
        })
    }

    pub fn create(path: &str) -> Result<Self, String> {
        let p = PathBuf::from(path);
        if p.exists() {
            return Err(format!("Path already exists: {}", path));
        }
        std::fs::create_dir_all(&p)
            .map_err(|e| format!("Failed to create vault directory: {}", e))?;
        Ok(Vault {
            path: p.to_string_lossy().to_string(),
            name: p
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| "Untitled".to_string()),
        })
    }

    #[allow(dead_code)]
    pub fn join(&self, relative_path: &str) -> PathBuf {
        let base = PathBuf::from(&self.path);
        base.join(relative_path)
    }
}
