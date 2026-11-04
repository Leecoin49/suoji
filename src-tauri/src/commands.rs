use crate::db::{get_meta, set_meta, Db};
use crate::model::{DayView, Settings, Task};
use chrono::{Duration, Local, NaiveDate};
use rusqlite::{params, Connection, OptionalExtension};
use tauri::{Manager, State};
use uuid::Uuid;

const SELECT: &str = "SELECT id, title, note, bucket, plan_date, first_seen_date, due_at, done, done_at, \
     roll_count, last_rolled_at, created_at, updated_at FROM tasks";

fn today() -> String {
    Local::now().format("%Y-%m-%d").to_string()
}

fn now_iso() -> String {
    Local::now().format("%Y-%m-%dT%H:%M:%S").to_string()
}

fn tomorrow() -> String {
    (Local::now().naive_local().date() + Duration::days(1)).format("%Y-%m-%d").to_string()
}

fn load(conn: &Connection, id: &str) -> rusqlite::Result<Task> {
    conn.query_row(&format!("{SELECT} WHERE id = ?1"), params![id], Task::from_row)
}

/// Roll anything unfinished from yesterday (or earlier) onto today.
pub fn rollover(conn: &Connection, day: &str) -> rusqlite::Result<usize> {
    conn.execute(
        "UPDATE tasks SET
            first_seen_date = COALESCE(first_seen_date, plan_date),
            plan_date       = ?1,
            roll_count      = roll_count + 1,
            last_rolled_at  = ?1,
            updated_at      = ?2
         WHERE done = 0 AND deleted = 0 AND bucket = 'today'
           AND (plan_date IS NULL OR plan_date < ?1)",
        params![day, now_iso()],
    )
}

/// Today's list + today's suggestions + inbox count.
pub fn build_day(conn: &Connection) -> rusqlite::Result<DayView> {
    let day = today();
    rollover(conn, &day)?;

    let mut stmt = conn.prepare(&format!(
        "{SELECT} WHERE done = 0 AND deleted = 0 AND bucket = 'today' AND plan_date <= ?1 \
         ORDER BY (due_at IS NULL), due_at, created_at"
    ))?;
    let tasks: Vec<Task> = stmt.query_map(params![day], Task::from_row)?.collect::<rusqlite::Result<_>>()?;

    let mut stmt = conn.prepare(
        "SELECT id, title, note, bucket, plan_date, first_seen_date, due_at, done, done_at, \
         roll_count, last_rolled_at, created_at, updated_at FROM tasks \
         WHERE done = 1 AND deleted = 0 AND done_at LIKE ?1 ORDER BY done_at DESC",
    )?;
    let done_today: Vec<Task> =
        stmt.query_map(params![format!("{day}%")], Task::from_row)?.collect::<rusqlite::Result<_>>()?;

    let mut stmt = conn.prepare(
        "SELECT id, title, note, bucket, plan_date, first_seen_date, due_at, done, done_at, \
         roll_count, last_rolled_at, created_at, updated_at FROM tasks \
         WHERE done = 0 AND deleted = 0 AND bucket = 'inbox' \
         ORDER BY updated_at ASC LIMIT 3",
    )?;
    let suggestions: Vec<Task> = stmt.query_map([], Task::from_row)?.collect::<rusqlite::Result<_>>()?;

    let inbox_count: i64 =
        conn.query_row("SELECT COUNT(*) FROM tasks WHERE done = 0 AND deleted = 0 AND bucket = 'inbox'", [], |r| {
            r.get(0)
        })?;

    let closed_out = get_meta(conn, "closed_out_date").as_deref() == Some(day.as_str());

    // The line yesterday's close-out left for today.
    let yesterday_note: Option<String> = conn
        .query_row("SELECT note FROM day_notes WHERE date < ?1 ORDER BY date DESC LIMIT 1", params![day], |r| r.get(0))
        .ok();

    Ok(DayView { date: day, tasks, done_today, suggestions, inbox_count, closed_out, yesterday_note })
}

// ---------------------------------------------------------------- commands

