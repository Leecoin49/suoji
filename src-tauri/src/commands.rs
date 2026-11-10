use crate::db::{get_meta, set_meta, Db};
use crate::model::{
    Classes, DayView, DoneEntry, Node, NodeInput, Project, ProjectImpact, ProjectInput, Recurrence, RecurrenceInput,
    RollEntry, Settings, StatsRaw, StatsSpan, Tag, Task,
};
use chrono::{Datelike, Duration, Local, NaiveDate, NaiveDateTime};
use rusqlite::{params, Connection, OptionalExtension};
use std::collections::HashMap;
use tauri::{Manager, State};
use uuid::Uuid;

const SELECT: &str = "SELECT id, title, note, bucket, plan_date, first_seen_date, due_at, done, done_at, \
     roll_count, last_rolled_at, created_at, updated_at, project_id, node_id, recurrence_id, \
     occurrence_date, deadline FROM tasks";

fn today() -> String {
    Local::now().format("%Y-%m-%d").to_string()
}

fn now_iso() -> String {
    Local::now().format("%Y-%m-%dT%H:%M:%S").to_string()
}

fn tomorrow() -> String {
    (Local::now().naive_local().date() + Duration::days(1)).format("%Y-%m-%d").to_string()
}

const INVALID_RANGE: &str = "stats: invalid range";
const TASK_TITLE_MAX: usize = 200;

fn load(conn: &Connection, id: &str) -> rusqlite::Result<Task> {
    let mut task = conn.query_row(&format!("{SELECT} WHERE id = ?1"), params![id], Task::from_row)?;
    attach_tags(conn, std::slice::from_mut(&mut task))?;
    Ok(task)
}

/// All tag links, keyed by task. One query beats N+1 on a local database.
fn tag_map(conn: &Connection) -> rusqlite::Result<HashMap<String, Vec<String>>> {
    let mut stmt = conn.prepare("SELECT task_id, tag_id FROM task_tags ORDER BY tag_id ASC")?;
    let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
    let mut map: HashMap<String, Vec<String>> = HashMap::new();
    for row in rows {
        let (task_id, tag_id) = row?;
        map.entry(task_id).or_default().push(tag_id);
    }
    Ok(map)
}

fn attach_tags(conn: &Connection, tasks: &mut [Task]) -> rusqlite::Result<()> {
    if tasks.is_empty() {
        return Ok(());
    }
    let map = tag_map(conn)?;
    for task in tasks.iter_mut() {
        if let Some(ids) = map.get(&task.id) {
            task.tag_ids = ids.clone();
        }
    }
    Ok(())
}

