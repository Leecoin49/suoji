"""Fixture check for `get_stats` (spec 002, SC-002/003/004/006 data basis).

Runs the five statements of src-tauri/src/commands.rs::get_stats verbatim against a
throwaway fixture database and asserts the expected numbers. No test framework is
added to the repo: this is a one-off verification script, not part of the build.

    python specs/002-stats-dashboard/verify/fixture_check.py

Exit code 0 = every assertion passed.
"""

import os
import sqlite3
import sys
from datetime import date, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(HERE, "fixture.db")

SCHEMA = """
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
"""

# id, title, done, deleted, done_at, note, roll_count, last_rolled_at
ROWS = [
    ("a1", "write spec", 1, 0, "2026-10-01T09:12:00", None, 0, None),
    ("a2", "review pr", 1, 0, "2026-10-01T18:40:00", "two rounds", 0, None),
    ("a3", "call bank", 1, 0, "2026-10-05T10:00:00", None, 3, "2026-10-20"),
    ("a4", "late fix", 1, 0, "2026-10-20T23:30:00", None, 0, None),
    ("a5", "midnight", 1, 0, "2026-10-21T00:10:00", None, 0, None),
    ("a6", "undated one", 1, 0, None, None, 0, None),
    ("a7", "undated two", 1, 0, None, None, 1, "2026-10-04"),
    ("a8", "deleted done", 1, 1, "2026-10-10T10:00:00", None, 0, None),
    ("a9", "september done", 1, 0, "2026-09-15T10:00:00", None, 0, None),
    ("a10", "last second", 1, 0, "2026-10-30T23:59:59", None, 0, None),
    ("a11", "spilled over", 1, 0, "2026-10-31T00:00:00", None, 0, None),
    ("b1", "pushed twice", 0, 0, None, None, 2, "2026-10-12"),
    ("b2", "pushed old", 0, 0, None, None, 5, "2026-09-20"),
    ("b3", "pushed never dated", 0, 0, None, None, 1, None),
    ("b4", "pushed seven", 0, 0, None, None, 7, "2026-10-03"),
    ("b5", "plain open", 0, 0, None, None, 0, None),
    ("b6", "deleted open pushed", 0, 1, None, None, 4, "2026-10-02"),
]

DETAIL = """
SELECT id, title, note, done_at FROM tasks
WHERE done = 1 AND deleted = 0 AND done_at IS NOT NULL
  AND done_at >= ?1 AND done_at <= ?2
ORDER BY done_at DESC, id ASC
"""
PREV_DONE = """
SELECT COUNT(*) FROM tasks
WHERE done = 1 AND deleted = 0 AND done_at IS NOT NULL
  AND done_at >= ?1 AND done_at <= ?2
"""
ROLLED = """
SELECT id, title, roll_count, last_rolled_at FROM tasks
WHERE done = 0 AND deleted = 0 AND roll_count > 0
  AND last_rolled_at IS NOT NULL
  AND last_rolled_at >= ?1 AND last_rolled_at <= ?2
ORDER BY roll_count DESC, last_rolled_at DESC, created_at ASC, id ASC
LIMIT 5
"""
BACKLOG = "SELECT COUNT(*) FROM tasks WHERE done = 0 AND deleted = 0"
UNDATED = "SELECT COUNT(*) FROM tasks WHERE done = 1 AND deleted = 0 AND done_at IS NULL"


def build():
    if os.path.exists(DB):
        os.remove(DB)
    conn = sqlite3.connect(DB)
    conn.executescript(SCHEMA)
    conn.executemany(
        "INSERT INTO tasks (id, title, done, deleted, done_at, note, roll_count,"
        " last_rolled_at, bucket, created_at, updated_at)"
        " VALUES (?,?,?,?,?,?,?,?,'today','2026-09-01T08:00:00','2026-09-01T08:00:00')",
        ROWS,
    )
    conn.commit()
    return conn


def stats(conn, start, end):
    """Mirrors get_stats: current window [start, end], previous window of equal length."""
    lo, hi = start + "T00:00:00", end + "T23:59:59"
    first = date.fromisoformat(start)
    last = date.fromisoformat(end)
    days = (last - first).days + 1
    prev_end = first - timedelta(days=1)
    prev_start = prev_end - timedelta(days=days - 1)
    return {
        "done": [r[0] for r in conn.execute(DETAIL, (lo, hi))],
        "prev_done": conn.execute(
            PREV_DONE, (prev_start.isoformat() + "T00:00:00", prev_end.isoformat() + "T23:59:59")
        ).fetchone()[0],
        "rolled": [(r[0], r[2]) for r in conn.execute(ROLLED, (start, end))],
        "backlog": conn.execute(BACKLOG).fetchone()[0],
        "undated": conn.execute(UNDATED).fetchone()[0],
    }


CASES = [
    # label, start, end, expected
    (
        "30-day window 10-01..10-30",
        "2026-10-01",
        "2026-10-30",
        {
            "done": ["a10", "a5", "a4", "a3", "a2", "a1"],
            "prev_done": 1,
            "rolled": [("b4", 7), ("b1", 2)],
            "backlog": 5,
            "undated": 2,
        },
    ),
    (
        "single day 10-21",
        "2026-10-21",
        "2026-10-21",
        {"done": ["a5"], "prev_done": 1, "rolled": [], "backlog": 5, "undated": 2},
    ),
    (
        "single day 10-01",
        "2026-10-01",
        "2026-10-01",
        {"done": ["a2", "a1"], "prev_done": 0, "rolled": [], "backlog": 5, "undated": 2},
    ),
    (
        "boundary 10-30 excludes 10-31 00:00",
        "2026-10-30",
        "2026-10-30",
        {"done": ["a10"], "prev_done": 0, "rolled": [], "backlog": 5, "undated": 2},
    ),
    (
        "empty window 11-01..11-05 (prev 10-27..10-31)",
        "2026-11-01",
        "2026-11-05",
        {"done": [], "prev_done": 2, "rolled": [], "backlog": 5, "undated": 2},
    ),
    (
        "cross-year 2025-12-01..2026-10-30",
        "2025-12-01",
        "2026-10-30",
        {
            "done": ["a10", "a5", "a4", "a3", "a2", "a1", "a9"],
            "prev_done": 0,
            "rolled": [("b4", 7), ("b2", 5), ("b1", 2)],
            "backlog": 5,
            "undated": 2,
        },
    ),
]


def main():
    conn = build()
    failures = 0
    for label, start, end, expected in CASES:
        got = stats(conn, start, end)
        ok = got == expected
        print(("PASS " if ok else "FAIL ") + label)
        if not ok:
            failures += 1
            for k in expected:
                if got[k] != expected[k]:
                    print("   %-9s expected %r got %r" % (k, expected[k], got[k]))
    # SC-004 basis: buckets sum must equal the detail count for one window.
    rows = conn.execute(DETAIL, ("2026-10-01T00:00:00", "2026-10-30T23:59:59")).fetchall()
    per_day = {}
    for r in rows:
        day = r[3][:10]
        per_day[day] = per_day.get(day, 0) + 1
    total = sum(per_day.values())
    ok = total == len(rows) == 6
    print(("PASS " if ok else "FAIL ") + "bucket sum equals detail count (%d)" % total)
    failures += 0 if ok else 1
    print("per-day:", dict(sorted(per_day.items())))
    conn.close()
    print("\n%s (%d failure(s))" % ("OK" if failures == 0 else "FAILED", failures))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
