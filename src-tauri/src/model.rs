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
    /// Which project it belongs to; `None` means 未分类.
    #[serde(default)]
    pub project_id: Option<String>,
    /// Tags attached to it, filled in by the caller (empty when not loaded).
    #[serde(default)]
    pub tag_ids: Vec<String>,
}

/// A bucket of related work. One level deep on purpose (see spec 005 D1).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub archived: bool,
    pub created_at: String,
    pub updated_at: String,
}

/// A free-form label; several may sit on one task.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Tag {
    pub id: String,
    pub name: String,
    pub created_at: String,
}

/// Both dictionaries in one round trip — a picker always shows the two columns.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Classes {
    pub projects: Vec<Project>,
    pub tags: Vec<Tag>,
}

/// Create (empty id) or update a project.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInput {
    pub id: Option<String>,
    pub name: String,
    pub archived: Option<bool>,
}

/// What deleting a project would touch — shown before the user confirms.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectImpact {
    pub tasks: i64,
    pub nodes: i64,
}

/// One step in a project's chain (spec 006).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Node {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub note: Option<String>,
    pub done: bool,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
}

impl Node {
    pub fn from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Self> {
        Ok(Node {
            id: row.get("id")?,
            project_id: row.get("project_id")?,
            title: row.get("title")?,
            note: row.get("note")?,
            done: row.get::<_, i64>("done")? != 0,
            sort_order: row.get("sort_order")?,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    }
}

/// Create (no id) or edit one step; `position` moves it in the chain.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeInput {
    pub id: Option<String>,
    pub project_id: String,
    pub title: String,
    pub note: Option<String>,
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
            project_id: row.get("project_id").unwrap_or(None),
            tag_ids: Vec::new(),
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

/// The interval the review panel is looking at.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatsSpan {
    pub start: String,
    pub end: String,
    pub days: i64,
}

/// One finished thing inside the interval (read-only).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DoneEntry {
    pub id: String,
    pub title: String,
    pub note: Option<String>,
    /// Kept exactly as stored: local time, no timezone suffix.
    pub done_at: String,
    /// Current home of the task (no historical snapshot — see data-model C-… D-1).
    #[serde(default)]
    pub project_id: Option<String>,
    #[serde(default)]
    pub tag_ids: Vec<String>,
}

/// A thing that kept getting pushed back.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RollEntry {
    pub id: String,
    pub title: String,
    /// Cumulative, may include pushes from before the interval.
    pub roll_count: i64,
    /// Plain date (YYYY-MM-DD), not a timestamp.
    pub last_rolled_at: String,
}

/// Everything the review panel needs, in one read-only round trip.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatsRaw {
    pub span: StatsSpan,
    pub prev: StatsSpan,
    pub done: Vec<DoneEntry>,
    pub prev_done: i64,
    pub rolled: Vec<RollEntry>,
    pub backlog: i64,
    pub undated: i64,
    pub clamped: bool,
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