/// Roll anything unfinished from yesterday (or earlier) onto today.
pub fn rollover(conn: &Connection, day: &str) -> rusqlite::Result<usize> {
    // A repeating task does not owe yesterday's run: that one is spent. Marking it
    // before the roll keeps it out of today's list and out of the roll counter.
    expire_stale(conn, day)?;
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

/// Yesterday's unfinished runs of a rule are simply gone — one missed day does not
/// pile up as debt (spec 008 US2).
fn expire_stale(conn: &Connection, day: &str) -> rusqlite::Result<usize> {
    conn.execute(
        "UPDATE tasks SET bucket = 'expired', updated_at = ?2
         WHERE done = 0 AND deleted = 0 AND bucket = 'today'
           AND recurrence_id IS NOT NULL
           AND occurrence_date IS NOT NULL AND occurrence_date < ?1",
        params![day, now_iso()],
    )
}

/// "2026-11-10" -> 2026-11-10
fn parse_day(day: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(day, "%Y-%m-%d").ok()
}

/// Does this rule fire on `date`? Weekly days are numbered 1 = Monday … 7 = Sunday.
fn fires_on(rule: &Recurrence, date: NaiveDate) -> bool {
    match rule.kind.as_str() {
        "daily" => true,
        "weekly" => {
            let wd = date.weekday().number_from_monday() as i64;
            rule.days.contains(&wd)
        }
        "monthly" => {
            let want = rule.month_day.unwrap_or(1);
            let today = date.day() as i64;
            // "The 31st" has to mean the last day of a short month, not "skip February".
            let last = last_day_of_month(date);
            today == want.min(last)
        }
        _ => false,
    }
}

fn last_day_of_month(date: NaiveDate) -> i64 {
    let (year, month) = (date.year(), date.month());
    let (next_year, next_month) = if month == 12 { (year + 1, 1) } else { (year, month + 1) };
    match NaiveDate::from_ymd_opt(next_year, next_month, 1) {
        Some(first_of_next) => (first_of_next - Duration::days(1)).day() as i64,
        None => 28,
    }
}

/// Spawn today's run of every matching rule. Safe to call any number of times:
/// the unique index on (recurrence_id, occurrence_date) makes a second insert a no-op.
pub fn materialize(conn: &Connection, day: &str) -> rusqlite::Result<usize> {
    let Some(date) = parse_day(day) else { return Ok(0) };
    let mut stmt = conn.prepare(
        "SELECT id, title, project_id, node_id, kind, days, month_day, archived, created_at, updated_at \
         FROM recurrences WHERE archived = 0 ORDER BY created_at ASC",
    )?;
    let rules: Vec<Recurrence> = stmt.query_map([], Recurrence::from_row)?.collect::<rusqlite::Result<_>>()?;
    drop(stmt);

    let now = now_iso();
    let mut made = 0;
    for rule in rules {
        if !fires_on(&rule, date) {
            continue;
        }
        // A rule may outlive the project it was filed under; keep the task, drop the link.
        let project_id: Option<String> = rule.project_id.filter(|pid| {
            conn.query_row("SELECT 1 FROM projects WHERE id = ?1", params![pid], |r| r.get::<_, i64>(0))
                .optional()
                .map(|found| found.is_some())
                .unwrap_or(false)
        });
        let node_id: Option<String> = rule.node_id.filter(|nid| {
            conn.query_row("SELECT 1 FROM nodes WHERE id = ?1", params![nid], |r| r.get::<_, i64>(0))
                .optional()
                .map(|found| found.is_some())
                .unwrap_or(false)
        });
        let changed = conn.execute(
            "INSERT INTO tasks(id, title, note, bucket, plan_date, first_seen_date, due_at, done, \
             done_at, roll_count, last_rolled_at, sort_order, deleted, created_at, updated_at, \
             project_id, node_id, recurrence_id, occurrence_date) \
             VALUES(?1, ?2, NULL, 'today', ?3, ?3, NULL, 0, NULL, 0, NULL, 0, 0, ?4, ?4, ?5, ?6, ?7, ?3) \
             ON CONFLICT DO NOTHING",
            params![Uuid::new_v4().to_string(), rule.title, day, now, project_id, node_id, rule.id],
        )?;
        made += changed;
    }
    Ok(made)
}

/// Today's list + today's suggestions + inbox count.
pub fn build_day(conn: &Connection) -> rusqlite::Result<DayView> {
    let day = today();
    materialize(conn, &day)?;
    rollover(conn, &day)?;

    let mut stmt = conn.prepare(&format!(
        "{SELECT} WHERE done = 0 AND deleted = 0 AND bucket = 'today' AND plan_date <= ?1 \
         ORDER BY (due_at IS NULL), due_at, created_at"
    ))?;
    let mut tasks: Vec<Task> = stmt.query_map(params![day], Task::from_row)?.collect::<rusqlite::Result<_>>()?;

    let mut stmt = conn.prepare(
        "SELECT id, title, note, bucket, plan_date, first_seen_date, due_at, done, done_at, \
         roll_count, last_rolled_at, created_at, updated_at, project_id, node_id, recurrence_id, \
         occurrence_date, deadline FROM tasks \
         WHERE done = 1 AND deleted = 0 AND done_at LIKE ?1 ORDER BY done_at DESC",
    )?;
    let mut done_today: Vec<Task> =
        stmt.query_map(params![format!("{day}%")], Task::from_row)?.collect::<rusqlite::Result<_>>()?;

    let mut stmt = conn.prepare(
        "SELECT id, title, note, bucket, plan_date, first_seen_date, due_at, done, done_at, \
         roll_count, last_rolled_at, created_at, updated_at, project_id, node_id, recurrence_id, \
         occurrence_date, deadline FROM tasks \
         WHERE done = 0 AND deleted = 0 AND bucket = 'inbox' \
         ORDER BY updated_at ASC LIMIT 3",
    )?;
    let mut suggestions: Vec<Task> = stmt.query_map([], Task::from_row)?.collect::<rusqlite::Result<_>>()?;

    let inbox_count: i64 =
        conn.query_row("SELECT COUNT(*) FROM tasks WHERE done = 0 AND deleted = 0 AND bucket = 'inbox'", [], |r| {
            r.get(0)
        })?;

    let closed_out = get_meta(conn, "closed_out_date").as_deref() == Some(day.as_str());

    // The line yesterday's close-out left for today.
    let yesterday_note: Option<String> = conn
        .query_row("SELECT note FROM day_notes WHERE date < ?1 ORDER BY date DESC LIMIT 1", params![day], |r| r.get(0))
        .ok();

    attach_tags(conn, &mut tasks)?;
    attach_tags(conn, &mut done_today)?;
    attach_tags(conn, &mut suggestions)?;

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
    let mut rows: Vec<Task> = stmt
        .query_map([], Task::from_row)
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<_>>()
        .map_err(|e| e.to_string())?;
    attach_tags(&conn, &mut rows).map_err(|e| e.to_string())?;
    Ok(rows)
}

/// Everything filed under one project, undone first, then by the day it sits on.
#[tauri::command]
pub fn list_project_tasks(db: State<Db>, project_id: String) -> Result<Vec<Task>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(&format!(
            "{SELECT} WHERE deleted = 0 AND project_id = ?1 \
             ORDER BY done ASC, COALESCE(plan_date, '9999-12-31') ASC, sort_order ASC, created_at ASC"
        ))
        .map_err(|e| e.to_string())?;
    let mut rows: Vec<Task> = stmt
        .query_map(params![project_id], Task::from_row)
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<_>>()
        .map_err(|e| e.to_string())?;
    attach_tags(&conn, &mut rows).map_err(|e| e.to_string())?;
    Ok(rows)
}

