use rusqlite::Connection;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

pub struct Db(pub Mutex<Connection>);

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS tasks (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  note            TEXT,
  bucket          TEXT NOT NULL DEFAULT 'inbox',
  plan_date       TEXT,
  first_seen_date TEXT,
  due_at          TEXT,
  done            INTEGER NOT NULL DEFAULT 0,
  done_at         TEXT,
  roll_count      INTEGER NOT NULL DEFAULT 0,
  last_rolled_at  TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  deleted         INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_day   ON tasks(bucket, done, plan_date);
CREATE INDEX IF NOT EXISTS idx_tasks_done  ON tasks(done, done_at);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS day_notes (
  date       TEXT PRIMARY KEY,
  note       TEXT NOT NULL,
  created_at TEXT NOT NULL
);
"#;

pub fn init(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let dir = app.path().app_data_dir()?;
    std::fs::create_dir_all(&dir)?;
    let path = dir.join("suoji.db");

    let conn = Connection::open(&path)?;
    conn.execute_batch(SCHEMA)?;

    app.manage(Db(Mutex::new(conn)));
    Ok(())
}

pub fn get_meta(conn: &Connection, key: &str) -> Option<String> {
    conn.query_row("SELECT value FROM meta WHERE key = ?1", rusqlite::params![key], |r| r.get::<_, String>(0)).ok()
}

pub fn set_meta(conn: &Connection, key: &str, value: &str) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO meta(key, value) VALUES(?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        rusqlite::params![key, value],
    )?;
    Ok(())
}

pub fn settings(conn: &Connection) -> crate::model::Settings {
    let d = crate::model::Settings::default();
    crate::model::Settings {
        morning_time: get_meta(conn, "morning_time").unwrap_or(d.morning_time),
        evening_time: get_meta(conn, "evening_time").unwrap_or(d.evening_time),
        hotkey: get_meta(conn, "hotkey").unwrap_or(d.hotkey),
        autostart: get_meta(conn, "autostart").map(|v| v == "1").unwrap_or(d.autostart),
        locale: get_meta(conn, "locale").unwrap_or(d.locale),
    }
}
