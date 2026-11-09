# T032 / SC-005 —— 数据路径计时（10 000 条任务）
#
# 说明：SC-005 写的是「切换区间到画面稳定」的耗时，那需要真机窗口；本脚本测的是
# 这一过程里可以在命令行复现的那一段：五条 SELECT + 前端聚合（聚合由 perf_agg.mjs 测）。
# 两者相加即为一条乐观下界，画面合成的开销不计入。
#
# 用法：python specs/002-stats-dashboard/verify/perf_check.py
# 产物：specs/002-stats-dashboard/verify/fixture-perf.db（可随时删除，脚本会重建）

import os
import sqlite3
import statistics
import time

HERE = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(HERE, "fixture-perf.db")
ROWS = 10000
REPEATS = 5

SCHEMA = """
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  note TEXT,
  bucket TEXT NOT NULL,
  plan_date TEXT,
  first_seen_date TEXT NOT NULL,
  due_at TEXT,
  done INTEGER NOT NULL DEFAULT 0,
  done_at TEXT,
  roll_count INTEGER NOT NULL DEFAULT 0,
  last_rolled_at TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS day_notes (date TEXT PRIMARY KEY, note TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_tasks_day ON tasks(bucket, done, plan_date);
CREATE INDEX IF NOT EXISTS idx_tasks_done ON tasks(done, done_at);
"""

DETAIL = """SELECT id,title,note,done_at FROM tasks
  WHERE done=1 AND deleted=0 AND done_at IS NOT NULL AND done_at >= ?1 AND done_at <= ?2
  ORDER BY done_at DESC, id ASC"""
PREV = """SELECT COUNT(*) FROM tasks
  WHERE done=1 AND deleted=0 AND done_at IS NOT NULL AND done_at >= ?1 AND done_at <= ?2"""
ROLLED = """SELECT id,title,roll_count,last_rolled_at FROM tasks
  WHERE done=0 AND deleted=0 AND roll_count>0 AND last_rolled_at IS NOT NULL
    AND last_rolled_at >= ?1 AND last_rolled_at <= ?2
  ORDER BY roll_count DESC, last_rolled_at DESC, created_at ASC, id ASC LIMIT 5"""
BACKLOG = "SELECT COUNT(*) FROM tasks WHERE done=0 AND deleted=0"
UNDATED = "SELECT COUNT(*) FROM tasks WHERE done=1 AND deleted=0 AND done_at IS NULL"


def iso(d):
    from datetime import date, timedelta
    return (date(2023, 1, 1) + timedelta(days=d)).isoformat()


def build():
    if os.path.exists(DB):
        os.remove(DB)
    con = sqlite3.connect(DB)
    con.executescript(SCHEMA)
    rows = []
    # 约 70% 完成（跨 3 年，每天约 6-7 件），30% 未完成/推后
    for i in range(ROWS):
        day = (i * 1093) // ROWS  # 0 .. 1092 天
        done = 1 if i % 10 < 7 else 0
        done_at = "%sT%02d:%02d:00" % (iso(day), 8 + (i % 12), i % 60) if done else None
        rolled = None if done else iso(day)
        rows.append((
            "p%05d" % i, "task %d" % i, ("note %d" % i) if i % 25 == 0 else None,
            "day", iso(day), iso(day), None, done, done_at,
            (i % 7) if not done else 0, rolled, i, 0,
            "%sT08:00:00" % iso(day), "%sT08:00:00" % iso(day),
        ))
    con.executemany(
        "INSERT INTO tasks (id,title,note,bucket,plan_date,first_seen_date,due_at,done,done_at,"
        "roll_count,last_rolled_at,sort_order,deleted,created_at,updated_at) "
        "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", rows,
    )
    con.commit()
    return con


def timed(con, start, end, prev_start, prev_end):
    t0 = time.perf_counter()
    det = con.execute(DETAIL, ("%sT00:00:00" % start, "%sT23:59:59" % end)).fetchall()
    prev = con.execute(PREV, ("%sT00:00:00" % prev_start, "%sT23:59:59" % prev_end)).fetchone()[0]
    rolled = con.execute(ROLLED, (prev_start, end)).fetchall()
    backlog = con.execute(BACKLOG).fetchone()[0]
    undated = con.execute(UNDATED).fetchone()[0]
    ms = (time.perf_counter() - t0) * 1000
    return ms, len(det), prev, len(rolled), backlog, undated


def main():
    con = build()
    total = con.execute("SELECT COUNT(*) FROM tasks").fetchone()[0]
    done = con.execute("SELECT COUNT(*) FROM tasks WHERE done=1").fetchone()[0]
    print("fixture: %s  tasks=%d  done=%d" % (DB, total, done))
    print()

    cases = [
        ("365 天（按周聚合）", "2024-11-01", "2025-10-31", 365),
        ("3 年（按月聚合）", "2023-01-01", "2025-12-31", 1096),
        ("30 天（按天聚合）", "2025-10-02", "2025-10-31", 30),
    ]
    worst = 0.0
    for name, start, end, days in cases:
        from datetime import date, timedelta
        s = date.fromisoformat(start)
        e = date.fromisoformat(end)
        span = (e - s).days + 1
        prev_end = s - timedelta(days=1)
        prev_start = prev_end - timedelta(days=span - 1)
        samples = []
        last = None
        for _ in range(REPEATS):
            ms, *info = timed(con, start, end, prev_start.isoformat(), prev_end.isoformat())
            samples.append(ms)
            last = info
        med = statistics.median(samples)
        worst = max(worst, med)
        print("%-22s span=%4d 天  median=%6.1f ms  (min %.1f / max %.1f)" % (name, span, med, min(samples), max(samples)))
        print("   detail=%d prevDone=%d rolled=%d backlog=%d undated=%d" % tuple(last))
    print()
    con.close()

    limit_365 = 500.0
    limit_long = 800.0
    ok = worst <= limit_long
    print("SQL 段最差中位数 = %.1f ms（SC-005 阈值：365 天内 500ms、>365 天 800ms）" % worst)
    print("RESULT: " + ("OK" if ok else "SLOW") + " —— 注意这是数据层耗时，界面合成开销见 perf_agg.mjs 与人工验收")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
