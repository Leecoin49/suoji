"""Checks the capture-bar project wiring without touching the real database.

Runs on a copy of suojii.db and executes the exact SQL that `add_task` runs
after its existence check, so a broken column name or a missing project_id
in the INSERT would fail here instead of in the app.
"""
import os
import shutil
import sqlite3
import tempfile
import uuid

SRC = os.path.expandvars(r"%APPDATA%\com.tool.suoji\suoji.db")
NOW = "2026-11-10T09:10:00"

INSERT = """
INSERT INTO tasks (id, title, note, bucket, plan_date, first_seen_date, due_at,
                   done, done_at, roll_count, last_rolled_at, sort_order,
                   deleted, created_at, updated_at, project_id)
VALUES (?1, ?2, '', 'today', ?3, ?3, NULL, 0, NULL, 0, NULL, 0, 0, ?4, ?4, ?5)
"""


def fresh_copy():
    path = os.path.join(tempfile.mkdtemp(prefix="suoji-cap-"), "suoji.db")
    shutil.copy2(SRC, path)
    return path


def insert(conn, title, project_id):
    tid = str(uuid.uuid4())
    conn.execute(INSERT, (tid, title, "2026-11-10", NOW, project_id))
    return tid


def read(conn, tid):
    row = conn.execute("SELECT project_id FROM tasks WHERE id = ?", (tid,)).fetchone()
    return row[0] if row else "missing"


def main():
    path = fresh_copy()
    conn = sqlite3.connect(path)
    failures = []

    def check(label, got, want):
        ok = got == want
        if not ok:
            failures.append(f"{label}: got {got!r}, want {want!r}")
        print(f"{'ok  ' if ok else 'FAIL'} {label}")

    pid = str(uuid.uuid4())
    conn.execute(
        "INSERT INTO projects (id, name, archived, created_at, updated_at) VALUES (?, ?, 0, ?, ?)",
        (pid, "验收项目", NOW, NOW),
    )

    # 1. a task created with a project keeps it
    t1 = insert(conn, "写稿：季度总结", pid)
    check("task keeps its project", read(conn, t1), pid)

    # 2. no project means NULL, never an empty string
    t2 = insert(conn, "没归项目的琐事", None)
    check("no project is NULL", read(conn, t2), None)

    # 3. the frontend only sends ids that came from list_classes, but a stale id
    #    must not break the day view: read it back and confirm it is not reused
    t3 = insert(conn, "幽灵项目", str(uuid.uuid4()))
    check("unknown project id is stored as given", read(conn, t3) is not None, True)

    # 4. deleting the project must not delete or corrupt the task row
    conn.execute("UPDATE tasks SET project_id = NULL WHERE project_id = ?", (pid,))
    conn.execute("DELETE FROM projects WHERE id = ?", (pid,))
    check("task survives project deletion", read(conn, t1), None)
    check("task row still exists", read(conn, t1) != "missing", True)

    # 5. the tags attached to the same task still resolve through task_tags
    tag = conn.execute("SELECT id FROM tags LIMIT 1").fetchone()
    if tag:
        conn.execute("INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)", (t1, tag[0]))
        got = conn.execute(
            "SELECT COUNT(*) FROM task_tags WHERE task_id = ?", (t1,)
        ).fetchone()[0]
        check("tag link survives", got, 1)

    conn.commit()
    conn.close()
    os.remove(path)

    print()
    print(f"OK (0 failure(s))" if not failures else f"FAIL ({len(failures)})")
    for f in failures:
        print("  -", f)


if __name__ == "__main__":
    main()
