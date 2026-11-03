use serde::{Deserialize, Serialize};

/// One small thing to remember.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub title: String,
    pub note: Option<String>,
    /// "today" | "inbox"
    pub bucket: String,
    /// Which day this is planned for (YYYY-MM-DD)
    pub plan_date: Option<String>,
    /// First day it landed on "today"; used to age a task
    pub first_seen_date: Option<String>,
    /// Optional clock time, HH:MM
    pub due_at: Option<String>,
    pub done: bool,
    pub done_at: Option<String>,
    /// How many times it has been pushed back
    pub roll_count: i64,
    pub last_rolled_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

impl Task {
    pub fn from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Self> {
        Ok(Task {
            id: row.get("id")?,
            title: row.get("title")?,
            note: row.get("note")?,
            bucket: row.get("bucket")?,
            plan_date: row.get("plan_date")?,
            first_seen_date: row.get("first_seen_date")?,
            due_at: row.get("due_at")?,
            done: row.get::<_, i64>("done")? != 0,
            done_at: row.get("done_at")?,
            roll_count: row.get("roll_count")?,
            last_rolled_at: row.get("last_rolled_at")?,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    }
}

/// Everything the "today" screen needs.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DayView {
    pub date: String,
    /// Still open today
    pub tasks: Vec<Task>,
    /// Finished today
    pub done_today: Vec<Task>,
    /// Longest-sitting inbox items offered as suggestions
    pub suggestions: Vec<Task>,
    /// Open items sitting in the inbox
    pub inbox_count: i64,
    /// Whether today has already been closed out
    pub closed_out: bool,
    /// The line left for today when yesterday was closed out
    pub yesterday_note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub morning_time: String,
    pub evening_time: String,
    pub hotkey: String,
    pub autostart: bool,
    /// "zh" | "en"
    pub locale: String,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            morning_time: "09:00".into(),
            evening_time: "18:30".into(),
            hotkey: "Ctrl+Alt+Space".into(),
            autostart: true,
            locale: "zh".into(),
        }
    }
}
