use std::sync::Mutex;
use std::sync::atomic::{AtomicU32, AtomicBool, Ordering};
use tauri::{Emitter, Manager, State};
#[cfg(target_os = "macos")]
use tauri::TitleBarStyle;

static WINDOW_COUNT: AtomicU32 = AtomicU32::new(1);

/// Create a new webview window with the standard title bar overlay.
fn spawn_window(app: &tauri::AppHandle, url: &str, w: f64, h: f64, min_w: f64, min_h: f64) {
    let label = format!("window-{}", WINDOW_COUNT.fetch_add(1, Ordering::Relaxed));
    #[allow(unused_mut)]
    let mut builder = tauri::WebviewWindowBuilder::new(app, &label, tauri::WebviewUrl::App(url.into()))
        .title("")
        .inner_size(w, h)
        .min_inner_size(min_w, min_h);
    #[cfg(target_os = "macos")]
    {
        builder = builder.title_bar_style(TitleBarStyle::Overlay).hidden_title(true);
    }
    builder.build().ok();
}

#[tauri::command]
fn create_new_window(app: tauri::AppHandle) {
    spawn_window(&app, "index.html", 720.0, 680.0, 500.0, 400.0);
}

/// Open a new window with an untitled document ready to edit.
#[tauri::command]
fn new_file_window(app: tauri::AppHandle) {
    spawn_window(&app, "index.html?untitled=1", 720.0, 680.0, 500.0, 400.0);
}

/// A preview theme as shipped by the frontend (`src/lib/themes/preview-themes.ts`
/// is the single source of truth). The frontend pushes the list at startup via
/// `set_theme_list` so the native Theme menu always matches the app.
#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct ThemeInfo {
    pub(crate) id: String,
    pub(crate) label: String,
    /// "light" or "dark"
    pub(crate) mode: String,
}

pub(crate) struct AppState {
    pub(crate) pending_files: Mutex<Vec<String>>,
    pub(crate) frontend_ready: AtomicBool,
    pub(crate) menu_language: Mutex<String>,
    pub(crate) theme: Mutex<String>,
    pub(crate) preview_theme: Mutex<String>,
    pub(crate) theme_list: Mutex<Vec<ThemeInfo>>,
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

#[tauri::command]
fn get_pending_files(state: State<'_, AppState>) -> Vec<String> {
    state.pending_files.lock().unwrap().clone()
}

mod commands;
mod export;
mod menu;
mod recent;
mod search;
mod vault;
mod wikilink;

#[tauri::command]
fn refresh_menu(app: tauri::AppHandle) {
    menu::rebuild_menu(&app);
}

/// Updates the native menu language (`"zh"` or `"en"`) and rebuilds the menu.
/// Called by the frontend after it resolves the UI language.
#[tauri::command]
fn set_language(app: tauri::AppHandle, state: State<'_, AppState>, language: String) {
    let mut current = state.menu_language.lock().unwrap();
    if *current != language {
        *current = language;
        drop(current);
        menu::rebuild_menu(&app);
    }
}

/// Stores the base theme (`"light"` / `"dark"` / `"system"`) so the native
/// menu's theme checkmark stays in sync, and rebuilds the menu when it changed.
/// Called by the frontend whenever the theme setting changes.
#[tauri::command]
fn set_theme(app: tauri::AppHandle, state: State<'_, AppState>, theme: String) {
    let mut current = state.theme.lock().unwrap();
    if *current != theme {
        *current = theme;
        drop(current);
        menu::rebuild_menu(&app);
    }
}

/// Stores the selected preview theme id (e.g. `"dracula"`, `"system"`) so the
/// native menu's per-theme checkmark stays in sync, and rebuilds the menu when
/// it changed. Called by the frontend whenever the preview theme changes.
#[tauri::command]
fn set_preview_theme(app: tauri::AppHandle, state: State<'_, AppState>, theme: String) {
    let mut current = state.preview_theme.lock().unwrap();
    if *current != theme {
        *current = theme;
        drop(current);
        menu::rebuild_menu(&app);
    }
}

/// Stores the preview theme list sent by the frontend (the single source of
/// truth is `src/lib/themes/preview-themes.ts`) and rebuilds the native menu,
/// so the Theme submenu shows exactly the themes the app actually ships.
#[tauri::command]
fn set_theme_list(app: tauri::AppHandle, state: State<'_, AppState>, themes: Vec<ThemeInfo>) {
    let mut current = state.theme_list.lock().unwrap();
    if *current != themes {
        *current = themes;
        drop(current);
        menu::rebuild_menu(&app);
    }
}

#[tauri::command]
fn open_in_new_window(app: tauri::AppHandle, vault_path: Option<String>, file_path: Option<String>) {
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

    spawn_window(&app, &url_str, 720.0, 680.0, 500.0, 400.0);
}

#[tauri::command]
fn clear_recent_list(app: tauri::AppHandle) {
    let entries = recent::load_recent();
    for e in &entries {
        recent::remove_recent(&e.path);
    }
    menu::rebuild_menu(&app);
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
            menu_language: Mutex::new("en".to_string()),
            theme: Mutex::new("system".to_string()),
            preview_theme: Mutex::new("system".to_string()),
            theme_list: Mutex::new(Vec::new()),
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
        builder = builder.menu(|app| menu::build_menu(app));
    }

    let app = builder
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                #[cfg(target_os = "macos")]
                {
                    let _ = window.set_title_bar_style(TitleBarStyle::Overlay);
                    let _ = window.set_title("");
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
                    if !path.is_empty() {
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
                "open_file" => {
                    app.emit("menu-open-file", ()).ok();
                }
                "new_file" => {
                    spawn_window(app, "index.html?untitled=1", 720.0, 680.0, 500.0, 400.0);
                }
                "save" => {
                    app.emit("menu-save", ()).ok();
                }
                "save_as" => {
                    app.emit("menu-save-as", ()).ok();
                }
                "new_window" => {
                    spawn_window(app, "index.html", 1200.0, 800.0, 800.0, 600.0);
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
                "toggle_sidebar" => {
                    app.emit("menu-toggle-sidebar", ()).ok();
                }
                "theme_system" => {
                    app.emit("menu-set-theme", "system").ok();
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
                    menu::rebuild_menu(app);
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
                    } else if let Some(theme_id) = id.strip_prefix("theme_preview_") {
                        app.emit("menu-set-preview-theme", theme_id).ok();
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
            set_language,
            set_theme,
            set_preview_theme,
            set_theme_list,
            notify_frontend_ready,
            get_pending_files,
            create_new_window,
            new_file_window,
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
