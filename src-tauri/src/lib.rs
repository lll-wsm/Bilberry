use std::sync::Mutex;
use std::sync::atomic::{AtomicU32, AtomicBool, Ordering};
use tauri::{Emitter, Manager, State};
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder, PredefinedMenuItem};
#[cfg(target_os = "macos")]
use tauri::TitleBarStyle;

#[tauri::command]
fn create_new_window(app: tauri::AppHandle) {
    let label = format!("window-{}", WINDOW_COUNT.fetch_add(1, Ordering::Relaxed));
    #[allow(unused_mut)]
    let mut builder = tauri::WebviewWindowBuilder::new(&app, &label, tauri::WebviewUrl::App("index.html".into()))
        .title("Bilberry")
        .inner_size(1200.0, 800.0)
        .min_inner_size(800.0, 600.0);
    #[cfg(target_os = "macos")]
    {
        builder = builder.title_bar_style(TitleBarStyle::Overlay).hidden_title(true);
    }
    builder.build().ok();
}

static WINDOW_COUNT: AtomicU32 = AtomicU32::new(1);

struct AppState {
    pending_files: Mutex<Vec<String>>,
    frontend_ready: AtomicBool,
}

pub struct WatcherState {
    pub watchers: Mutex<std::collections::HashMap<String, vault::FileWatcher>>,
}


#[tauri::command]
fn notify_frontend_ready(app: tauri::AppHandle, state: State<'_, AppState>) {
    state.frontend_ready.store(true, Ordering::SeqCst);
    let mut files = state.pending_files.lock().unwrap();
    for file in files.iter() {
        app.emit("file-opened", file).ok();
    }
    files.clear();
}

mod commands;
mod export;
mod recent;
mod search;
mod vault;
mod wikilink;

