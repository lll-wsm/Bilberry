use std::sync::Mutex;
use std::sync::atomic::{AtomicU32, AtomicBool, Ordering};
use tauri::{Emitter, Manager, State};
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder, PredefinedMenuItem, CheckMenuItemBuilder};
#[cfg(target_os = "macos")]
use tauri::TitleBarStyle;

#[tauri::command]
fn create_new_window(app: tauri::AppHandle) {
    let label = format!("window-{}", WINDOW_COUNT.fetch_add(1, Ordering::Relaxed));
    #[allow(unused_mut)]
    let mut builder = tauri::WebviewWindowBuilder::new(&app, &label, tauri::WebviewUrl::App("index.html".into()))
        .title("")
        .inner_size(720.0, 680.0)
        .min_inner_size(500.0, 400.0);
    #[cfg(target_os = "macos")]
    {
        builder = builder.title_bar_style(TitleBarStyle::Overlay).hidden_title(true);
    }
    builder.build().ok();
}

/// Open a new window with an untitled document ready to edit.
#[tauri::command]
fn new_file_window(app: tauri::AppHandle) {
    let label = format!("window-{}", WINDOW_COUNT.fetch_add(1, Ordering::Relaxed));
    #[allow(unused_mut)]
    let mut builder = tauri::WebviewWindowBuilder::new(&app, &label, tauri::WebviewUrl::App("index.html?untitled=1".into()))
        .title("")
        .inner_size(720.0, 680.0)
        .min_inner_size(500.0, 400.0);
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
    menu_language: Mutex<String>,
    theme: Mutex<String>,
    preview_theme: Mutex<String>,
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
mod recent;
mod search;
mod vault;
mod wikilink;

/// Localized label for the native application menu. `language` is `"zh"` or
/// `"en"` (defaults to English for anything else).
fn menu_label<'a>(language: &str, key: &'a str) -> &'a str {
    let zh = language == "zh";
    match key {
        "app_name" => "Bilberry",
        "settings" => if zh { "设置…" } else { "Settings…" },
        "about" => if zh { "关于 Bilberry" } else { "About Bilberry" },
        "services" => if zh { "服务" } else { "Services" },
        "hide" => if zh { "隐藏" } else { "Hide" },
        "hide_others" => if zh { "隐藏其他" } else { "Hide Others" },
        "show_all" => if zh { "全部显示" } else { "Show All" },
        "quit" => if zh { "退出" } else { "Quit" },
        "file" => if zh { "文件" } else { "File" },
        "new_window" => if zh { "新建窗口" } else { "New Window" },
        "new_file" => if zh { "新建文件" } else { "New File" },
        "create_directory" => if zh { "创建目录…" } else { "Create Directory…" },
        "open_vault" => if zh { "打开目录…" } else { "Open Vault…" },
        "open_file" => if zh { "打开文件…" } else { "Open File…" },
        "open_recent" => if zh { "打开最近使用" } else { "Open Recent" },
        "save" => if zh { "保存" } else { "Save" },
        "save_as" => if zh { "另存为…" } else { "Save As…" },
        "close_window" => if zh { "关闭窗口" } else { "Close Window" },
        "edit" => if zh { "编辑" } else { "Edit" },
        "undo" => if zh { "撤销" } else { "Undo" },
        "redo" => if zh { "重做" } else { "Redo" },
        "cut" => if zh { "剪切" } else { "Cut" },
        "copy" => if zh { "拷贝" } else { "Copy" },
        "paste" => if zh { "粘贴" } else { "Paste" },
        "select_all" => if zh { "全选" } else { "Select All" },
        "find" => if zh { "查找…" } else { "Find…" },
        "view" => if zh { "视图" } else { "View" },
        "fullscreen" => if zh { "进入全屏幕" } else { "Enter Full Screen" },
        "toggle_sidebar" => if zh { "显示/隐藏侧边栏" } else { "Toggle Sidebar" },
        "zoom_in" => if zh { "放大" } else { "Zoom In" },
        "zoom_out" => if zh { "缩小" } else { "Zoom Out" },
        "actual_size" => if zh { "实际大小" } else { "Actual Size" },
        "theme" => if zh { "主题" } else { "Theme" },
        "theme_system" => if zh { "跟随系统" } else { "Follow System" },
        "theme_light" => if zh { "浅色" } else { "Light" },
        "theme_dark" => if zh { "深色" } else { "Dark" },
        "window" => if zh { "窗口" } else { "Window" },
        "minimize" => if zh { "最小化" } else { "Minimize" },
        "zoom" => if zh { "缩放" } else { "Zoom" },
        "no_recent_items" => if zh { "没有最近使用的项目" } else { "No Recent Items" },
        "folders" => if zh { "文件夹" } else { "Folders" },
        "files" => if zh { "文件" } else { "Files" },
        "clear_recent" => if zh { "清除最近打开的记录" } else { "Clear Recently Opened" },
        _ => key,
    }
}

