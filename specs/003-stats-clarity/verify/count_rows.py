"""只读盘点：打印三张表的行数与库文件字节数，绝不写库。

用法:
    python specs\\003-stats-clarity\\verify\\count_rows.py [db_path]

默认 db_path = %APPDATA%\\com.tool.suoji\\suoji.db
连接串使用 mode=ro，任何写入都会立刻报 "attempt to write a readonly database"。
"""

from __future__ import annotations

import os
import sqlite3
import sys

TABLES = ("tasks", "meta", "day_notes")


def default_db() -> str:
    appdata = os.environ.get("APPDATA")
    if not appdata:
        raise SystemExit("APPDATA 未设置，请显式传入 db 路径")
    return os.path.join(appdata, "com.tool.suoji", "suoji.db")


def main() -> int:
    db = sys.argv[1] if len(sys.argv) > 1 else default_db()
    if not os.path.exists(db):
        print(f"missing: {db}")
        return 1

    uri = f"file:{db}?mode=ro"
    conn = sqlite3.connect(uri, uri=True)
    try:
        print(f"db      : {db}")
        print(f"bytes   : {os.path.getsize(db)}")
        names = {
            r[0]
            for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
        }
        for table in TABLES:
            if table not in names:
                print(f"{table:<9}: (absent)")
                continue
            count = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            print(f"{table:<9}: {count}")
        extra = sorted(names - set(TABLES) - {"sqlite_sequence"})
        if extra:
            print(f"other   : {', '.join(extra)}")
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
