use chrono::Local;
use std::time::Duration;
use tauri::{AppHandle, Manager};
use tauri_plugin_notification::NotificationExt;

use crate::db::{get_meta, set_meta, Db};

/// Background heartbeat: every 30s, handles the midnight rollover and the two daily reminders.
pub fn spawn(app: AppHandle) {
    std::thread::spawn(move || {
        // Let the window come up first so nothing pops on launch.
        std::thread::sleep(Duration::from_secs(6));
        loop {
            tick(&app);
            std::thread::sleep(Duration::from_secs(30));
        }
    });
}

/// A notification waiting to be shown.
struct Notice {
    title: String,
    body: String,
}

/// "09:00" -> 540
fn mins(s: &str) -> i64 {
    let mut it = s.split(':');
    let h: i64 = it.next().and_then(|v| v.trim().parse().ok()).unwrap_or(0);
    let m: i64 = it.next().and_then(|v| v.trim().parse().ok()).unwrap_or(0);
    (h * 60 + m).clamp(0, 24 * 60)
}

/// Only fire within two hours of the configured time; a missed reminder is skipped
/// rather than replayed at launch.
const NOTICE_WINDOW_MIN: i64 = 120;

fn tick(app: &AppHandle) {
    let Some(db) = app.try_state::<Db>() else {
        return;
    };

    let now = Local::now();
    let day = now.format("%Y-%m-%d").to_string();
    let hhmm = now.format("%H:%M").to_string();
    let now_min = mins(&hhmm);

    // Phase 1: hold the lock to read state, roll over at midnight and mark reminders as sent.
    let notices: Vec<Notice> = {
        let Ok(conn) = db.0.lock() else { return };

        // After midnight, move yesterday's leftovers onto today.
        let last_roll = get_meta(&conn, "last_rollover").unwrap_or_default();
        if last_roll != day {
            let _ = crate::commands::rollover(&conn, &day);
            let _ = set_meta(&conn, "last_rollover", &day);
        }

        let pending: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM tasks \
                 WHERE done = 0 AND deleted = 0 AND bucket = 'today'",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);

        let stuck: Option<String> = conn
            .query_row(
                "SELECT title FROM tasks \
                 WHERE done = 0 AND deleted = 0 AND bucket = 'today' \
                   AND first_seen_date IS NOT NULL \
                   AND julianday(?1) - julianday(first_seen_date) >= 2 \
                 ORDER BY first_seen_date ASC LIMIT 1",
                rusqlite::params![day],
                |r| r.get(0),
            )
            .ok();

        let settings = crate::db::settings(&conn);
        let l = crate::i18n::labels(&settings.locale);
        let mut out = Vec::new();

        // Morning: today's list
        let morning_at = mins(&settings.morning_time);
        if now_min >= morning_at
            && now_min <= morning_at + NOTICE_WINDOW_MIN
            && get_meta(&conn, "last_morning").as_deref() != Some(day.as_str())
        {
            let pending_s = pending.to_string();
            let body = if pending == 0 {
                l.morning_empty.to_string()
            } else {
                match &stuck {
                    Some(title) => crate::i18n::fill(l.morning_stuck, &[("pending", &pending_s), ("title", title)]),
                    None => crate::i18n::fill(l.morning_plan, &[("pending", &pending_s)]),
                }
            };
            out.push(Notice { title: l.morning_title.to_string(), body });
            let _ = set_meta(&conn, "last_morning", &day);
        }

        // Evening: close out
        let evening_at = mins(&settings.evening_time);
        if now_min >= evening_at
            && now_min <= evening_at + NOTICE_WINDOW_MIN
            && pending > 0
            && get_meta(&conn, "last_evening").as_deref() != Some(day.as_str())
        {
            out.push(Notice {
                title: l.evening_title.to_string(),
                body: crate::i18n::fill(l.evening_body, &[("pending", &pending.to_string())]),
            });
            let _ = set_meta(&conn, "last_evening", &day);
        }

        out
    };

    // Phase 2: release the lock, then show.
    for n in notices {
        let _ = app.notification().builder().title(n.title).body(n.body).show();
    }
}
