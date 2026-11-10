"""Prove the 2026-11-10 amendment: deleting a project unpins its tasks, drops its
nodes and never touches a task row's own data.

Works on a *copy* of the live database so the running app is not disturbed:

    $env:PYTHONIOENCODING='utf-8'
    python specs\\005-project-tags\\verify\\delete_check.py

Exit code 0 and "OK" means every assertion held.
"""

import os
import shutil
import sqlite3
import sys
import tempfile
import uuid
from datetime import datetime, timezone

LIVE = os.path.expandvars(r"%APPDATA%\com.tool.suoji\suoji.db")

failures = []


def check(label, got, want):
    ok = got == want
    print(f"{'PASS' if ok else 'FAIL'}  {label}: {got!r}" + ("" if ok else f" (want {want!r})"))
    if not ok:
        failures.append(label)


def copy_live():
    """SQLite-safe copy: the app may hold the file, so read through a RO handle."""
    tmp = os.path.join(tempfile.gettempdir(), f"suoji-delete-{uuid.uuid4().hex[:8]}.db")
    src = sqlite3.connect(f"file:{LIVE}?mode=ro", uri=True)
    dst = sqlite3.connect(tmp)
    with dst:
        src.backup(dst)
    src.close()
    dst.close()
    return tmp


def main():
    db = copy_live()
    conn = sqlite3.connect(db)
    now = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")
    try:
        before_tasks = conn.execute("SELECT COUNT(*) FROM tasks").fetchone()[0]
        before_done = conn.execute(
            "SELECT COUNT(*), SUM(done), COUNT(done_at) FROM tasks"
        ).fetchone()

        # A throwaway project with one node, two tasks pinned to it — one of them
        # completed with a timestamp, so we can prove history survives.
        pid = str(uuid.uuid4())
        conn.execute(
            "INSERT INTO projects(id, name, archived, sort_order, created_at, updated_at) VALUES(?,?,0,0,?,?)",
            (pid, "验收用项目", now, now),
        )
        for i in range(2):
            conn.execute(
                "INSERT INTO nodes(id, project_id, title, note, done, sort_order, created_at, updated_at) "
                "VALUES(?,?,?,NULL,0,?,?,?)",
                (str(uuid.uuid4()), pid, f"步骤{i + 1}", i, now, now),
            )
        task_ids = [r[0] for r in conn.execute("SELECT id FROM tasks LIMIT 2")]
        if len(task_ids) < 2:
            print("SKIP  数据库里不足 2 条任务，无法验证归属解绑")
            return
        conn.execute(
            "UPDATE tasks SET project_id = ?, done = 1, done_at = ? WHERE id = ?",
            (pid, f"{now[:10]}T09:30:00", task_ids[0]),
        )
        conn.execute("UPDATE tasks SET project_id = ? WHERE id = ?", (pid, task_ids[1]))
        conn.commit()

        impacted = conn.execute(
            "SELECT (SELECT COUNT(*) FROM tasks WHERE project_id = ?1),"
            "       (SELECT COUNT(*) FROM nodes WHERE project_id = ?1)",
            (pid,),
        ).fetchone()
        check("project_impact 报告的任务数", impacted[0], 2)
        check("project_impact 报告的节点数", impacted[1], 2)

        # The exact statements delete_project runs, in one transaction.
        with conn:
            conn.execute("UPDATE tasks SET project_id = NULL, updated_at = ?2 WHERE project_id = ?1", (pid, now))
            conn.execute("DELETE FROM nodes WHERE project_id = ?1", (pid,))
            removed = conn.execute("DELETE FROM projects WHERE id = ?1", (pid,)).rowcount
        check("删除的项目行数", removed, 1)

        check("项目已不存在", conn.execute("SELECT COUNT(*) FROM projects WHERE id = ?", (pid,)).fetchone()[0], 0)
        check("节点已删除", conn.execute("SELECT COUNT(*) FROM nodes WHERE project_id = ?", (pid,)).fetchone()[0], 0)
        check(
            "任务回到未分类",
            conn.execute("SELECT COUNT(*) FROM tasks WHERE project_id = ?", (pid,)).fetchone()[0],
            0,
        )
        check("任务行数不变", conn.execute("SELECT COUNT(*) FROM tasks").fetchone()[0], before_tasks)
        after_done = conn.execute(
            "SELECT COUNT(*), SUM(done), COUNT(done_at) FROM tasks"
        ).fetchone()
        check("完成状态与完成时刻未受影响", after_done, before_done)
        check(
            "完成的那条任务仍在",
            conn.execute("SELECT COUNT(*) FROM tasks WHERE id = ? AND done = 1", (task_ids[0],)).fetchone()[0],
            1,
        )
        check("integrity_check", conn.execute("PRAGMA integrity_check").fetchone()[0], "ok")
    finally:
        conn.close()
        os.remove(db)

    print()
    if failures:
        print(f"FAILED ({len(failures)}): " + ", ".join(failures))
        sys.exit(1)
    print("OK (0 failure(s))")


if __name__ == "__main__":
    main()
