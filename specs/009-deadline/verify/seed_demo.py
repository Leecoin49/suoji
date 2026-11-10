"""Seed a realistic, non-repeating body of work so the panels have something to chew on.

Every title is unique (built from action × subject pairs, dealt without replacement),
so lists, the review panel and the record sheet can all be judged on real-looking data.

    python specs/009-deadline/verify/seed_demo.py --db %APPDATA%\\com.tool.suoji\\suoji.db

Deterministic: the same seed always produces the same database.
Existing rows are left alone; nothing is overwritten.
"""

import argparse
import random
import sqlite3
import uuid
from datetime import datetime, timedelta

# ---------------------------------------------------------------- vocabulary

ACTIONS = [
    "写", "改", "审", "对接", "整理", "校对",
    "归档", "复盘", "画", "拆", "汇总", "跟进",
]

SUBJECTS = [
    "季度增长复盘", "新版首页文案", "客户 A 的验收单", "供应链对账表", "年中汇报提纲",
    "竞品定价对比", "小程序启动页", "招聘 JD 草稿", "团建预算方案", "数据看板口径",
    "投稿作者的结算", "品牌视觉规范", "客服话术模板", "月度经营会材料", "接口联调说明",
    "旧系统迁移清单", "用户访谈提纲", "投放素材排期", "内容日历", "周会纪要",
    "培训课件大纲", "渠道返点核对", "合同续签材料", "新品发布节奏", "异常订单排查",
    "会员权益说明", "社媒选题池", "包装打样反馈", "销售预测模型", "内训报名表",
    "季度 OKR 对齐", "供应商准入表", "海外站翻译稿", "活动落地页", "仓库盘点结果",
    "客诉分类规则", "招聘面试记录", "版本发布检查表", "增长实验结论", "知识库目录",
]

PROJECTS = [
    ("p-content", "内容创作", ["选题", "采写", "编辑", "发布"]),
    ("p-office", "部门内务", ["周报", "归档", "预算"]),
    ("p-coop", "协同项目", ["需求", "评审", "交付"]),
    ("p-grow", "增长实验", ["假设", "投放", "复盘"]),
    ("p-brand", "品牌视觉", ["方向", "打样", "定稿"]),
]

TAGS = ["写稿", "改稿", "开会", "数据", "对接", "设计", "采购", "复盘"]

