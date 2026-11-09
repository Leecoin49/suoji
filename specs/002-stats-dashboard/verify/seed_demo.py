"""为「复盘」面板手动验收（T018 / T031）造一份演示库。

用法（先关掉琐记，别在应用运行时换库）：

    python specs/002-stats-dashboard/verify/seed_demo.py --out D:\\tmp\\demo.db
    # 备份真实库 -> 用 demo.db 覆盖 %APPDATA%\\com.tool.suoji\\suoji.db -> 启动应用
    # 看完再用备份覆盖回去

造出来的数据覆盖这些展示分支：
  * 近 90 天每天 0–6 件不等的完成记录（有 0 件的空柱、有连续 9 天不断档）；
  * 上一段同样长的 90 天只有 60 件 → 环比「比上一段少」；
  * 2 条 done=1 但 done_at 为空 → 「其中 N 件没留完成时间」；
  * 5 条被推后过的未完成任务（roll_count 7/4/3/2/1，last_rolled_at 在区间内）→ 推后榜；
    另加 1 条 last_rolled_at 在区间外、1 条 deleted=1，用来验证不会误入榜；
  * 6 条未完成（今天 3 条 + 收件箱 3 条）→ 「此刻还有 N 件没做完」与「今天」页不空；
  * 3 天 day_notes，避免其他页面显得太空。

幂等：每次都重建，固定随机种子，同一台机器同一天跑出来一样。
"""