#[tauri::command]
pub fn get_day(db: State<Db>) -> Result<DayView, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    build_day(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_inbox(db: State<Db>) -> Result<Vec<Task>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(&format!("{SELECT} WHERE done = 0 AND deleted = 0 AND bucket = 'inbox' ORDER BY created_at DESC"))
        .map_err(|e| e.to_string())?;
    let rows: Vec<Task> = stmt
        .query_map([], Task::from_row)
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<_>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

/// target: "today" | "inbox" | "YYYY-MM-DD"
#[tauri::command]
pub fn add_task(db: State<Db>, title: String, target: Option<String>, due_at: Option<String>) -> Result<Task, String> {
    let title = title.trim().to_string();
    if title.is_empty() {
        return Err("a task needs a title".into());
    }
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let day = today();
    let target = target.unwrap_or_else(|| "inbox".into());

    let (bucket, plan_date, first_seen) = if target == "inbox" {
        ("inbox".to_string(), None, None)
    } else if target == "today" {
        ("today".to_string(), Some(day.clone()), Some(day.clone()))
    } else {
        // An explicit date: land on that day when it parses, otherwise fall back to today.
        match NaiveDate::parse_from_str(&target, "%Y-%m-%d") {
            Ok(d) => {
                let s = d.format("%Y-%m-%d").to_string();
                ("today".to_string(), Some(s.clone()), Some(s))
            }
            Err(_) => ("today".to_string(), Some(day.clone()), Some(day.clone())),
        }
    };

    let id = Uuid::new_v4().to_string();
    let now = now_iso();
    conn.execute(
        "INSERT INTO tasks(id, title, note, bucket, plan_date, first_seen_date, due_at, done, \
         done_at, roll_count, last_rolled_at, sort_order, deleted, created_at, updated_at) \
         VALUES(?1, ?2, NULL, ?3, ?4, ?5, ?6, 0, NULL, 0, NULL, 0, 0, ?7, ?7)",
        params![id, title, bucket, plan_date, first_seen, due_at, now],
    )
    .map_err(|e| e.to_string())?;

    load(&conn, &id).map_err(|e| e.to_string())
}

/// Tasks finished within the last `days` days, newest first — used by the records sheet.
#[tauri::command]
pub fn list_done_history(db: State<Db>, days: i64) -> Result<Vec<Task>, String> {
    let span = if days <= 0 { 30 } else { days.min(365) };
    let since = (Local::now().naive_local().date() - Duration::days(span)).format("%Y-%m-%dT00:00:00").to_string();
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(&format!(
            "{SELECT} WHERE done = 1 AND deleted = 0 AND done_at IS NOT NULL \
             AND done_at >= ?1 ORDER BY done_at DESC"
        ))
        .map_err(|e| e.to_string())?;
    let rows: Vec<Task> = stmt
        .query_map(params![since], Task::from_row)
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<_>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

#[tauri::command]
pub fn set_done(db: State<Db>, id: String, done: bool, note: Option<String>) -> Result<Task, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let done_at = if done { Some(now_iso()) } else { None };
    conn.execute(
        "UPDATE tasks SET done = ?2, done_at = ?3, updated_at = ?4, \
         note = COALESCE(?5, note) WHERE id = ?1",
        params![id, done as i64, done_at, now_iso(), note],
    )
    .map_err(|e| e.to_string())?;
    load(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_note(db: State<Db>, id: String, note: Option<String>) -> Result<Task, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("UPDATE tasks SET note = ?2, updated_at = ?3 WHERE id = ?1", params![id, note, now_iso()])
        .map_err(|e| e.to_string())?;
    load(&conn, &id).map_err(|e| e.to_string())
}

/// Push to tomorrow (bumps the roll counter).
#[tauri::command]
pub fn push_to_tomorrow(db: State<Db>, id: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE tasks SET plan_date = ?2, roll_count = roll_count + 1, \
         last_rolled_at = ?3, updated_at = ?4, bucket = 'today' WHERE id = ?1",
        params![id, tomorrow(), today(), now_iso()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Send back to the inbox — this does not count as procrastinating.
#[tauri::command]
pub fn back_to_inbox(db: State<Db>, id: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE tasks SET bucket = 'inbox', plan_date = NULL, first_seen_date = NULL, \
         updated_at = ?2 WHERE id = ?1",
        params![id, now_iso()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Plan it for a specific day.
#[tauri::command]
pub fn move_to_date(db: State<Db>, id: String, date: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let d = NaiveDate::parse_from_str(&date, "%Y-%m-%d").map_err(|_| "invalid date".to_string())?;
    let s = d.format("%Y-%m-%d").to_string();
    let bumped = s.as_str() > today().as_str();
    conn.execute(
        "UPDATE tasks SET bucket = 'today', plan_date = ?2, updated_at = ?3, \
         first_seen_date = COALESCE(first_seen_date, ?2), \
         roll_count = roll_count + ?4 WHERE id = ?1",
        params![id, s, now_iso(), if bumped { 1 } else { 0 }],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Not doing it.
#[tauri::command]
pub fn drop_task(db: State<Db>, id: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("UPDATE tasks SET deleted = 1, updated_at = ?2 WHERE id = ?1", params![id, now_iso()])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Close the day: optionally roll everything left to tomorrow and keep the note for tomorrow.
#[tauri::command]
pub fn close_out(db: State<Db>, push_all: bool, note: Option<String>) -> Result<DayView, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let day = today();
    if push_all {
        conn.execute(
            "UPDATE tasks SET plan_date = ?2, roll_count = roll_count + 1, \
             last_rolled_at = ?1, updated_at = ?3 \
             WHERE done = 0 AND deleted = 0 AND bucket = 'today' AND plan_date <= ?1",
            params![day, tomorrow(), now_iso()],
        )
        .map_err(|e| e.to_string())?;
    }

    if let Some(n) = note.map(|v| v.trim().to_string()).filter(|v| !v.is_empty()) {
        conn.execute(
            "INSERT INTO day_notes(date, note, created_at) VALUES(?1, ?2, ?3) \
             ON CONFLICT(date) DO UPDATE SET note = excluded.note, created_at = excluded.created_at",
            params![day, n, now_iso()],
        )
        .map_err(|e| e.to_string())?;
    }

    set_meta(&conn, "closed_out_date", &day).map_err(|e| e.to_string())?;
    build_day(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_settings(db: State<Db>) -> Result<Settings, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    Ok(crate::db::settings(&conn))
}

#[tauri::command]
pub fn save_settings(app: tauri::AppHandle, db: State<Db>, settings: Settings) -> Result<Settings, String> {
    {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        set_meta(&conn, "morning_time", &settings.morning_time).map_err(|e| e.to_string())?;
        set_meta(&conn, "evening_time", &settings.evening_time).map_err(|e| e.to_string())?;
        set_meta(&conn, "hotkey", &settings.hotkey).map_err(|e| e.to_string())?;
        set_meta(&conn, "autostart", if settings.autostart { "1" } else { "0" }).map_err(|e| e.to_string())?;
        set_meta(&conn, "locale", &settings.locale).map_err(|e| e.to_string())?;
    }

    // Start with Windows
    use tauri_plugin_autostart::ManagerExt;
    let al = app.autolaunch();
    let _ = if settings.autostart { al.enable() } else { al.disable() };

    // A new hotkey takes effect immediately.
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();
    let normalized = settings.hotkey.replace("Ctrl", "CommandOrControl");
    if let Ok(sc) = normalized.parse::<Shortcut>() {
        let _ = gs.register(sc);
    }

    crate::ui::apply_locale(&app, &settings.locale);

    Ok(settings)
}

/// Switch the interface language right away (window title, tray, notifications).
#[tauri::command]
pub fn set_locale(app: tauri::AppHandle, db: State<Db>, locale: String) -> Result<Settings, String> {
    let locale = if locale == "en" { "en" } else { "zh" };
    {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        set_meta(&conn, "locale", locale).map_err(|e| e.to_string())?;
    }
    crate::ui::apply_locale(&app, locale);
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    Ok(crate::db::settings(&conn))
}

/// Bring the window up on request (tray click, hotkey, second instance).
#[tauri::command]
pub fn show_window(app: tauri::AppHandle) {
    show_main(&app);
}

pub fn show_main(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

/// Absolute path of the database file, shown in the help page.
#[tauri::command]
pub fn data_path(app: tauri::AppHandle) -> String {
    app.path().app_data_dir().map(|dir| dir.join("suoji.db").to_string_lossy().to_string()).unwrap_or_default()
}

/// Count today's open tasks (kept for completeness).
#[allow(dead_code)]
pub fn count_today(conn: &Connection) -> rusqlite::Result<i64> {
    conn.query_row("SELECT COUNT(*) FROM tasks WHERE done = 0 AND deleted = 0 AND bucket = 'today'", [], |r| r.get(0))
        .optional()
        .map(|v| v.unwrap_or(0))
}