# thing → (project, step index, tags, times per fortnight)
RECIPE = {
    "写": ("p-content", 1, ["写稿"], 4),
    "改": ("p-content", 2, ["改稿"], 3),
    "审": ("p-coop", 1, ["开会"], 3),
    "对接": ("p-coop", 0, ["对接"], 3),
    "整理": ("p-office", 1, ["数据"], 2),
    "校对": ("p-content", 2, ["改稿"], 2),
    "归档": ("p-office", 1, [], 1),
    "复盘": ("p-grow", 2, ["复盘"], 2),
    "画": ("p-brand", 1, ["设计"], 2),
    "拆": ("p-grow", 0, [], 2),
    "汇总": ("p-office", 0, ["数据"], 2),
    "跟进": ("p-coop", 2, ["对接"], 3),
}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", required=True)
    ap.add_argument("--days", type=int, default=120)
    ap.add_argument("--seed", type=int, default=20261110)
    args = ap.parse_args()

    rng = random.Random(args.seed)
    conn = sqlite3.connect(args.db)
    cur = conn.cursor()
    now = datetime.now()
    today = now.strftime("%Y-%m-%d")
    iso = lambda d: d.strftime("%Y-%m-%dT%H:%M:%S")

    # ---- every title used exactly once
    pool = [(a, s) for a in ACTIONS for s in SUBJECTS]
    rng.shuffle(pool)
    used: set[str] = set()

    def next_title(action_filter=None):
        for i, (action, subject) in enumerate(pool):
            if action_filter and action != action_filter:
                continue
            title = f"{action}{subject}"
            if title in used:
                continue
            used.add(title)
            pool.pop(i)
            return title
        return None

    for pid, name, steps in PROJECTS:
        cur.execute(
            "INSERT OR IGNORE INTO projects(id,name,archived,sort_order,created_at,updated_at) "
            "VALUES(?,?,0,0,?,?)",
            (pid, name, iso(now), iso(now)),
        )
        for i, step in enumerate(steps):
            cur.execute(
                "INSERT OR IGNORE INTO nodes(id,project_id,title,note,done,sort_order,created_at,updated_at) "
                "VALUES(?,?,?,NULL,?,?,?,?)",
                (f"n-{pid[2:]}-{i}", pid, step, 1 if i == 0 else 0, i, iso(now), iso(now)),
            )
    for name in TAGS:
        cur.execute(
            "INSERT OR IGNORE INTO tags(id,name,created_at) VALUES(?,?,?)",
            (str(uuid.uuid4()), name, iso(now)),
        )

    def add(title, bucket, plan, done_at, project, node, tags, note=None,
            rolls=0, first=None, deadline=None):
        tid = str(uuid.uuid4())
        cur.execute(
            "INSERT INTO tasks(id,title,note,bucket,plan_date,first_seen_date,due_at,done,done_at,"
            "roll_count,last_rolled_at,sort_order,deleted,created_at,updated_at,project_id,node_id,"
            "recurrence_id,occurrence_date,deadline) "
            "VALUES(?,?,?,?,?,?,NULL,?,?,?,?,0,0,?,?,?,?,NULL,NULL,?)",
            (
                tid, title, note, bucket, plan, first or plan,
                1 if done_at else 0, done_at, rolls,
                plan if rolls else None,
                iso(now - timedelta(days=args.days)), iso(now),
                project, node, deadline,
            ),
        )
        for name in tags:
            cur.execute(
                "INSERT OR IGNORE INTO task_tags(task_id,tag_id) SELECT ?,id FROM tags WHERE name=?",
                (tid, name),
            )
        return tid

    # ---- history: a working rhythm, nothing finished twice
    finished = 0
    for back in range(args.days, 0, -1):
        day = (now - timedelta(days=back))
        if day.weekday() >= 5 and rng.random() < 0.75:
            continue
        for _ in range(rng.choice([1, 2, 2, 3, 3, 4])):
            action = rng.choice(ACTIONS)
            project, step, tags, _rate = RECIPE[action]
            title = next_title(action)
            if not title:
                break
            hour = rng.choice([9, 10, 11, 13, 14, 15, 16, 17, 21])
            done = day.replace(hour=hour, minute=rng.choice([4, 11, 17, 26, 38, 47, 58]), second=0)
            deadline = None
            if rng.random() < 0.45:  # most finished work carried a deadline
                deadline = (done + timedelta(days=rng.choice([-1, 0, 0, 1, 2]))).strftime("%Y-%m-%dT%H:%M")
            add(
                title,
                "today",
                day.strftime("%Y-%m-%d"),
                iso(done),
                project,
                f"n-{project[2:]}-{step}",
                tags,
                note="和对方敲定后再发一版" if rng.random() < 0.12 else None,
                deadline=deadline,
            )
            finished += 1

    # ---- two completions whose clock never got recorded
    for _ in range(2):
        title = next_title()
        add(title, "today", today, None, None, None, [])
        cur.execute("UPDATE tasks SET done=1, done_at=NULL WHERE title=?", (title,))

    # ---- today: the real board, deadlines on purpose
    soon = lambda days, hh, mm=0: (now + timedelta(days=days)).replace(hour=hh, minute=mm, second=0).strftime("%Y-%m-%dT%H:%M")

    today_plan = [
        ("p-office", 0, {"deadline": soon(0, 18, 0)}, 0, []),          # due today 18:00
        ("p-coop", 0, {"deadline": soon(-1, 17, 0)}, 0, []),           # one day late
        ("p-content", 1, {"deadline": soon(-3, 15, 30)}, 0, []),       # three days late
        ("p-grow", 1, {"deadline": soon(2, 12, 0)}, 0, []),            # in two days
        ("p-brand", 2, {"deadline": soon(6, 9, 0)}, 0, []),            # later
        ("p-content", 3, {}, 0, []),
        ("p-coop", 2, {"deadline": soon(1, 10, 30)}, 0, []),           # tomorrow
        ("p-grow", 2, {}, 4, []),                                      # pushed 4 times
        ("p-office", 1, {"deadline": soon(-7, 23, 59)}, 6, []),        # a week late, 6 pushes
    ]
    for project, step, meta, rolls, tags in today_plan:
        title = next_title()
        add(
            title, "today", today, None, project, f"n-{project[2:]}-{step}", tags,
            note=meta.get("note"), rolls=rolls,
            first=(now - timedelta(days=rolls + 2)).strftime("%Y-%m-%d"),
            deadline=meta.get("deadline"),
        )

    # ---- inbox: the pile you have not decided about yet
    for _ in range(8):
        project, step, tags, _ = RECIPE[rng.choice(ACTIONS)]
        title = next_title()
        add(title, "inbox", None, None, project if rng.random() < 0.5 else None,
            f"n-{project[2:]}-{step}" if rng.random() < 0.35 else None, tags)

    # ---- repeating rules; today's runs are spawned by the app on next refresh
    for title, project, step, kind, days, month_day in [
        ("写日报", "p-office", 0, "daily", "", None),
        ("倒垃圾、擦桌子", None, None, "weekly", "1,3,5", None),
        ("交社保", None, None, "monthly", "", 15),
        ("汇总本周稿件", "p-content", 3, "weekly", "5", None),
        ("周一排期会", "p-coop", 0, "weekly", "1", None),
    ]:
        cur.execute(
            "INSERT INTO recurrences(id,title,project_id,node_id,kind,days,month_day,archived,"
            "created_at,updated_at) VALUES(?,?,?,?,?,?,?,0,?,?)",
            (str(uuid.uuid4()), title, project,
             f"n-{project[2:]}-{step}" if project else None,
             kind, days or None, month_day, iso(now), iso(now)),
        )

    for back in (1, 2):
        day = (now - timedelta(days=back)).strftime("%Y-%m-%d")
        cur.execute(
            "INSERT OR REPLACE INTO day_notes(date,note,created_at) VALUES(?,?,?)",
            (day, "把封面定下来，别又拖到下周。", iso(now)),
        )

    conn.commit()
    print("tasks", cur.execute("select count(*) from tasks").fetchone()[0],
          "| finished", cur.execute("select count(*) from tasks where done=1").fetchone()[0],
          "| open today", cur.execute("select count(*) from tasks where done=0 and deleted=0 and bucket='today'").fetchone()[0],
          "| inbox", cur.execute("select count(*) from tasks where bucket='inbox' and deleted=0").fetchone()[0],
          "| with deadline", cur.execute("select count(*) from tasks where deadline is not null").fetchone()[0],
          "| unique titles", cur.execute("select count(distinct title) from tasks").fetchone()[0])
    conn.close()


if __name__ == "__main__":
    main()
