//! Locale plumbing for native surfaces: window title, tray tooltip and menu.

use tauri::menu::{Menu, MenuItem};
use tauri::{AppHandle, Manager, Wry};

use crate::i18n::labels;

/// Tray menu for a given locale.
pub fn tray_menu(app: &AppHandle, locale: &str) -> tauri::Result<Menu<Wry>> {
    let l = labels(locale);
    let show = MenuItem::with_id(app, "show", l.tray_open, true, None::<&str>)?;
    let closeout = MenuItem::with_id(app, "closeout", l.tray_closeout, true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", l.tray_quit, true, None::<&str>)?;
    Menu::with_items(app, &[&show, &closeout, &quit])
}

/// Re-apply a locale to every native surface. Safe to call at any time.
pub fn apply_locale(app: &AppHandle, locale: &str) {
    let l = labels(locale);
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_title(l.app_title);
    }
    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_tooltip(Some(l.app_title));
        if let Ok(menu) = tray_menu(app, locale) {
            let _ = tray.set_menu(Some(menu));
        }
    }
}