fn build_menu(app: &tauri::AppHandle) -> Result<tauri::menu::Menu<tauri::Wry>, tauri::Error> {
    let settings = MenuItemBuilder::with_id("settings", "Settings...")
        .accelerator("CmdOrCtrl+,")
        .build(app)?;

    let app_menu = SubmenuBuilder::new(app, "Bilberry")
        .item(&PredefinedMenuItem::about(app, Some("About Bilberry"), None)?)
        .separator()
        .item(&settings)
        .separator()
        .item(&PredefinedMenuItem::services(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::hide(app, None)?)
        .item(&PredefinedMenuItem::hide_others(app, None)?)
        .item(&PredefinedMenuItem::show_all(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::quit(app, None)?)
        .build()?;

    let new_window = MenuItemBuilder::with_id("new_window", "New Window")
        .accelerator("CmdOrCtrl+N")
        .build(app)?;

    let create_vault = MenuItemBuilder::with_id("create_vault", "Create Directory...")
        .build(app)?;

    let open_vault = MenuItemBuilder::with_id("open_vault", "Open Vault...")
        .accelerator("CmdOrCtrl+O")
        .build(app)?;

    let recent_entries = recent::load_recent();
    let mut recent_menu_builder = SubmenuBuilder::new(app, "Open Recent");

    if recent_entries.is_empty() {
        let no_recent = MenuItemBuilder::with_id("no_recent", "No Recent Items")
            .enabled(false)
            .build(app)?;
        recent_menu_builder = recent_menu_builder.item(&no_recent);
    } else {
        let vaults: Vec<&recent::RecentEntry> = recent_entries.iter().filter(|e| e.kind == "vault").collect();
        let files: Vec<&recent::RecentEntry> = recent_entries.iter().filter(|e| e.kind == "file").collect();

        if !vaults.is_empty() {
            let folder_label = MenuItemBuilder::with_id("label_folders", "Folders")
                .enabled(false)
                .build(app)?;
            recent_menu_builder = recent_menu_builder.item(&folder_label);

            for entry in &vaults {
                let idx = recent_entries.iter().position(|e| e.path == entry.path).unwrap();
                let name = entry.path.split('/').last().unwrap_or(&entry.path);
                let item = MenuItemBuilder::with_id(
                    &format!("open_recent_{}", idx),
                    name,
                )
                .build(app)?;
                recent_menu_builder = recent_menu_builder.item(&item);
            }
        }

        if !vaults.is_empty() && !files.is_empty() {
            recent_menu_builder = recent_menu_builder.separator();
        }

        if !files.is_empty() {
            let file_label = MenuItemBuilder::with_id("label_files", "Files")
                .enabled(false)
                .build(app)?;
            recent_menu_builder = recent_menu_builder.item(&file_label);

            for entry in &files {
                let idx = recent_entries.iter().position(|e| e.path == entry.path).unwrap();
                let name = entry.path.split('/').last().unwrap_or(&entry.path);
                let item = MenuItemBuilder::with_id(
                    &format!("open_recent_{}", idx),
                    name,
                )
                .build(app)?;
                recent_menu_builder = recent_menu_builder.item(&item);
            }
        }

        recent_menu_builder = recent_menu_builder.separator();
        let clear_recent = MenuItemBuilder::with_id("clear_recent", "Clear Recently Opened")
            .build(app)?;
        recent_menu_builder = recent_menu_builder.item(&clear_recent);
    }

    let open_recent_menu = recent_menu_builder.build()?;

    let close_window = MenuItemBuilder::with_id("close_window", "Close Window")
        .accelerator("CmdOrCtrl+W")
        .build(app)?;

    let file_menu = SubmenuBuilder::new(app, "File")
        .item(&new_window)
        .separator()
        .item(&create_vault)
        .item(&open_vault)
        .item(&open_recent_menu)
        .separator()
        .item(&close_window)
        .build()?;

    let find = MenuItemBuilder::with_id("find", "Find...")
        .accelerator("CmdOrCtrl+F")
        .build(app)?;

    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .item(&PredefinedMenuItem::undo(app, None)?)
        .item(&PredefinedMenuItem::redo(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::cut(app, None)?)
        .item(&PredefinedMenuItem::copy(app, None)?)
        .item(&PredefinedMenuItem::paste(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::select_all(app, None)?)
        .separator()
        .item(&find)
        .build()?;

    let view_menu = SubmenuBuilder::new(app, "View")
        .item(&PredefinedMenuItem::fullscreen(app, None)?)
        .separator()
        .item(
            &MenuItemBuilder::with_id("zoom_in", "Zoom In")
                .accelerator("CmdOrCtrl+Plus")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("zoom_out", "Zoom Out")
                .accelerator("CmdOrCtrl+-")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("actual_size", "Actual Size")
                .accelerator("CmdOrCtrl+0")
                .build(app)?,
        )
        .build()?;

    let window_menu = SubmenuBuilder::new(app, "Window")
        .item(&PredefinedMenuItem::minimize(app, None)?)
        .item(
            &MenuItemBuilder::with_id("zoom", "Zoom")
                .build(app)?,
        )
        .separator()
        .item(&PredefinedMenuItem::hide(app, None)?)
        .item(&PredefinedMenuItem::hide_others(app, None)?)
        .item(&PredefinedMenuItem::show_all(app, None)?)
        .build()?;

    MenuBuilder::new(app)
        .item(&app_menu)
        .item(&file_menu)
        .item(&edit_menu)
        .item(&view_menu)
        .item(&window_menu)
        .build()
}

fn rebuild_menu(app: &tauri::AppHandle) {
    #[cfg(target_os = "macos")]
    if let Ok(menu) = build_menu(app) {
        app.set_menu(menu).ok();
    }
}

#[tauri::command]
fn refresh_menu(app: tauri::AppHandle) {
    rebuild_menu(&app);
}

#[tauri::command]
fn open_in_new_window(app: tauri::AppHandle, vault_path: Option<String>, file_path: Option<String>) {
    let label = format!("window-{}", WINDOW_COUNT.fetch_add(1, Ordering::Relaxed));
    let mut query = String::new();
    if let Some(vp) = vault_path {
        query.push_str(&format!("?vault={}", urlencoding::encode(&vp)));
    }
    if let Some(fp) = file_path {
        if query.is_empty() {
            query.push_str(&format!("?file={}", urlencoding::encode(&fp)));
        } else {
            query.push_str(&format!("&file={}", urlencoding::encode(&fp)));
        }
    }
    
    let url_str = format!("index.html{}", query);
    
    #[allow(unused_mut)]
    let mut builder = tauri::WebviewWindowBuilder::new(&app, &label, tauri::WebviewUrl::App(url_str.into()))
        .title("Bilberry")
        .inner_size(1200.0, 800.0)
        .min_inner_size(800.0, 600.0);
        
    #[cfg(target_os = "macos")]
    {
        builder = builder.title_bar_style(TitleBarStyle::Overlay).hidden_title(true);
    }
    builder.build().ok();
}

#[tauri::command]
fn clear_recent_list(app: tauri::AppHandle) {
    let entries = recent::load_recent();
    for e in &entries {
        recent::remove_recent(&e.path);
    }
    rebuild_menu(&app);
    app.emit("menu-recent-updated", ()).ok();
}

#[derive(Clone, serde::Serialize)]
struct RecentPayload {
    path: String,
    kind: String,
}

pub fn run() {
    let mut builder = tauri::Builder::default()
        .manage(AppState {
            pending_files: Mutex::new(Vec::new()),
            frontend_ready: AtomicBool::new(false),
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_os::init())
        .manage(commands::SearchState(Mutex::new(None)))
        .manage(WatcherState {
            watchers: Mutex::new(std::collections::HashMap::new()),
        });

    #[cfg(target_os = "macos")]
    {
        builder = builder.menu(|app| build_menu(app));
    }

    let app = builder
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                #[cfg(target_os = "macos")]
                {
                    let _ = window.set_title_bar_style(TitleBarStyle::Overlay);
                }

                #[cfg(not(target_os = "macos"))]
                {
                    let _ = window.set_decorations(false);
                }
            }

            #[cfg(not(any(target_os = "macos", target_os = "ios")))]
            {
                let args: Vec<String> = std::env::args().collect();
                if args.len() > 1 {
                    let path = &args[1];
                    if path.ends_with(".md") || path.ends_with(".markdown") {
                        let state = app.state::<AppState>();
                        state.pending_files.lock().unwrap().push(path.clone());
                    }
                }
            }
            Ok(())
        })
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            match id {
                "settings" => {
                    app.emit("menu-show-settings", ()).ok();
                }
                "find" => {
                    app.emit("menu-find", ()).ok();
                }
                "create_vault" => {
                    app.emit("menu-create-vault", ()).ok();
                }
                "open_vault" => {
                    app.emit("menu-open-vault", ()).ok();
                }
                "new_window" => {
                    let label = format!("window-{}", WINDOW_COUNT.fetch_add(1, Ordering::Relaxed));
                    #[allow(unused_mut)]
                    let mut builder = tauri::WebviewWindowBuilder::new(app, &label, tauri::WebviewUrl::App("index.html".into()))
                        .title("Bilberry")
                        .inner_size(1200.0, 800.0)
                        .min_inner_size(800.0, 600.0);
                    #[cfg(target_os = "macos")]
                    {
                        builder = builder.title_bar_style(TitleBarStyle::Overlay).hidden_title(true);
                    }
                    builder.build().ok();
                }
                "zoom_in" => {
                    app.emit("menu-zoom-in", ()).ok();
                }
                "zoom_out" => {
                    app.emit("menu-zoom-out", ()).ok();
                }
                "actual_size" => {
                    app.emit("menu-zoom-reset", ()).ok();
                }
                "zoom" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.maximize();
                    }
                }
                "close_window" => {
                    app.emit("menu-close-window", ()).ok();
                }
                "clear_recent" => {
                    let entries = recent::load_recent();
                    for e in &entries {
                        recent::remove_recent(&e.path);
                    }
                    rebuild_menu(app);
                    app.emit("menu-recent-updated", ()).ok();
                }
                _ => {
                    if let Some(idx) = id.strip_prefix("open_recent_") {
                        if let Ok(n) = idx.parse::<usize>() {
                            let entries = recent::load_recent();
                            if let Some(entry) = entries.get(n) {
                                let payload = RecentPayload {
                                    path: entry.path.clone(),
                                    kind: entry.kind.clone(),
                                };
                                app.emit("menu-open-recent", payload).ok();
                            }
                        }
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::open_vault,
            commands::create_vault,
            commands::get_file_tree,
            commands::read_note,
            commands::read_binary_file,
            commands::write_note,
            commands::create_note,
            commands::delete_note,
            commands::rename_note,
            commands::get_wikilinks,
            commands::build_search_index,
            commands::search_notes,
            commands::save_data_file,
            commands::load_data_file,
            commands::reveal_in_finder,
            commands::copy_file,
            commands::delete_directory,
            commands::create_directory,
            export::export_html,
            commands::add_to_recent,
            commands::get_recent_list,
            commands::remove_from_recent,
            refresh_menu,
            notify_frontend_ready,
            create_new_window,
            open_in_new_window,
            clear_recent_list,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| match event {
        #[cfg(any(target_os = "macos", target_os = "ios"))]
        tauri::RunEvent::Opened { urls } => {
            let state = app_handle.state::<AppState>();
            let is_ready = state.frontend_ready.load(Ordering::SeqCst);
            
            for url in urls {
                if let Ok(path) = url.to_file_path() {
                    let p_str = path.to_string_lossy().to_string();
                    if is_ready {
                        app_handle.emit("file-opened", p_str).ok();
                    } else {
                        state.pending_files.lock().unwrap().push(p_str);
                    }
                }
            }
        }
        _ => {}
    });
}
