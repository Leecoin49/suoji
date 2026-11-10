mod commands;
mod db;
mod i18n;
mod model;
mod schedule;
mod ui;

use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            commands::show_main(app);
        }))
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        commands::show_main(app);
                    }
                })
                .build(),
        )
        .setup(|app| {
            db::init(app.handle())?;

            // ---- Global hotkey: Ctrl+Alt+Space by default, editable in Settings ----
            let settings = {
                let state = app.state::<db::Db>();
                let guard = state.0.lock();
                match guard {
                    Ok(conn) => db::settings(&conn),
                    Err(_) => model::Settings::default(),
                }
            };
            let locale = settings.locale.clone();
            let labels = i18n::labels(&locale);

            let normalized = settings.hotkey.replace("Ctrl", "CommandOrControl");
            match normalized.parse::<Shortcut>() {
                Ok(sc) => {
                    if let Err(e) = app.global_shortcut().register(sc) {
                        eprintln!("[suoji] failed to register the global hotkey: {e}");
                    }
                }
                Err(e) => eprintln!("[suoji] invalid hotkey: {} ({e})", settings.hotkey),
            }

            // ---- Window title follows the saved locale ----
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_title(labels.app_title);
            }

            // ---- Tray ----
            let menu = ui::tray_menu(app.handle(), &locale)?;

            if let Some(icon) = app.default_window_icon().cloned() {
                TrayIconBuilder::with_id("main")
                    .icon(icon)
                    .tooltip(labels.app_title)
                    .menu(&menu)
                    .show_menu_on_left_click(false)
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "show" => commands::show_main(app),
                        "closeout" => {
                            commands::show_main(app);
                            let _ = app.emit("open-closeout", ());
                        }
                        "quit" => app.exit(0),
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            commands::show_main(tray.app_handle());
                        }
                    })
                    .build(app)?;
            }

            // ---- Start with Windows (follows the setting) ----
            {
                use tauri_plugin_autostart::ManagerExt;
                let al = app.autolaunch();
                let _ = if autostart_setting(app.handle()) { al.enable() } else { al.disable() };
            }

            schedule::spawn(app.handle().clone());
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the window parks it in the tray; the scheduler keeps running.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_day,
            commands::list_inbox,
            commands::list_project_tasks,
            commands::add_task,
            commands::set_done,
            commands::set_title,
            commands::set_note,
            commands::list_done_history,
            commands::push_to_tomorrow,
            commands::back_to_inbox,
            commands::move_to_date,
            commands::drop_task,
            commands::close_out,
            commands::get_settings,
            commands::save_settings,
            commands::set_locale,
            commands::show_window,
            commands::data_path,
            commands::get_stats,
            commands::list_classes,
            commands::save_project,
            commands::project_impact,
            commands::delete_project,
            commands::set_task_project,
            commands::save_tag,
            commands::delete_tag,
            commands::set_task_tags,
            commands::list_nodes,
            commands::save_node,
            commands::delete_node,
            commands::complete_node,
            commands::reopen_node,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Read the "start with Windows" flag; treat an unreadable setting as on.
fn autostart_setting(app: &tauri::AppHandle) -> bool {
    let state = app.state::<db::Db>();
    let guarded = state.0.lock();
    match guarded {
        Ok(conn) => db::settings(&conn).autostart,
        Err(_) => true,
    }
}
