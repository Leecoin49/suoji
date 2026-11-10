"""Seed a plausible fortnight of work so the review panel and the repeating rules
have something to show. Deterministic: re-running produces the same data.

    python specs/008-recurring/verify/seed_demo.py --db %APPDATA%\\com.tool.suoji\\suoji.db
"""

import argparse
import random
import sqlite3
import uuid
from datetime import datetime, timedelta

PROJECTS = [
    ("p-content", "内容创作", ["选题", "写初稿", "配图", "发布"]),
    ("p-office", "部门内务", ["周报汇总", "归档"]),
    ("p-coop", "协同项目", ["对接需求", "评审"]),
]
TAGS = ["写稿", "改稿", "开会", "数据", "约稿"]

# titles that recur in the history, with how many per week they tend to happen
HISTORY = [
    ("写稿：AI 工具怎么选", "p-content", 1, ["写稿"], 2),
    ("写稿：把周报写成故事", "p-content", 1, ["写稿"], 2),
    ("改稿：上个月那篇长文", "p-content", 2, ["改稿"], 1),
    ("配图：封面三张备选", "p-content", 2, [], 1),
    ("周会：这周排期", None, None, ["开会"], 1),
    ("周报：本周进展汇总", "p-office", 0, ["数据"], 1),
    ("对接：客户 A 的第二版需求", "p-coop", 0, ["约稿"], 1),
    ("评审：方案初稿过一遍", "p-coop", 1, ["开会"], 1),
    ("整理素材库", None, None, [], 1),
    ("回邮件、清收件箱", None, None, [], 2),
]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", required=True)
    ap.add_argument("--days", type=int, default=70)
    args = ap.parse_args()

    rng = random.Random(20261110)
    conn = sqlite3.connect(args.db)
    cur = conn.cursor()
    now = datetime.now()
    today = now.strftime("%Y-%m-%d")
    iso = lambda d: d.strftime("%Y-%m-%dT%H:%M:%S")

    def add_task(title, bucket, plan, done_at, project, node, tags, note=None,
                 rolls=0, first=None, due=None, deleted=0):
        tid = str(uuid.uuid4())
        cur.execute(
            "INSERT INTO tasks(id,title,note,bucket,plan_date,first_seen_date,due_at,done,"
            "done_at,roll_count,last_rolled_at,sort_order,deleted,created_at,updated_at,"
            "project_id,node_id,recurrence_id,occurrence_date) "
            "VALUES(?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,?,?,NULL,NULL)",
            (tid, title, note, bucket, plan, first or plan, due, 1 if done_at else 0,
             done_at, rolls, plan if rolls else None, deleted,
             iso(datetime.now() - timedelta(days=args.days)), iso(datetime.now()),
             project, node),
        )
        for name in tags:
            cur.execute(
                "INSERT OR IGNORE INTO task_tags(task_id, tag_id) SELECT ?, id FROM tags WHERE name = ?",
                (tid, name),
            )
        return tid

    # keep whatever the user already had; only add on top
    for pid, name, steps in PROJECTS:
        cur.execute(
            "INSERT OR IGNORE INTO projects(id,name,archived,sort_order,created_at,updated_at) "
            "VALUES(?,?,0,0,?,?)",
            (pid, name, iso(now), iso(now)),
        )
        for i, step in enumerate(steps):
            nid = f"n-{pid[2:]}-{i}"
            cur.execute(
                "INSERT OR IGNORE INTO nodes(id,project_id,title,note,done,sort_order,created_at,updated_at) "
                "VALUES(?,?,?,NULL,?,-?+100,?,?)",
                (nid, pid, step, 1 if i == 0 else 0, i, iso(now), iso(now)),
            )
    for name in TAGS:
        cur.execute("INSERT OR IGNORE INTO tags(id,name,created_at) VALUES(?,?,?)",
                    (str(uuid.uuid4()), name, iso(now)))

    # ---- history: a plausible working rhythm over the past weeks
    for back in range(args.days, 0, -1):
        day = now - timedelta(days=back)
        weekday = day.weekday()  # 0 = Monday
        if weekday >= 5 and rng.random() < 0.7:
            continue  # most weekends stay quiet
        for title, project, node_idx, tags, per_week in HISTORY:
            chance = per_week / 5.0
            if rng.random() > chance:
                continue
            node = f"n-{project[2:]}-{node_idx}" if project and node_idx is not None else None
            hour = rng.choice([9, 10, 11, 14, 15, 16, 17, 20])
            minute = rng.choice([5, 12, 23, 31, 44, 52])
            done = day.replace(hour=hour, minute=minute, second=0)
            add_task(title, "today", day.strftime("%Y-%m-%d"), iso(done), project, node, tags,
                     note="演示数据" if rng.random() < 0.2 else None)

    # ---- two completions with no recorded time (exercises the "undated" line)
    for title in ("口头答应的小事", "临时改的一个标题"):
        add_task(title, "today", today, None, None, None, [])
        cur.execute("UPDATE tasks SET done = 1, done_at = NULL WHERE title = ?", (title,))

    # ---- today: a few open things, two of them visibly stuck
    add_task("把季度复盘的数据拉齐", "today", today, None, "p-office", "n-office-0", ["数据"],
             note="等财务那边给表")
    add_task("给新同事讲一遍录入习惯", "today", today, None, "p-coop", "n-coop-0", ["开会"])
    add_task("改第三版的封面文案", "today", today, None, "p-content", "n-content-2", ["改稿"],
             rolls=5, first=(now - timedelta(days=9)).strftime("%Y-%m-%d"))
    add_task("整理上个月的发票", "today", today, None, None, None, [],
             rolls=3, first=(now - timedelta(days=12)).strftime("%Y-%m-%d"))
    add_task("想一下下个月的选题方向", "inbox", None, None, "p-content", "n-content-0", ["写稿"])
    add_task("问问设计要不要换个字体", "inbox", None, None, None, None, [])

    # ---- repeating rules; today's runs are spawned by the app on its next refresh
    rules = [
        ("写日报", "p-office", "n-office-0", "daily", "", None),
        ("倒垃圾", None, None, "weekly", "1,3,5", None),
        ("交社保", None, None, "monthly", "", 15),
        ("汇总本周稿件", "p-content", "n-content-3", "weekly", "5", None),
    ]
    for title, project, node, kind, days, month_day in rules:
        cur.execute(
            "INSERT INTO recurrences(id,title,project_id,node_id,kind,days,month_day,archived,"
            "created_at,updated_at) VALUES(?,?,?,?,?,?,?,0,?,?)",
            (str(uuid.uuid4()), title, project, node, kind, days or None, month_day, iso(now), iso(now)),
        )

    # ---- a closing note so the morning line has something to say
    for back in (1, 2):
        day = (now - timedelta(days=back)).strftime("%Y-%m-%d")
        cur.execute(
            "INSERT OR REPLACE INTO day_notes(date,note,created_at) VALUES(?,?,?)",
            (day, "明天先把封面定下来，别再拖了。", iso(now)),
        )

    conn.commit()
    print("tasks", cur.execute("select count(*) from tasks").fetchone()[0])
    print("done", cur.execute("select count(*) from tasks where done=1").fetchone()[0])
    print("projects", cur.execute("select count(*) from projects").fetchone()[0])
    print("nodes", cur.execute("select count(*) from nodes").fetchone()[0])
    print("tags", cur.execute("select count(*) from tags").fetchone()[0])
    print("rules", cur.execute("select count(*) from recurrences").fetchone()[0])
    conn.close()


if __name__ == "__main__":
    main()
