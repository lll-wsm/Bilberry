use tauri::Manager;
use tauri::menu::{
    CheckMenuItemBuilder, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder,
};

use crate::recent;
use crate::{AppState, ThemeInfo};

/// Localized label for the native application menu. `language` is `"zh"` or
/// `"en"` (defaults to English for anything else).
pub(crate) fn menu_label<'a>(language: &str, key: &'a str) -> &'a str {
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

pub(crate) fn build_menu(app: &tauri::AppHandle) -> Result<tauri::menu::Menu<tauri::Wry>, tauri::Error> {
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
    // The list comes from the frontend via `set_theme_list` (single source of
    // truth: `src/lib/themes/preview-themes.ts`), so the menu always matches
    // the themes the app ships. The checked item follows the preview theme
    // stored via `set_preview_theme`; selecting an item emits an event so the
    // frontend applies the theme and echoes it back through `set_preview_theme`.
    let current_preview = current_preview_theme(app);

    let themes = app
        .try_state::<AppState>()
        .map(|s| s.theme_list.lock().map(|g| g.clone()).unwrap_or_default())
        .unwrap_or_default();

    let mut theme_menu_builder = SubmenuBuilder::new(app, menu_label(&language, "theme"))
        .item(
            &CheckMenuItemBuilder::with_id("theme_system", menu_label(&language, "theme_system"))
                .checked(current_preview == "system")
                .build(app)?,
        );

    let mut added_submenu = false;
    for mode in ["light", "dark"] {
        let entries: Vec<&ThemeInfo> = themes.iter().filter(|t| t.mode == mode).collect();
        if entries.is_empty() {
            continue;
        }
        let label_key = if mode == "light" { "theme_light" } else { "theme_dark" };
        let mut submenu = SubmenuBuilder::new(app, menu_label(&language, label_key));
        for t in entries {
            submenu = submenu.item(
                &CheckMenuItemBuilder::with_id(&format!("theme_preview_{}", t.id), &t.label)
                    .checked(current_preview == t.id)
                    .build(app)?,
            );
        }
        if !added_submenu {
            theme_menu_builder = theme_menu_builder.separator();
            added_submenu = true;
        }
        theme_menu_builder = theme_menu_builder.item(&submenu.build()?);
    }

    let theme_menu = theme_menu_builder.build()?;

    MenuBuilder::new(app)
        .item(&app_menu)
        .item(&file_menu)
        .item(&edit_menu)
        .item(&view_menu)
        .item(&theme_menu)
        .item(&window_menu)
        .build()
}

pub(crate) fn rebuild_menu(app: &tauri::AppHandle) {
    #[cfg(target_os = "macos")]
    if let Ok(menu) = build_menu(app) {
        app.set_menu(menu).ok();
    }
}
