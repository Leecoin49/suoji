"""为 005/006 演示插入少量样例完成记录（笔记里标了「演示数据」）。

幂等：再次运行会先删掉上一次插入的演示行（note = '演示数据'）。
清端点：`python specs\005-project-tags\verify\seed_demo.py --clean`
"""

from __future__ import annotations

import os
import sqlite3
import sys
import uuid
from datetime import date, datetime, timedelta

DB = os.path.expandvars(r"%APPDATA%\com.tool.suoji\suoji.db")
MARK = "演示数据"

PROJECTS = ["写稿计划", "部门内务", "协同项目"]
TAGS = ["写稿", "约稿", "开会", "排版"]

# (项目索引, 标签索引, 标题, 距今天数, 小时, 分钟)
ROWS = [
    (0, [0], "写小红书文案（秋招季）", 0, 10, 12),
    (0, [0], "写公众号推文：复盘方法", 0, 15, 40),
    (0, [0, 1], "改约稿提纲", 1, 9, 20),
    (1, [2], "周会纪要整理", 1, 14, 5),
    (1, [], "报销单整理", 2, 11, 30),
    (0, [0], "写产品说明初稿", 3, 16, 10),
    (2, [3], "和设计的排版对齐", 4, 10, 45),
    (0, [0, 1], "给客户的稿子改第二版", 6, 17, 20),
    (1, [2], "月度例会", 8, 10, 0),
    (0, [0], "写内部分享稿", 10, 15, 15),
    (2, [1], "催供应商报价", 13, 9, 40),
    (1, [], "整理工位", 16, 18, 5),
    (0, [0], "写季度总结", 20, 14, 30),
    (0, [0], "写选题清单", 24, 10, 25),
]


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    return conn


def ensure(conn: sqlite3.Connection, table: str, name: str) -> str:
    row = conn.execute(f"select id from {table} where lower(trim(name)) = lower(trim(?1))", (name,)).fetchone()
    if row:
        return row[0]
    new_id = str(uuid.uuid4())
    stamp = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")
    if table == "projects":
        conn.execute(
            "insert into projects(id, name, archived, created_at, updated_at) values(?1, ?2, 0, ?3, ?3)",
            (new_id, name, stamp),
        )
    else:
        conn.execute("insert into tags(id, name, created_at) values(?1, ?2, ?3)", (new_id, name, stamp))
    return new_id


def clean(conn: sqlite3.Connection) -> int:
    ids = [r[0] for r in conn.execute("select id from tasks where note = ?1", (MARK,))]
    for tid in ids:
        conn.execute("delete from task_tags where task_id = ?1", (tid,))
        conn.execute("delete from tasks where id = ?1", (tid,))
    conn.commit()
    return len(ids)


def main() -> int:
    conn = connect()
    removed = clean(conn)
    if "--clean" in sys.argv:
        print(f"已清除 {removed} 条演示记录")
        return 0

    project_ids = [ensure(conn, "projects", n) for n in PROJECTS]
    tag_ids = [ensure(conn, "tags", n) for n in TAGS]

    today = date.today()
    for idx, (pidx, tix, title, days_ago, hour, minute) in enumerate(ROWS):
        when = datetime.combine(today - timedelta(days=days_ago), datetime.min.time()).replace(
            hour=hour, minute=minute
        )
        stamp = when.strftime("%Y-%m-%dT%H:%M:%S")
        tid = str(uuid.uuid4())
        conn.execute(
            "insert into tasks(id, title, note, bucket, plan_date, first_seen_date, due_at, done, done_at,"
            " roll_count, last_rolled_at, sort_order, deleted, created_at, updated_at, project_id)"
            " values(?1, ?2, ?3, 'today', ?4, ?4, null, 1, ?5, 0, null, ?6, 0, ?5, ?5, ?7)",
            (tid, title, MARK, when.strftime("%Y-%m-%d"), stamp, idx, project_ids[pidx]),
        )
        for t in tix:
            conn.execute("insert or ignore into task_tags(task_id, tag_id) values(?1, ?2)", (tid, tag_ids[t]))

    conn.commit()
    print(f"已写入 {len(ROWS)} 条演示记录（项目 {len(project_ids)} 个 / 标签 {len(tag_ids)} 个）")
    print("清理：python .pi\\seed_demo_005.py --clean")
    return 0


if __name__ == "__main__":
    sys.exit(main())