/// target: "today" | "inbox" | "YYYY-MM-DD"
#[tauri::command]
pub fn add_task(
    db: State<Db>,
    title: String,
    target: Option<String>,
    due_at: Option<String>,
    project_id: Option<String>,
) -> Result<Task, String> {
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
    // Picking the project before typing is the one-shot path; it must not fail the
    // capture when the project vanished in the meantime — the task simply lands
    // unclassified.
    let project_id = project_id.filter(|v| !v.is_empty()).filter(|pid| {
        conn.query_row("SELECT 1 FROM projects WHERE id = ?1", params![pid], |r| r.get::<_, i64>(0))
            .optional()
            .map(|found| found.is_some())
            .unwrap_or(false)
    });
    conn.execute(
        "INSERT INTO tasks(id, title, note, bucket, plan_date, first_seen_date, due_at, done, \
         done_at, roll_count, last_rolled_at, sort_order, deleted, created_at, updated_at, project_id) \
         VALUES(?1, ?2, NULL, ?3, ?4, ?5, ?6, 0, NULL, 0, NULL, 0, 0, ?7, ?7, ?8)",
        params![id, title, bucket, plan_date, first_seen, due_at, now, project_id],
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
    let mut rows: Vec<Task> = stmt
        .query_map(params![since], Task::from_row)
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<_>>()
        .map_err(|e| e.to_string())?;
    attach_tags(&conn, &mut rows).map_err(|e| e.to_string())?;
    Ok(rows)
}

/// Read-only review of `[start, end]`: what got done, what kept slipping.
/// Five SELECTs, no transaction, no writes — see `contracts/ipc-get-stats.md` §5.
#[tauri::command]
pub fn get_stats(db: State<Db>, start: String, end: String) -> Result<StatsRaw, String> {
    let start_date = NaiveDate::parse_from_str(&start, "%Y-%m-%d").map_err(|_| INVALID_RANGE.to_string())?;
    let end_date = NaiveDate::parse_from_str(&end, "%Y-%m-%d").map_err(|_| INVALID_RANGE.to_string())?;
    if start_date > end_date {
        return Err(INVALID_RANGE.into());
    }

    // The panel never looks into the future; a range that starts there has nothing to show.
    let today_date = Local::now().naive_local().date();
    let clamped = end_date > today_date;
    let end_date = end_date.min(today_date);
    if start_date > end_date {
        return Err(INVALID_RANGE.into());
    }

    let days = (end_date - start_date).num_days() + 1;
    let prev_end = start_date - Duration::days(1);
    let prev_start = prev_end - Duration::days(days - 1);
    let fmt = |d: NaiveDate| d.format("%Y-%m-%d").to_string();
    let span = StatsSpan { start: fmt(start_date), end: fmt(end_date), days };
    let prev = StatsSpan { start: fmt(prev_start), end: fmt(prev_end), days };

    let from = format!("{}T00:00:00", span.start);
    let to = format!("{}T23:59:59", span.end);
    let prev_from = format!("{}T00:00:00", prev.start);
    let prev_to = format!("{}T23:59:59", prev.end);

    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, title, note, done_at, project_id FROM tasks \
             WHERE done = 1 AND deleted = 0 AND done_at IS NOT NULL \
               AND done_at >= ?1 AND done_at <= ?2 \
             ORDER BY done_at DESC, id ASC",
        )
        .map_err(|e| e.to_string())?;
    let tags = tag_map(&conn).map_err(|e| e.to_string())?;
    let done: Vec<DoneEntry> = stmt
        .query_map(params![from, to], |row| {
            let id: String = row.get(0)?;
            Ok(DoneEntry {
                tag_ids: tags.get(&id).cloned().unwrap_or_default(),
                id,
                title: row.get(1)?,
                note: row.get(2)?,
                done_at: row.get(3)?,
                project_id: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<_>>()
        .map_err(|e| e.to_string())?;

    let prev_done: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM tasks \
             WHERE done = 1 AND deleted = 0 AND done_at IS NOT NULL \
               AND done_at >= ?1 AND done_at <= ?2",
            params![prev_from, prev_to],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, title, roll_count, last_rolled_at FROM tasks \
             WHERE done = 0 AND deleted = 0 AND roll_count > 0 AND last_rolled_at IS NOT NULL \
               AND last_rolled_at >= ?1 AND last_rolled_at <= ?2 \
             ORDER BY roll_count DESC, last_rolled_at DESC, created_at ASC, id ASC LIMIT 5",
        )
        .map_err(|e| e.to_string())?;
    let rolled: Vec<RollEntry> = stmt
        .query_map(params![span.start, span.end], |row| {
            Ok(RollEntry { id: row.get(0)?, title: row.get(1)?, roll_count: row.get(2)?, last_rolled_at: row.get(3)? })
        })
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<_>>()
        .map_err(|e| e.to_string())?;

    let backlog: i64 = conn
        .query_row("SELECT COUNT(*) FROM tasks WHERE done = 0 AND deleted = 0", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;

    let undated: i64 = conn
        .query_row("SELECT COUNT(*) FROM tasks WHERE done = 1 AND deleted = 0 AND done_at IS NULL", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;

    Ok(StatsRaw { span, prev, done, prev_done, rolled, backlog, undated, clamped })
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

/// Rename a task in place.
#[tauri::command]
pub fn set_title(db: State<Db>, id: String, title: String) -> Result<Task, String> {
    let title = title.split_whitespace().collect::<Vec<_>>().join(" ");
    if title.is_empty() {
        return Err("a task needs a title".into());
    }
    if title.chars().count() > TASK_TITLE_MAX {
        return Err("title too long".into());
    }

    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("UPDATE tasks SET title = ?2, updated_at = ?3 WHERE id = ?1", params![id, title, now_iso()])
        .map_err(|e| e.to_string())?;
    load(&conn, &id).map_err(|e| e.to_string())
}

/// "2026-11-20T18:00" from the date+time input, "2026-11-20 18:00" by hand,
/// or a bare "2026-11-20" meaning the end of that day.
fn normalize_deadline(raw: &str) -> Result<String, String> {
    let normal = raw.trim().replace(' ', "T");
    let at = NaiveDateTime::parse_from_str(&normal, "%Y-%m-%dT%H:%M").or_else(|_| {
        NaiveDate::parse_from_str(&normal, "%Y-%m-%d").map(|d| d.and_hms_opt(23, 59, 0).expect("23:59 is a valid time"))
    });
    at.map(|at| at.format("%Y-%m-%dT%H:%M").to_string()).map_err(|_| "invalid deadline".to_string())
}

/// Set or clear the deadline. `None` / blank clears it.
#[tauri::command]
pub fn set_deadline(db: State<Db>, id: String, deadline: Option<String>) -> Result<Task, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let value = deadline.map(|v| v.trim().to_string()).filter(|v| !v.is_empty());
    match value {
        Some(raw) => {
            let at = normalize_deadline(&raw)?;
            conn.execute("UPDATE tasks SET deadline = ?2, updated_at = ?3 WHERE id = ?1", params![id, at, now_iso()])
                .map_err(|e| e.to_string())?;
        }
        None => {
            conn.execute("UPDATE tasks SET deadline = NULL, updated_at = ?2 WHERE id = ?1", params![id, now_iso()])
                .map_err(|e| e.to_string())?;
        }
    }
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

// ---------------------------------------------------------------- 005: projects & tags

const PROJECT_NAME_MAX: usize = 20;
const TAG_NAME_MAX: usize = 16;
const TAGS_PER_TASK: usize = 10;
const DUP: &str = "classes: duplicate name";

/// Collapse whitespace and enforce the length the spec promises.
fn clean_name(raw: &str, max: usize) -> Result<String, String> {
    let name = raw.split_whitespace().collect::<Vec<_>>().join(" ");
    if name.is_empty() {
        return Err("classes: empty name".into());
    }
    if name.chars().count() > max {
        return Err("classes: name too long".into());
    }
    Ok(name)
}

fn friendly(e: rusqlite::Error) -> String {
    let text = e.to_string();
    if text.contains("UNIQUE") {
        DUP.into()
    } else {
        text
    }
}

fn project_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Project> {
    Ok(Project {
        id: row.get(0)?,
        name: row.get(1)?,
        archived: row.get::<_, i64>(2)? != 0,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
    })
}

fn tag_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Tag> {
    Ok(Tag { id: row.get(0)?, name: row.get(1)?, created_at: row.get(2)? })
}

/// Both dictionaries in one round trip.
#[tauri::command]
pub fn list_classes(db: State<Db>) -> Result<Classes, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, name, archived, created_at, updated_at FROM projects \
             ORDER BY archived ASC, sort_order ASC, lower(name) ASC",
        )
        .map_err(|e| e.to_string())?;
    let projects: Vec<Project> = stmt
        .query_map([], project_from_row)
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<_>>()
        .map_err(|e| e.to_string())?;

    let mut stmt =
        conn.prepare("SELECT id, name, created_at FROM tags ORDER BY lower(name) ASC").map_err(|e| e.to_string())?;
    let tags: Vec<Tag> = stmt
        .query_map([], tag_from_row)
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<_>>()
        .map_err(|e| e.to_string())?;

    Ok(Classes { projects, tags })
}

/// Create (no id) or rename / archive an existing project.
#[tauri::command]
pub fn save_project(db: State<Db>, project: ProjectInput) -> Result<Project, String> {
    let name = clean_name(&project.name, PROJECT_NAME_MAX)?;
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let now = now_iso();

    let id = match project.id.filter(|v| !v.is_empty()) {
        Some(id) => {
            let archived = project.archived.map(|a| a as i64);
            let changed = conn
                .execute(
                    "UPDATE projects SET name = ?2, archived = COALESCE(?3, archived), updated_at = ?4 \
                     WHERE id = ?1",
                    params![id, name, archived, now],
                )
                .map_err(friendly)?;
            if changed == 0 {
                return Err("classes: no such project".into());
            }
            id
        }
        None => {
            let id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO projects(id, name, archived, sort_order, created_at, updated_at) \
                 VALUES(?1, ?2, COALESCE(?3, 0), 0, ?4, ?4)",
                params![id, name, project.archived.map(|a| a as i64), now],
            )
            .map_err(friendly)?;
            id
        }
    };

    conn.query_row(
        "SELECT id, name, archived, created_at, updated_at FROM projects WHERE id = ?1",
        params![id],
        project_from_row,
    )
    .map_err(|e| e.to_string())
}

/// Put a task into a project (or clear it with `null`).
#[tauri::command]
pub fn set_task_project(db: State<Db>, task_id: String, project_id: Option<String>) -> Result<Task, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let project_id = project_id.filter(|v| !v.is_empty());
    if let Some(pid) = &project_id {
        let exists: bool = conn
            .query_row("SELECT 1 FROM projects WHERE id = ?1", params![pid], |r| r.get::<_, i64>(0))
            .optional()
            .map_err(|e| e.to_string())?
            .is_some();
        if !exists {
            return Err("classes: no such project".into());
        }
    }
    conn.execute(
        "UPDATE tasks SET project_id = ?2, updated_at = ?3 WHERE id = ?1",
        params![task_id, project_id, now_iso()],
    )
    .map_err(|e| e.to_string())?;
    load(&conn, &task_id).map_err(|e| e.to_string())
}

/// Hang a task under one step of its project, or back to the project itself.
#[tauri::command]
pub fn set_task_node(db: State<Db>, task_id: String, node_id: Option<String>) -> Result<Task, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let node_id = node_id.filter(|v| !v.is_empty());
    if let Some(nid) = &node_id {
        let project: Option<String> = conn
            .query_row("SELECT project_id FROM nodes WHERE id = ?1", params![nid], |r| r.get(0))
            .optional()
            .map_err(|e| e.to_string())?;
        let Some(project) = project else {
            return Err("nodes: no such step".into());
        };
        // A task only lives in the project that owns its step; filing it there keeps
        // 「按项目」 and 「按步骤」 from disagreeing (spec 007, FR-005).
        conn.execute(
            "UPDATE tasks SET node_id = ?2, project_id = ?3, updated_at = ?4 WHERE id = ?1",
            params![task_id, node_id, project, now_iso()],
        )
        .map_err(|e| e.to_string())?;
    } else {
        conn.execute("UPDATE tasks SET node_id = NULL, updated_at = ?2 WHERE id = ?1", params![task_id, now_iso()])
            .map_err(|e| e.to_string())?;
    }
    load(&conn, &task_id).map_err(|e| e.to_string())
}

/// What deleting this project would touch, so the panel can warn before it happens.
#[tauri::command]
pub fn project_impact(db: State<Db>, id: String) -> Result<ProjectImpact, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    // Count every row the delete will unpin, soft-deleted ones included, so the
    // number the panel shows is exactly what the transaction touches.
    let tasks = conn
        .query_row("SELECT COUNT(*) FROM tasks WHERE project_id = ?1", params![id], |r| r.get::<_, i64>(0))
        .map_err(friendly)?;
    let nodes = conn
        .query_row("SELECT COUNT(*) FROM nodes WHERE project_id = ?1", params![id], |r| r.get::<_, i64>(0))
        .map_err(friendly)?;
    Ok(ProjectImpact { tasks, nodes })
}

