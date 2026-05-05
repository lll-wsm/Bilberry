use std::sync::Mutex;
use std::sync::atomic::{AtomicU32, Ordering};
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder, PredefinedMenuItem};
use tauri::{Emitter, TitleBarStyle};

static WINDOW_COUNT: AtomicU32 = AtomicU32::new(1);

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
        for (i, entry) in recent_entries.iter().enumerate() {
            let name = entry.path.split('/').last().unwrap_or(&entry.path);
            let icon = if entry.kind == "vault" { "(D)" } else { "(F)" };
            let item = MenuItemBuilder::with_id(
                &format!("open_recent_{}", i),
                &format!("{}  {}", name, icon),
            )
            .build(app)?;
            recent_menu_builder = recent_menu_builder.item(&item);
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
        .item(&open_vault)
        .item(&open_recent_menu)
        .separator()
        .item(&close_window)
        .build()?;

    MenuBuilder::new(app)
        .item(&app_menu)
        .item(&file_menu)
        .build()
}

fn rebuild_menu(app: &tauri::AppHandle) {
    if let Ok(menu) = build_menu(app) {
        app.set_menu(menu).ok();
    }
}

#[tauri::command]
fn refresh_menu(app: tauri::AppHandle) {
    rebuild_menu(&app);
}

#[derive(Clone, serde::Serialize)]
struct RecentPayload {
    path: String,
    kind: String,
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .manage(commands::SearchState(Mutex::new(None)))
        .menu(|app| build_menu(app))
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            match id {
                "settings" => {
                    app.emit("menu-show-settings", ()).ok();
                }
                "open_vault" => {
                    app.emit("menu-open-vault", ()).ok();
                }
                "new_window" => {
                    let label = format!("window-{}", WINDOW_COUNT.fetch_add(1, Ordering::Relaxed));
                    tauri::WebviewWindowBuilder::new(app, &label, tauri::WebviewUrl::App("index.html".into()))
                        .title("Bilberry")
                        .inner_size(1200.0, 800.0)
                        .min_inner_size(800.0, 600.0)
                        .title_bar_style(TitleBarStyle::Overlay)
                        .hidden_title(true)
                        .build()
                        .ok();
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
