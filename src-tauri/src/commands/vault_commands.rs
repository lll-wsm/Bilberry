use crate::vault::{scan_directory, Vault, FileWatcher};
use crate::WatcherState;
use crate::commands::SearchState;
use tauri::{Window, State, Manager, Emitter};

#[tauri::command]
pub fn open_vault(
    path: String,
    window: Window,
    watcher_state: State<'_, WatcherState>,
    search_state: State<'_, SearchState>,
) -> Result<Vault, String> {
    let vault = Vault::open(&path)?;

    let label = window.label().to_string();
    // Retire the previous watcher for this window. Take it out under the lock
    // but drop it *after* releasing the lock, so teardown never blocks other
    // windows or poisons the mutex. (FileWatcher::drop is panic-safe anyway.)
    let old_watcher = {
        let mut watchers = watcher_state.watchers.lock().unwrap();
        watchers.remove(&label)
    };
    drop(old_watcher);

    let app_handle = window.app_handle().clone();
    let window_label = window.label().to_string();

    #[derive(Clone, serde::Serialize)]
    struct FileWatchPayload {
        #[serde(rename = "type")]
        event_type: String,
        path: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        old_path: Option<String>,
    }

    let watcher_res = FileWatcher::start(&path, move |res| {
        if let Ok(event) = res {
            let mut event_type = None;
            let mut old_path = None;
            let mut path = None;

            use notify::event::{EventKind, ModifyKind, CreateKind, RemoveKind, RenameMode};

            match event.kind {
                EventKind::Create(CreateKind::File) | EventKind::Create(CreateKind::Folder) | EventKind::Create(CreateKind::Any) => {
                    event_type = Some("create".to_string());
                    path = event.paths.first().map(|p| p.to_string_lossy().to_string());
                }
                EventKind::Modify(ModifyKind::Data(_)) | EventKind::Modify(ModifyKind::Any) => {
                    event_type = Some("modify".to_string());
                    path = event.paths.first().map(|p| p.to_string_lossy().to_string());
                }
                EventKind::Remove(RemoveKind::File) | EventKind::Remove(RemoveKind::Folder) | EventKind::Remove(RemoveKind::Any) => {
                    event_type = Some("remove".to_string());
                    path = event.paths.first().map(|p| p.to_string_lossy().to_string());
                }
                EventKind::Modify(ModifyKind::Name(RenameMode::Both)) | EventKind::Modify(ModifyKind::Name(RenameMode::Any)) => {
                    event_type = Some("rename".to_string());
                    if event.paths.len() >= 2 {
                        old_path = Some(event.paths[0].to_string_lossy().to_string());
                        path = Some(event.paths[1].to_string_lossy().to_string());
                    } else {
                        path = event.paths.first().map(|p| p.to_string_lossy().to_string());
                    }
                }
                _ => {}
            }

            if let (Some(et), Some(p)) = (event_type, path) {
                if p.ends_with(".md") {
                    if let Some(search_state) = app_handle.try_state::<SearchState>() {
                        if let Ok(mut lock) = search_state.0.lock() {
                            if let Some(index) = lock.as_mut() {
                                match et.as_str() {
                                    "create" | "modify" => {
                                        let _ = index.update_file(&p);
                                    }
                                    "remove" => {
                                        index.remove_file(&p);
                                    }
                                    "rename" => {
                                        if let Some(ref op) = old_path {
                                            index.remove_file(op);
                                        }
                                        let _ = index.update_file(&p);
                                    }
                                    _ => {}
                                }
                            }
                        }
                    }
                }

                let payload = FileWatchPayload {
                    event_type: et,
                    path: p,
                    old_path,
                };

                if let Some(win) = app_handle.get_webview_window(&window_label) {
                    let _ = win.emit("vault-file-changed", payload);
                }
            }
        }
    });

    match watcher_res {
        Ok(watcher) => {
            let mut watchers = watcher_state.watchers.lock().unwrap();
            watchers.insert(label, watcher);
        }
        Err(e) => {
            eprintln!("Warning: Failed to start file watcher for vault (path: {}): {}", path, e);
        }
    }

    Ok(vault)
}

#[tauri::command]
pub fn create_vault(path: String) -> Result<Vault, String> {
    let vault = Vault::create(&path)?;
    Ok(vault)
}

#[tauri::command]
pub fn get_file_tree(path: String, show_hidden: Option<bool>) -> Result<Vec<crate::vault::FileEntry>, String> {
    scan_directory(&path, show_hidden.unwrap_or(true))
}