/// Delete a project: its tasks fall back to unclassified, its steps go with it.
/// Nothing the user wrote is lost — the tasks keep their text, only the grouping
/// and the chain are gone — but the chain cannot be recovered, so the panel asks
/// for a second click and shows the counts first.
#[tauri::command]
pub fn delete_project(db: State<Db>, id: String) -> Result<Vec<Project>, String> {
    let mut conn = db.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(friendly)?;

    tx.execute(
        "UPDATE tasks SET project_id = NULL, node_id = NULL, updated_at = ?2 WHERE project_id = ?1",
        params![id, now_iso()],
    )
    .map_err(friendly)?;
    tx.execute("DELETE FROM nodes WHERE project_id = ?1", params![id]).map_err(friendly)?;
    let removed = tx.execute("DELETE FROM projects WHERE id = ?1", params![id]).map_err(friendly)?;
    if removed == 0 {
        return Err("classes: no such project".into());
    }

    let left = {
        let mut stmt = tx
            .prepare(
                "SELECT id, name, archived, created_at, updated_at FROM projects \
                 ORDER BY archived ASC, sort_order ASC, lower(name) ASC",
            )
            .map_err(friendly)?;
        let rows: Vec<Project> = stmt
            .query_map([], project_from_row)
            .map_err(friendly)?
            .collect::<rusqlite::Result<_>>()
            .map_err(friendly)?;
        rows
    };
    tx.commit().map_err(friendly)?;
    Ok(left)
}

