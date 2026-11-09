"""005 + 006 的迁移与链路自检（只读）。

用法：
    python specs/005-project-tags/verify/after_check.py

读的是真实库 `%APPDATA%\\com.tool.suoji\\suoji.db`（只读连接），打印：
  - PRAGMA user_version / meta.schema_version
  - 表清单、tasks 的列名与顺序（必须与迁移前一致，且 project_id 追加在末尾）
  - 三张原表行数（必须与 db-before 一致）、nodes 行数
  - task_tags / projects / tags 的索引
"""

from __future__ import annotations

import os
import sqlite3
import sys

DB = os.path.expandvars(r"%APPDATA%\com.tool.suoji\suoji.db")


def main() -> int:
    if not os.path.exists(DB):
        print(f"库不存在：{DB}")
        return 2

    conn = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row

    print(f"db: {DB} ({os.path.getsize(DB)} bytes)")
    print("integrity:", conn.execute("pragma integrity_check").fetchone()[0])
    print("user_version:", conn.execute("pragma user_version").fetchone()[0])

    tables = [r[0] for r in conn.execute("select name from sqlite_master where type='table' order by name")]
    print("tables:", ", ".join(tables))

    version = None
    try:
        row = conn.execute("select value from meta where key='schema_version'").fetchone()
        version = row[0] if row else None
    except sqlite3.Error as exc:  # pragma: no cover - 只有极旧库才会走到
        print("schema_version 读取失败:", exc)
    print("meta.schema_version:", version)

    cols = [r[1] for r in conn.execute("pragma table_info(tasks)")]
    print(f"tasks 列（{len(cols)}）:", ", ".join(cols))
    print("project_id 追加在末尾:", cols[-1] == "project_id" if cols else False)

    for table in ("tasks", "meta", "day_notes", "nodes", "projects", "tags", "task_tags"):
        if table in tables:
            print(f"{table} 行数:", conn.execute(f"select count(*) from {table}").fetchone()[0])

    indexes = [r[0] for r in conn.execute("select name from sqlite_master where type='index' and name not like 'sqlite_%' order by name")]
    print("indexes:", ", ".join(indexes))

    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
