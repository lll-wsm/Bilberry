use std::sync::Mutex;

mod commands;
mod export;
mod search;
mod vault;
mod wikilink;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .manage(commands::SearchState(Mutex::new(None)))
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
            export::export_html,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