import argparse
import os
import random
import sqlite3
import uuid
from datetime import date, datetime, timedelta

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
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS day_notes (
  date       TEXT PRIMARY KEY,
  note       TEXT NOT NULL,
  created_at TEXT NOT NULL
);
"""

TITLES = [
    "改完登录页的 tab 顺序", "补上导出的二次确认", "回邮件：合同附件", "整理这周的会议纪要",
    "跑步 5 公里", "读完《慢思考》第三章", "给复盘面板加空态", "把今天的三件事写进本子",
    "和 Moka 对齐接口字段", "修 build 脚本的编码问题", "买猫粮", "写周报",
    "给数据库补齐索引", "看完《大明王朝》两集", "清理桌面上的临时文件", "把昨天的 bug 复现一遍",
    "跟客户确认交付日期", "review PR #128", "整理书签", "写周末复盘",
    "改早上提醒的时间", "补两条测试用例", "画结算流程图", "打电话给快递",
    "对账 10 月支出", "备份照片", "修输入框的 focus 样式", "读 spec-kit 的文档",
    "和家里视频", "整理下个月的日程", "把收件箱清空", "看论文摘要",
    "调时区那个 bug", "整理素材库", "读那篇长文", "升级依赖",
    "拆一个需求", "写发布公告", "修按钮 hover 态", "清空回收站",
    "看行业新闻", "把想法记成一句话", "试新键盘手感", "整理 git 历史",
    "回微信里的三件事", "核对发票", "看录播课第 4 讲", "写明天的待办",
]

NOTES = [
    "卡在设计稿上，明天接着弄", "顺手做的，不算今天的大头", "比想的久",
    "终于收尾了", "中间被打断两次", "下次拆小一点",
]

ROLLED = [
    ("把季度总结写完", 7), ("整理旧项目的 README", 4), ("给日历加导入", 3),
    ("回复那封长邮件", 2), ("修那个偶发的滚动偏移", 1),
]
BACKLOG_TODAY = ["把复盘面板的空态补上", "确认下周三的评审时间", "给妈妈打电话"]
BACKLOG_INBOX = ["看 Tauri 2 的窗口权限文档", "整理硬盘里的旧安装包", "想清楚 F004 导出格式"]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="输出的 db 路径")
    ap.add_argument("--days", type=int, default=90, help="主区间天数（默认 90）")
    args = ap.parse_args()

    out = os.path.abspath(args.out)
    if os.path.exists(out):
        os.remove(out)

    today = date.today()
    rng = random.Random(20261106)

    # 每天的完成件数：近 9 天不断档（凑出连续天数），第 30–33 天断档，周末偏少
    counts = []
    for off in range(args.days):
        d = today - timedelta(days=off)
        n = rng.choice([0, 1, 2, 3, 4, 5, 6])
        if off <= 8:
            n = max(n, 1)
        if 30 <= off <= 33:
            n = 0
        if d.weekday() >= 5 and rng.random() < 0.6:
            n = 0
        counts.append(n)

    conn = sqlite3.connect(out)
    conn.executescript(SCHEMA)
    now = datetime.now().replace(microsecond=0)

    rows = []
    title_i = 0

    for off, n in enumerate(counts):
        day = today - timedelta(days=off)
        for k in range(n):
            title = TITLES[title_i % len(TITLES)]
            title_i += 1
            hour = 8 + (k * 3 + rng.randrange(0, 2)) % 14
            minute = rng.randrange(0, 60)
            stamp = f"{day.isoformat()}T{hour:02d}:{minute:02d}:00"
            note = NOTES[rng.randrange(0, len(NOTES))] if rng.random() < 0.22 else None
            rows.append((
                uuid.uuid4().hex, title, note, "today", day.isoformat(), day.isoformat(),
                None, 1, stamp, 0, None, k, 0, stamp, stamp,
            ))

    # 上一段同样长的时间：60 件，用来做环比
    prev_offsets = list(range(args.days, args.days * 2))
    rng.shuffle(prev_offsets)
    for off in sorted(prev_offsets[:60]):
        day = today - timedelta(days=off)
        stamp = f"{day.isoformat()}T{rng.randrange(9, 21):02d}:{rng.randrange(0, 60):02d}:00"
        rows.append((
            uuid.uuid4().hex, TITLES[title_i % len(TITLES)], None, "today",
            day.isoformat(), day.isoformat(), None, 1, stamp, 0, None, 0, 0, stamp, stamp,
        ))
        title_i += 1

    # 有完成、但没留完成时刻的两条
    for off in (12, 47):
        day = today - timedelta(days=off)
        stamp = f"{day.isoformat()}T20:00:00"
        rows.append((
            uuid.uuid4().hex, "那天做完但忘了记时间的事", None, "today",
            day.isoformat(), day.isoformat(), None, 1, None, 0, None, 0, 0, stamp, stamp,
        ))

    # 被推后过的未完成任务：入榜
    for i, (title, count) in enumerate(ROLLED):
        rolled_at = (today - timedelta(days=i + 1)).isoformat()
        created = (today - timedelta(days=30 + i)).isoformat()
        rows.append((
            uuid.uuid4().hex, title, "老是排在最后", "today", None, None, None,
            0, None, count, rolled_at, i, 0, f"{created}T09:00:00", f"{rolled_at}T22:00:00",
        ))

    # 区间外推后过、已删除的：不该入榜
    outside = (today - timedelta(days=200)).isoformat()
    rows.append((
        uuid.uuid4().hex, "很久以前被推后过的事", None, "inbox", None, None, None,
        0, None, 9, outside, 0, 0, f"{outside}T09:00:00", f"{outside}T22:00:00",
    ))
    rows.append((
        uuid.uuid4().hex, "删掉的、推后过很多次的事", None, "today", None, None, None,
        0, None, 12, (today - timedelta(days=2)).isoformat(), 0, 1,
        f"{outside}T09:00:00", f"{(today - timedelta(days=2)).isoformat()}T22:00:00",
    ))

    # 现在还没做完的：今天 3 条 + 收件箱 3 条
    for i, title in enumerate(BACKLOG_TODAY):
        stamp = f"{today.isoformat()}T08:{30 + i:02d}:00"
        rows.append((
            uuid.uuid4().hex, title, None, "today", today.isoformat(), today.isoformat(),
            None, 0, None, 0, None, i, 0, stamp, stamp,
        ))
    for i, title in enumerate(BACKLOG_INBOX):
        stamp = f"{(today - timedelta(days=i + 1)).isoformat()}T21:10:00"
        rows.append((
            uuid.uuid4().hex, title, None, "inbox", None, None, None,
            0, None, 0, None, i, 0, stamp, stamp,
        ))

    conn.executemany(
        "INSERT INTO tasks(id,title,note,bucket,plan_date,first_seen_date,due_at,done,done_at,"
        "roll_count,last_rolled_at,sort_order,deleted,created_at,updated_at) "
        "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        rows,
    )

    # meta：把自动流转的时间点都设成今天，避免启动时顺延/结账改写数据
    meta = {
        "morning_time": "09:00",
        "evening_time": "17:25",
        "hotkey": "Ctrl+Alt+Space",
        "autostart": "0",
        "last_morning": today.isoformat(),
        "last_evening": today.isoformat(),
        "last_rollover": today.isoformat(),
        "closed_out_date": today.isoformat(),
    }
    conn.executemany("INSERT INTO meta(key,value) VALUES(?,?)", list(meta.items()))

    notes = {
        (today - timedelta(days=1)).isoformat(): "今天效率还行，但下午被会议切碎了。",
        (today - timedelta(days=3)).isoformat(): "早上先做了最难的那件，后面就轻松了。",
        (today).isoformat(): "上午改代码，下午开会，晚上补复盘。",
    }
    conn.executemany(
        "INSERT INTO day_notes(date,note,created_at) VALUES(?,?,?)",
        [(k, v, f"{k}T22:40:00") for k, v in notes.items()],
    )

    conn.commit()

    done_dated = conn.execute(
        "SELECT COUNT(*) FROM tasks WHERE done=1 AND deleted=0 AND done_at IS NOT NULL"
    ).fetchone()[0]
    undated = conn.execute(
        "SELECT COUNT(*) FROM tasks WHERE done=1 AND deleted=0 AND done_at IS NULL"
    ).fetchone()[0]
    backlog = conn.execute(
        "SELECT COUNT(*) FROM tasks WHERE done=0 AND deleted=0"
    ).fetchone()[0]
    conn.close()

    print(f"写出 {out}")
    print(f"  总任务 {len(rows)} 行：完成且有时刻 {done_dated}、完成无时刻 {undated}、未完成 {backlog}")
    print(f"  区间 {args.days} 天（{(today - timedelta(days=args.days - 1)).isoformat()} → {today.isoformat()}）")
    print(f"  顺手：{now.isoformat(timespec='seconds')}")


if __name__ == "__main__":
    main()