fn current_language(app: &tauri::AppHandle) -> String {
    app.try_state::<AppState>()
        .map(|s| {
            s.menu_language
                .lock()
                .map(|guard| guard.clone())
                .unwrap_or_else(|_| "en".to_string())
        })
        .unwrap_or_else(|| "en".to_string())
}

fn current_preview_theme(app: &tauri::AppHandle) -> String {
    app.try_state::<AppState>()
        .map(|s| {
            s.preview_theme
                .lock()
                .map(|guard| guard.clone())
                .unwrap_or_else(|_| "system".to_string())
        })
        .unwrap_or_else(|| "system".to_string())
}

/// All available preview themes: (id, label, mode).
/// Kept in sync with `src/lib/themes/preview-themes.ts`.
fn theme_list() -> &'static [(&'static str, &'static str, &'static str)] {
    &[
        ("default", "Default", "light"),
        ("solarized-light", "Solarized Light", "light"),
        ("typo", "Typo", "light"),
        ("cobalt", "Cobalt", "dark"),
        ("solarized-dark", "Solarized Dark", "dark"),
        ("toothpaste", "Toothpaste", "dark"),
    ]
}

fn build_menu(app: &tauri::AppHandle) -> Result<tauri::menu::Menu<tauri::Wry>, tauri::Error> {
    let language = current_language(app);

    let settings = MenuItemBuilder::with_id("settings", menu_label(&language, "settings"))
        .accelerator("CmdOrCtrl+,")
        .build(app)?;

    let app_menu = SubmenuBuilder::new(app, menu_label(&language, "app_name"))
        .item(&PredefinedMenuItem::about(app, Some(menu_label(&language, "about")), None)?)
        .separator()
        .item(&settings)
        .separator()
        .item(&PredefinedMenuItem::services(app, Some(menu_label(&language, "services")))?)
        .separator()
        .item(&PredefinedMenuItem::hide(app, Some(menu_label(&language, "hide")))?)
        .item(&PredefinedMenuItem::hide_others(app, Some(menu_label(&language, "hide_others")))?)
        .item(&PredefinedMenuItem::show_all(app, Some(menu_label(&language, "show_all")))?)
        .separator()
        .item(&PredefinedMenuItem::quit(app, Some(menu_label(&language, "quit")))?)
        .build()?;

    let new_file = MenuItemBuilder::with_id("new_file", menu_label(&language, "new_file"))
        .accelerator("CmdOrCtrl+N")
        .build(app)?;

    let new_window = MenuItemBuilder::with_id("new_window", menu_label(&language, "new_window"))
        .accelerator("CmdOrCtrl+Shift+N")
        .build(app)?;

    let create_vault = MenuItemBuilder::with_id("create_vault", menu_label(&language, "create_directory"))
        .build(app)?;

    let open_vault = MenuItemBuilder::with_id("open_vault", menu_label(&language, "open_vault"))
        .accelerator("CmdOrCtrl+O")
        .build(app)?;

    let open_file = MenuItemBuilder::with_id("open_file", menu_label(&language, "open_file"))
        .accelerator("CmdOrCtrl+Shift+O")
        .build(app)?;

    let recent_entries = recent::load_recent();
    let mut recent_menu_builder = SubmenuBuilder::new(app, menu_label(&language, "open_recent"));

    if recent_entries.is_empty() {
        let no_recent = MenuItemBuilder::with_id("no_recent", menu_label(&language, "no_recent_items"))
            .enabled(false)
            .build(app)?;
        recent_menu_builder = recent_menu_builder.item(&no_recent);
    } else {
        let vaults: Vec<&recent::RecentEntry> = recent_entries.iter().filter(|e| e.kind == "vault").collect();
        let files: Vec<&recent::RecentEntry> = recent_entries.iter().filter(|e| e.kind == "file").collect();

        if !vaults.is_empty() {
            let folder_label = MenuItemBuilder::with_id("label_folders", menu_label(&language, "folders"))
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
            let file_label = MenuItemBuilder::with_id("label_files", menu_label(&language, "files"))
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
        let clear_recent = MenuItemBuilder::with_id("clear_recent", menu_label(&language, "clear_recent"))
            .build(app)?;
        recent_menu_builder = recent_menu_builder.item(&clear_recent);
    }

    let open_recent_menu = recent_menu_builder.build()?;

    let save = MenuItemBuilder::with_id("save", menu_label(&language, "save"))
        .accelerator("CmdOrCtrl+S")
        .build(app)?;

    let save_as = MenuItemBuilder::with_id("save_as", menu_label(&language, "save_as"))
        .accelerator("CmdOrCtrl+Shift+S")
        .build(app)?;

    let close_window = MenuItemBuilder::with_id("close_window", menu_label(&language, "close_window"))
        .accelerator("CmdOrCtrl+W")
        .build(app)?;

    let file_menu = SubmenuBuilder::new(app, menu_label(&language, "file"))
        .item(&new_file)
        .item(&new_window)
        .separator()
        .item(&create_vault)
        .item(&open_vault)
        .item(&open_file)
        .item(&open_recent_menu)
        .separator()
        .item(&save)
        .item(&save_as)
        .separator()
        .item(&close_window)
        .build()?;

    let find = MenuItemBuilder::with_id("find", menu_label(&language, "find"))
        .accelerator("CmdOrCtrl+F")
        .build(app)?;

    let edit_menu = SubmenuBuilder::new(app, menu_label(&language, "edit"))
        .item(&PredefinedMenuItem::undo(app, Some(menu_label(&language, "undo")))?)
        .item(&PredefinedMenuItem::redo(app, Some(menu_label(&language, "redo")))?)
        .separator()
        .item(&PredefinedMenuItem::cut(app, Some(menu_label(&language, "cut")))?)
        .item(&PredefinedMenuItem::copy(app, Some(menu_label(&language, "copy")))?)
        .item(&PredefinedMenuItem::paste(app, Some(menu_label(&language, "paste")))?)
        .separator()
        .item(&PredefinedMenuItem::select_all(app, Some(menu_label(&language, "select_all")))?)
        .separator()
        .item(&find)
        .build()?;

    let toggle_sidebar = MenuItemBuilder::with_id("toggle_sidebar", menu_label(&language, "toggle_sidebar"))
        .accelerator("CmdOrCtrl+\\")
        .build(app)?;

    let view_menu = SubmenuBuilder::new(app, menu_label(&language, "view"))
        .item(&PredefinedMenuItem::fullscreen(app, Some(menu_label(&language, "fullscreen")))?)
        .item(&toggle_sidebar)
        .separator()
        .item(
            &MenuItemBuilder::with_id("zoom_in", menu_label(&language, "zoom_in"))
                .accelerator("CmdOrCtrl+Plus")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("zoom_out", menu_label(&language, "zoom_out"))
                .accelerator("CmdOrCtrl+-")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("actual_size", menu_label(&language, "actual_size"))
                .accelerator("CmdOrCtrl+0")
                .build(app)?,
        )
        .build()?;

    let window_menu = SubmenuBuilder::new(app, menu_label(&language, "window"))
        .item(&PredefinedMenuItem::minimize(app, Some(menu_label(&language, "minimize")))?)
        .item(
            &MenuItemBuilder::with_id("zoom", menu_label(&language, "zoom"))
                .build(app)?,
        )
        .separator()
        .item(&PredefinedMenuItem::hide(app, Some(menu_label(&language, "hide")))?)
        .item(&PredefinedMenuItem::hide_others(app, Some(menu_label(&language, "hide_others")))?)
        .item(&PredefinedMenuItem::show_all(app, Some(menu_label(&language, "show_all")))?)
        .build()?;

    // Theme menu: System + all preview themes grouped into Light/Dark submenus.
    // The checked item follows the preview theme stored via `set_preview_theme`;
    // selecting an item emits an event so the frontend applies the theme and
    // echoes it back through `set_preview_theme`.
    let current_preview = current_preview_theme(app);

    let theme_system = CheckMenuItemBuilder::with_id("theme_system", menu_label(&language, "theme_system"))
        .checked(current_preview == "system")
        .build(app)?;

    let mut light_builder = SubmenuBuilder::new(app, menu_label(&language, "theme_light"));
    for (id, label, _mode) in theme_list().iter().filter(|(_, _, m)| *m == "light") {
        let item = CheckMenuItemBuilder::with_id(&format!("theme_preview_{}", id), label)
            .checked(current_preview == *id)
            .build(app)?;
        light_builder = light_builder.item(&item);
    }
    let light_submenu = light_builder.build()?;

    let mut dark_builder = SubmenuBuilder::new(app, menu_label(&language, "theme_dark"));
    for (id, label, _mode) in theme_list().iter().filter(|(_, _, m)| *m == "dark") {
        let item = CheckMenuItemBuilder::with_id(&format!("theme_preview_{}", id), label)
            .checked(current_preview == *id)
            .build(app)?;
        dark_builder = dark_builder.item(&item);
    }
    let dark_submenu = dark_builder.build()?;

    let theme_menu = SubmenuBuilder::new(app, menu_label(&language, "theme"))
        .item(&theme_system)
        .separator()
        .item(&light_submenu)
        .item(&dark_submenu)
        .build()?;

    MenuBuilder::new(app)
        .item(&app_menu)
        .item(&file_menu)
        .item(&edit_menu)
        .item(&view_menu)
        .item(&theme_menu)
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

/// Updates the native menu language (`"zh"` or `"en"`) and rebuilds the menu.
/// Called by the frontend after it resolves the UI language.
#[tauri::command]
fn set_language(app: tauri::AppHandle, state: State<'_, AppState>, language: String) {
    let mut current = state.menu_language.lock().unwrap();
    if *current != language {
        *current = language;
        drop(current);
        rebuild_menu(&app);
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
        rebuild_menu(&app);
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
        rebuild_menu(&app);
    }
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
        .title("")
        .inner_size(720.0, 680.0)
        .min_inner_size(500.0, 400.0);
        
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
            menu_language: Mutex::new("en".to_string()),
            theme: Mutex::new("system".to_string()),
            preview_theme: Mutex::new("system".to_string()),
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
                    let label = format!("window-{}", WINDOW_COUNT.fetch_add(1, Ordering::Relaxed));
                    #[allow(unused_mut)]
                    let mut builder = tauri::WebviewWindowBuilder::new(app, &label, tauri::WebviewUrl::App("index.html?untitled=1".into()))
                        .title("")
                        .inner_size(720.0, 680.0)
                        .min_inner_size(500.0, 400.0);
                    #[cfg(target_os = "macos")]
                    {
                        builder = builder.title_bar_style(TitleBarStyle::Overlay).hidden_title(true);
                    }
                    builder.build().ok();
                }
                "save" => {
                    app.emit("menu-save", ()).ok();
                }
                "save_as" => {
                    app.emit("menu-save-as", ()).ok();
                }
                "new_window" => {
                    let label = format!("window-{}", WINDOW_COUNT.fetch_add(1, Ordering::Relaxed));
                    #[allow(unused_mut)]
                    let mut builder = tauri::WebviewWindowBuilder::new(app, &label, tauri::WebviewUrl::App("index.html".into()))
                        .title("")
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
