use rusqlite::Connection;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

pub struct Db(pub Mutex<Connection>);

/// Bumped whenever `migrate` has real work to do. `0` = the schema shipped before 005.
const SCHEMA_VERSION: i64 = 3;

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

/// 0 -> 1: projects, tags, and the links between a task and both of them.
const MIGRATION_1: &str = r#"
CREATE TABLE IF NOT EXISTS projects (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  archived   INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_projects_name ON projects(lower(trim(name)));

CREATE TABLE IF NOT EXISTS tags (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_tags_name ON tags(lower(trim(name)));

CREATE TABLE IF NOT EXISTS task_tags (
  task_id TEXT NOT NULL,
  tag_id  TEXT NOT NULL,
  PRIMARY KEY (task_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_task_tags_tag ON task_tags(tag_id);
"#;

/// 1 -> 2: the ordered steps inside a project (spec 006).
const MIGRATION_2: &str = r#"
CREATE TABLE IF NOT EXISTS nodes (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title      TEXT NOT NULL,
  note       TEXT,
  done       INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_nodes_project ON nodes(project_id, sort_order);
"#;

/// Applied in order; index `i` brings the schema to version `i + 1`.
const MIGRATIONS: &[&str] = &[MIGRATION_1, MIGRATION_2];

pub fn init(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let dir = app.path().app_data_dir()?;
    std::fs::create_dir_all(&dir)?;
    let path = dir.join("suoji.db");

    let conn = Connection::open(&path)?;
    conn.execute_batch(SCHEMA)?;
    migrate(&conn, &path)?;

    app.manage(Db(Mutex::new(conn)));
    Ok(())
}

/// Bring an older database up to `SCHEMA_VERSION` in one transaction.
///
/// Before touching anything we drop a copy next to the database, because this is the
/// user's only copy of their data (constitution II). If the transaction fails nothing
/// changes and the version stays where it was.
fn migrate(conn: &Connection, path: &std::path::Path) -> rusqlite::Result<()> {
    let current = schema_version(conn);
    if current >= SCHEMA_VERSION {
        return Ok(());
    }

    let backup = path.with_file_name("suoji.db.pre-005");
    if !backup.exists() {
        let _ = std::fs::copy(path, &backup);
    }

    conn.execute_batch("BEGIN IMMEDIATE")?;
    let result = (|| -> rusqlite::Result<()> {
        for (index, sql) in MIGRATIONS.iter().enumerate() {
            if current < (index as i64) + 1 {
                conn.execute_batch(sql)?;
            }
        }
        if !has_column(conn, "tasks", "project_id")? {
            conn.execute("ALTER TABLE tasks ADD COLUMN project_id TEXT", [])?;
        }
        if !has_column(conn, "tasks", "node_id")? {
            conn.execute("ALTER TABLE tasks ADD COLUMN node_id TEXT", [])?;
        }
        conn.execute_batch("CREATE INDEX IF NOT EXISTS idx_tasks_node ON tasks(node_id)")?;
        conn.execute(
            "INSERT INTO meta(key, value) VALUES('schema_version', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            rusqlite::params![SCHEMA_VERSION.to_string()],
        )?;
        Ok(())
    })();

    match result {
        Ok(()) => {
            conn.execute_batch("COMMIT")?;
            Ok(())
        }
        Err(e) => {
            let _ = conn.execute_batch("ROLLBACK");
            Err(e)
        }
    }
}

fn has_column(conn: &Connection, table: &str, column: &str) -> rusqlite::Result<bool> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let mut rows = stmt.query([])?;
    while let Some(row) = rows.next()? {
        let name: String = row.get(1)?;
        if name == column {
            return Ok(true);
        }
    }
    Ok(false)
}

pub fn schema_version(conn: &Connection) -> i64 {
    get_meta(conn, "schema_version").and_then(|v| v.parse().ok()).unwrap_or(0)
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