/// Find a tag by name or create it — typing a new tag while assigning is the common path.
#[tauri::command]
pub fn save_tag(db: State<Db>, name: String) -> Result<Tag, String> {
    let name = clean_name(&name, TAG_NAME_MAX)?;
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    if let Some(tag) = conn
        .query_row(
            "SELECT id, name, created_at FROM tags WHERE lower(trim(name)) = lower(?1)",
            params![name],
            tag_from_row,
        )
        .optional()
        .map_err(|e| e.to_string())?
    {
        return Ok(tag);
    }

    let id = Uuid::new_v4().to_string();
    conn.execute("INSERT INTO tags(id, name, created_at) VALUES(?1, ?2, ?3)", params![id, name, now_iso()])
        .map_err(friendly)?;
    Ok(Tag { id, name, created_at: now_iso() })
}

/// Remove a tag and every link to it, in one transaction.
#[tauri::command]
pub fn delete_tag(db: State<Db>, id: String) -> Result<(), String> {
    let mut conn = db.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM task_tags WHERE tag_id = ?1", params![id]).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM tags WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

/// Replace a task's tags wholesale (deduped, capped, unknown ids dropped).
#[tauri::command]
pub fn set_task_tags(db: State<Db>, task_id: String, tag_ids: Vec<String>) -> Result<Task, String> {
    let mut unique: Vec<String> = Vec::new();
    for id in tag_ids {
        if !id.is_empty() && !unique.contains(&id) {
            unique.push(id);
        }
    }
    if unique.len() > TAGS_PER_TASK {
        return Err(format!("classes: at most {TAGS_PER_TASK} tags per task"));
    }

    let mut conn = db.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM task_tags WHERE task_id = ?1", params![task_id]).map_err(|e| e.to_string())?;
    for tag_id in &unique {
        tx.execute(
            "INSERT OR IGNORE INTO task_tags(task_id, tag_id) SELECT ?1, id FROM tags WHERE id = ?2",
            params![task_id, tag_id],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    load(&conn, &task_id).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------- 006: node chains

const NODE_TITLE_MAX: usize = 60;

fn nodes_of(conn: &Connection, project_id: &str) -> rusqlite::Result<Vec<Node>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, title, note, done, sort_order, created_at, updated_at FROM nodes \
         WHERE project_id = ?1 ORDER BY sort_order ASC, created_at ASC",
    )?;
    let rows = stmt.query_map(params![project_id], Node::from_row)?.collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

/// The ordered chain of steps inside one project.
#[tauri::command]
pub fn list_nodes(db: State<Db>, project_id: String) -> Result<Vec<Node>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    nodes_of(&conn, &project_id).map_err(|e| e.to_string())
}

/// Add a step to the end of the chain, or rename / renote an existing one.
#[tauri::command]
pub fn save_node(db: State<Db>, node: NodeInput) -> Result<Vec<Node>, String> {
    let title = node.title.split_whitespace().collect::<Vec<_>>().join(" ");
    if title.is_empty() {
        return Err("nodes: empty title".into());
    }
    if title.chars().count() > NODE_TITLE_MAX {
        return Err("nodes: title too long".into());
    }

    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let now = now_iso();

    match node.id.filter(|v| !v.is_empty()) {
        Some(id) => {
            conn.execute(
                "UPDATE nodes SET title = ?2, note = ?3, updated_at = ?4 WHERE id = ?1",
                params![id, title, node.note, now],
            )
            .map_err(|e| e.to_string())?;
        }
        None => {
            let next: i64 = conn
                .query_row(
                    "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM nodes WHERE project_id = ?1",
                    params![node.project_id],
                    |r| r.get(0),
                )
                .map_err(|e| e.to_string())?;
            conn.execute(
                "INSERT INTO nodes(id, project_id, title, note, done, sort_order, created_at, updated_at) \
                 VALUES(?1, ?2, ?3, ?4, 0, ?5, ?6, ?6)",
                params![Uuid::new_v4().to_string(), node.project_id, title, node.note, next, now],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    nodes_of(&conn, &node.project_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_node(db: State<Db>, id: String) -> Result<Vec<Node>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let project_id: String = conn
        .query_row("SELECT project_id FROM nodes WHERE id = ?1", params![id], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    // The tasks stay; they just go back to the project's top level (spec 007, FR-007).
    conn.execute("UPDATE tasks SET node_id = NULL, updated_at = ?2 WHERE node_id = ?1", params![id, now_iso()])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM nodes WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    nodes_of(&conn, &project_id).map_err(|e| e.to_string())
}

/// Tick a step: the next open one becomes "current" on its own (no extra state).
#[tauri::command]
pub fn complete_node(db: State<Db>, id: String) -> Result<Vec<Node>, String> {
    set_node_done(&db, &id, true)
}

#[tauri::command]
pub fn reopen_node(db: State<Db>, id: String) -> Result<Vec<Node>, String> {
    set_node_done(&db, &id, false)
}

fn set_node_done(db: &State<Db>, id: &str, done: bool) -> Result<Vec<Node>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let project_id: String = conn
        .query_row("SELECT project_id FROM nodes WHERE id = ?1", params![id], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    conn.execute("UPDATE nodes SET done = ?2, updated_at = ?3 WHERE id = ?1", params![id, done as i64, now_iso()])
        .map_err(|e| e.to_string())?;
    nodes_of(&conn, &project_id).map_err(|e| e.to_string())
}

/// Count today's open tasks (kept for completeness).
#[allow(dead_code)]
pub fn count_today(conn: &Connection) -> rusqlite::Result<i64> {
    conn.query_row("SELECT COUNT(*) FROM tasks WHERE done = 0 AND deleted = 0 AND bucket = 'today'", [], |r| r.get(0))
        .optional()
        .map(|v| v.unwrap_or(0))
}

// ---------------------------------------------------------------- recurring rules

const RECURRING_SELECT: &str = "SELECT id, title, project_id, node_id, kind, days, month_day, archived, \
     created_at, updated_at FROM recurrences";

fn rules_of(conn: &Connection) -> rusqlite::Result<Vec<Recurrence>> {
    let mut stmt = conn.prepare(&format!("{RECURRING_SELECT} ORDER BY archived ASC, created_at ASC"))?;
    let rows = stmt.query_map([], Recurrence::from_row)?.collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

#[tauri::command]
pub fn list_recurrences(db: State<Db>) -> Result<Vec<Recurrence>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    rules_of(&conn).map_err(|e| e.to_string())
}

/// Create (no id) or edit one rule. The edit takes effect from the next matching day;
/// rows already spawned keep looking exactly like what they were.
#[tauri::command]
pub fn save_recurrence(db: State<Db>, input: RecurrenceInput) -> Result<Vec<Recurrence>, String> {
    let title = input.title.trim().to_string();
    if title.is_empty() {
        return Err("a rule needs a title".into());
    }
    if title.chars().count() > TASK_TITLE_MAX {
        return Err("title too long".into());
    }
    let kind = match input.kind.as_str() {
        "daily" | "weekly" | "monthly" => input.kind.clone(),
        _ => return Err("unknown recurrence".into()),
    };
    let mut days: Vec<i64> = input.days.into_iter().filter(|d| (1..=7).contains(d)).collect();
    days.sort_unstable();
    days.dedup();
    if kind == "weekly" && days.is_empty() {
        return Err("pick at least one weekday".into());
    }
    let month_day = input.month_day.filter(|d| (1..=31).contains(d));
    if kind == "monthly" && month_day.is_none() {
        return Err("pick a day of the month".into());
    }

    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let day = today();
    match input.id {
        Some(id) => {
            conn.execute(
                "UPDATE recurrences SET title = ?2, project_id = ?3, node_id = ?4, kind = ?5, \
                 days = ?6, month_day = ?7, archived = COALESCE(?8, archived), updated_at = ?9 \
                 WHERE id = ?1",
                params![
                    id,
                    title,
                    input.project_id.filter(|v| !v.is_empty()),
                    input.node_id.filter(|v| !v.is_empty()),
                    kind,
                    days.iter().map(|d| d.to_string()).collect::<Vec<_>>().join(","),
                    month_day,
                    input.archived.map(|a| a as i64),
                    now_iso()
                ],
            )
            .map_err(|e| e.to_string())?;
            if input.archived == Some(false) {
                // Resuming should not skip today.
                materialize(&conn, &day).map_err(|e| e.to_string())?;
            }
        }
        None => {
            conn.execute(
                "INSERT INTO recurrences(id, title, project_id, node_id, kind, days, month_day, archived, \
                 created_at, updated_at) VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, ?8, ?8)",
                params![
                    Uuid::new_v4().to_string(),
                    title,
                    input.project_id.filter(|v| !v.is_empty()),
                    input.node_id.filter(|v| !v.is_empty()),
                    kind,
                    days.iter().map(|d| d.to_string()).collect::<Vec<_>>().join(","),
                    month_day,
                    now_iso()
                ],
            )
            .map_err(|e| e.to_string())?;
            materialize(&conn, &day).map_err(|e| e.to_string())?;
        }
    }
    rules_of(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn archive_recurrence(db: State<Db>, id: String, paused: bool) -> Result<Vec<Recurrence>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE recurrences SET archived = ?2, updated_at = ?3 WHERE id = ?1",
        params![id, paused as i64, now_iso()],
    )
    .map_err(|e| e.to_string())?;
    rules_of(&conn).map_err(|e| e.to_string())
}

/// Dropping the rule drops the run you can still act on. Finished runs stay in the
/// records as ordinary tasks — deleting history because a rule was retired would be
/// rewriting the past (constitution II).
#[tauri::command]
pub fn delete_recurrence(db: State<Db>, id: String) -> Result<Vec<Recurrence>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let now = now_iso();
    conn.execute(
        "UPDATE tasks SET deleted = 1, updated_at = ?2 WHERE recurrence_id = ?1 AND done = 0",
        params![id, now],
    )
    .map_err(|e| e.to_string())?;
    conn.execute("UPDATE tasks SET recurrence_id = NULL, updated_at = ?2 WHERE recurrence_id = ?1", params![id, now])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM recurrences WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    rules_of(&conn).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rule(kind: &str, days: Vec<i64>, month_day: Option<i64>) -> Recurrence {
        Recurrence {
            id: "r".into(),
            title: "t".into(),
            project_id: None,
            node_id: None,
            kind: kind.into(),
            days,
            month_day,
            archived: false,
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    fn day(y: i32, m: u32, d: u32) -> NaiveDate {
        NaiveDate::from_ymd_opt(y, m, d).unwrap()
    }

    #[test]
    fn deadline_accepts_a_date_time_or_a_bare_date() {
        assert_eq!(normalize_deadline("2026-11-20T18:00").unwrap(), "2026-11-20T18:00");
        assert_eq!(normalize_deadline("2026-11-20 18:00").unwrap(), "2026-11-20T18:00");
        assert_eq!(normalize_deadline(" 2026-11-20 ").unwrap(), "2026-11-20T23:59");
        assert!(normalize_deadline("someday").is_err());
        assert!(normalize_deadline("2026-13-01").is_err());
    }

    #[test]
    fn daily_fires_every_day() {
        let r = rule("daily", vec![], None);
        assert!(fires_on(&r, day(2026, 11, 9)));
        assert!(fires_on(&r, day(2026, 11, 10)));
        assert!(fires_on(&r, day(2026, 2, 28)));
    }

    #[test]
    fn weekly_fires_on_the_listed_weekdays() {
        let r = rule("weekly", vec![1, 3, 5], None);
        assert!(fires_on(&r, day(2026, 11, 9)), "monday");
        assert!(!fires_on(&r, day(2026, 11, 10)), "tuesday");
        assert!(fires_on(&r, day(2026, 11, 11)), "wednesday");
        assert!(fires_on(&r, day(2026, 11, 13)), "friday");
        assert!(!fires_on(&r, day(2026, 11, 15)), "sunday");
    }

    #[test]
    fn monthly_31_lands_on_the_last_day_of_a_short_month() {
        let r = rule("monthly", vec![], Some(31));
        assert!(fires_on(&r, day(2026, 1, 31)));
        assert!(!fires_on(&r, day(2026, 1, 30)));
        assert!(fires_on(&r, day(2026, 2, 28)));
        assert!(fires_on(&r, day(2024, 2, 29)));
        assert!(fires_on(&r, day(2026, 4, 30)), "april ends on the 30th");
        assert!(!fires_on(&r, day(2026, 4, 29)));
    }

    #[test]
    fn monthly_30_collapses_into_february_too() {
        let r = rule("monthly", vec![], Some(30));
        assert!(fires_on(&r, day(2026, 2, 28)));
        assert!(fires_on(&r, day(2026, 4, 30)));
        assert!(!fires_on(&r, day(2026, 4, 29)));
    }

    #[test]
    fn last_day_follows_the_calendar() {
        assert_eq!(last_day_of_month(day(2026, 2, 10)), 28);
        assert_eq!(last_day_of_month(day(2024, 2, 10)), 29);
        assert_eq!(last_day_of_month(day(2026, 12, 10)), 31);
        assert_eq!(last_day_of_month(day(2026, 4, 10)), 30);
    }
}

#[cfg(test)]
mod materialize_tests {
    use super::*;

    fn seed_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE tasks (
                id TEXT PRIMARY KEY, title TEXT NOT NULL, note TEXT, bucket TEXT NOT NULL DEFAULT 'inbox',
                plan_date TEXT, first_seen_date TEXT, due_at TEXT, done INTEGER NOT NULL DEFAULT 0,
                done_at TEXT, roll_count INTEGER NOT NULL DEFAULT 0, last_rolled_at TEXT,
                sort_order INTEGER NOT NULL DEFAULT 0, deleted INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
                project_id TEXT, node_id TEXT, recurrence_id TEXT, occurrence_date TEXT,
                deadline TEXT);
             CREATE UNIQUE INDEX ux_tasks_occurrence
                ON tasks(recurrence_id, occurrence_date) WHERE recurrence_id IS NOT NULL;
             CREATE TABLE recurrences (
                id TEXT PRIMARY KEY, title TEXT NOT NULL, project_id TEXT, node_id TEXT,
                kind TEXT NOT NULL, days TEXT, month_day INTEGER, archived INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
             CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL);
             CREATE TABLE nodes (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, title TEXT NOT NULL);",
        )
        .unwrap();
        conn
    }

    fn add_rule(conn: &Connection, id: &str, kind: &str, days: &str, month_day: Option<i64>) {
        conn.execute(
            "INSERT INTO recurrences(id, title, project_id, node_id, kind, days, month_day, archived, created_at, updated_at)
             VALUES(?1, 'write the daily note', NULL, NULL, ?2, ?3, ?4, 0, '2026-11-10T09:00:00', '2026-11-10T09:00:00')",
            params![id, kind, days, month_day],
        )
        .unwrap();
    }

    fn count(conn: &Connection) -> i64 {
        conn.query_row("SELECT COUNT(*) FROM tasks", [], |r| r.get(0)).unwrap()
    }

    #[test]
    fn the_same_day_never_spawns_twice() {
        let conn = seed_db();
        add_rule(&conn, "r1", "daily", "", None);
        assert_eq!(materialize(&conn, "2026-11-10").unwrap(), 1);
        assert_eq!(materialize(&conn, "2026-11-10").unwrap(), 0, "second call must not duplicate");
        assert_eq!(materialize(&conn, "2026-11-10").unwrap(), 0);
        assert_eq!(count(&conn), 1);
    }

    #[test]
    fn a_weekly_rule_only_fires_on_its_days() {
        let conn = seed_db();
        add_rule(&conn, "r2", "weekly", "1,3,5", None);
        assert_eq!(materialize(&conn, "2026-11-09").unwrap(), 1, "monday");
        assert_eq!(materialize(&conn, "2026-11-10").unwrap(), 0, "tuesday");
        assert_eq!(materialize(&conn, "2026-11-11").unwrap(), 1, "wednesday");
        assert_eq!(count(&conn), 2);
    }

    #[test]
    fn a_paused_rule_stops_spawning() {
        let conn = seed_db();
        add_rule(&conn, "r3", "daily", "", None);
        conn.execute("UPDATE recurrences SET archived = 1 WHERE id = 'r3'", []).unwrap();
        assert_eq!(materialize(&conn, "2026-11-10").unwrap(), 0);
        assert_eq!(count(&conn), 0);
    }

    #[test]
    fn yesterday_left_over_is_spent_not_rolled_over() {
        let conn = seed_db();
        add_rule(&conn, "r4", "daily", "", None);
        materialize(&conn, "2026-11-09").unwrap();
        materialize(&conn, "2026-11-10").unwrap();
        // Rolling into the 10th expires the 9th instead of pushing it forward.
        rollover(&conn, "2026-11-10").unwrap();
        let (bucket, plan, rolls): (String, String, i64) = conn
            .query_row(
                "SELECT bucket, plan_date, roll_count FROM tasks WHERE occurrence_date = '2026-11-09'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .unwrap();
        assert_eq!(bucket, "expired");
        assert_eq!(plan, "2026-11-09");
        assert_eq!(rolls, 0, "a missed run must not look like something dragged along");
    }
}
