# Quickstart: 统计看板验收手册

**Feature**: `specs/002-stats-dashboard/spec.md` | **Plan**: [plan.md](./plan.md) | **Contracts**: [contracts/ipc-get-stats.md](./contracts/ipc-get-stats.md)

这是**验收跑单**，不是实现说明。实现细节在 `tasks.md`；数据形状看 [data-model.md](./data-model.md)。

## 0. 前置

| 项 | 值 |
|---|---|
| 工作目录 | 仓库根（`D:\Users\songlk2\Desktop\Tool\suoji`） |
| Node / 包管理 | Node 22（`.nvmrc`）、`pnpm@8.15.9` |
| 数据库文件 | `%APPDATA%\com.tool.suoji\suoji.db`（`src-tauri/src/db.rs:42-44`：`app.path().app_data_dir()?.join("suoji.db")`） |
| 造数工具 | Python 3（自带 `sqlite3`，本机 `C:\Users\songlk2\AppData\Local\Programs\Python\Python38\python.exe`），**不引入任何新依赖** |
| 启动 | `pnpm tauri dev`（`package.json` 的 `tauri` 脚本） |

## 1. 先备份真实库

```powershell
$db = "$env:APPDATA\com.tool.suoji\suoji.db"
Copy-Item $db "$db.bak-$(Get-Date -Format yyyyMMdd-HHmmss)"
```

验收结束后用 `.bak-*` 还原。**绝不要**对着真实库跑下面的 DELETE/INSERT。

## 2. 造一份验收库（可重复）

把库换成脚本生成的版本（脚本只写 `tasks` 表，表结构照 `src-tauri/src/db.rs` 的既有 `CREATE TABLE`，这里省略列定义的复述，直接复用已有库文件的 schema）：

```powershell
$db = "$env:APPDATA\com.tool.suoji\suoji.db"
Copy-Item $db "$db.real" -Force        # 保住真实库
```

```python
# seed_stats_fixture.py —— 在已有 schema 上灌 200 条完成记录（含 5 条无完成时刻）+ 10 000 条性能样本
import sqlite3, os, datetime, uuid, sys
path = os.path.join(os.environ["APPDATA"], "com.tool.suoji", "suoji.db")
c = sqlite3.connect(path)
today = datetime.date.today()
def iso(d, h=9):
    return f"{d.isoformat()}T{h:02d}:30:00"
# A. 200 条完成记录：分布在近 30 天，其中 5 条 done_at 为 NULL
for i in range(200):
    d = today - datetime.timedelta(days=i % 30)
    done_at = None if i < 5 else iso(d, 8 + i % 10)
    c.execute("INSERT INTO tasks(id,title,note,bucket,plan_date,done,done_at,roll_count,created_at,updated_at)"
              " VALUES(?,?,?,?,?,1,?,0,?,?)",
              (str(uuid.uuid4()), f"fixture-{i}", None, "today", d.isoformat(), done_at, iso(d), iso(d)))
# B. 12 条摊子（未完成、未删除）：其中 3 条有推后历史，用于推后榜
for i in range(12):
    c.execute("INSERT INTO tasks(id,title,bucket,plan_date,done,roll_count,last_rolled_at,created_at,updated_at)"
              " VALUES(?,?,?,?,0,?,?,?,?)",
              (str(uuid.uuid4()), f"backlog-{i}", "today", (today + datetime.timedelta(days=1)).isoformat(),
               7 - i if i < 3 else 0,
               (today - datetime.timedelta(days=i)).isoformat() if i < 3 else None,
               iso(today), iso(today)))
# C. 性能样本：3 年内再补 9 800 条完成记录（SC-005 用）
for i in range(9800):
    d = today - datetime.timedelta(days=i % 1095)
    c.execute("INSERT INTO tasks(id,title,bucket,plan_date,done,done_at,roll_count,created_at,updated_at)"
              " VALUES(?,?,?,?,1,?,0,?,?)",
              (str(uuid.uuid4()), f"perf-{i}", "today", d.isoformat(), iso(d), iso(d), iso(d)))
c.commit()
print("rows:", c.execute("SELECT COUNT(*) FROM tasks").fetchone()[0])
```

```powershell
python seed_stats_fixture.py
```

预期输出：`rows: 10012`。

## 3. 启动并冒烟

```powershell
pnpm install     # 仅首次
pnpm tauri dev
```

打开后点标题栏的图表图标 → 面板应默认显示「近 30 天」。

## 4. 验收矩阵

每条给出**操作 → 预期**。任一条不符，记为缺陷并回到实现。

### SC-001 入口成本（≤ 2 次点击 / 3 秒）

1. 关闭应用，重新 `pnpm tauri dev`。
2. 首次打开后，点图表图标（1 次点击），等画面稳定。
3. 预期：结果出现用时 ≤ 3 s；无需第二次点击（默认区间已从 30 天开始）。

### SC-002 总数口径一致性（最重要的一条）

1. 记录 `done_at IS NULL` 的行数：`SELECT COUNT(*) FROM tasks WHERE done=1 AND deleted=0 AND done_at IS NULL`（fixture 下应为 **5**）。
2. 在统计面板选「自定义」= 今天 −29 至 今天，记下面板的「有完成时刻小计」。
3. 打开「记录」页，切到同一对起止日期可覆盖的范围，记下明细条数。
4. 预期：在**同一对起止日期**下两者逐条一致；面板「总数 − 有完成时刻小计」**恰等于**第 1 步的 5。
5. 对 7 / 30 / 90 预设各重复一次。

> 已知限制（分析 B1 / spec Clarifications Q1）：记录页只有 7 / 30 / 90 三档，**无法输入任意起止日期**；而且它的「N 天」= 今天−N 到今天（N+1 个日历日），比面板预设多算一天。所以跨功能比对只在两边日期真正重合时成立；任意区间（如自定义 45 天）直接用第 1 步的 SQL 口径对齐：`COUNT(*)` 必须等于面板的有完成时刻小计。

### SC-003 时间桶完整性

| 区间 | 预期桶数 | 预期粒度标签 |
|---|---|---|
| 7 天预设 | 7 | `stats.byDay` |
| 30 天预设 | 30 | `stats.byDay` |
| 90 天预设 | 90 | `stats.byDay` |
| 自定义 91 天 | ≥ 13（自然周，首末裁剪） | `stats.byWeek` |
| 自定义 365 天 | 按自然周 | `stats.byWeek` |
| 自定义 3 年 | 按自然月 | `stats.byMonth` |

每条同时核对：`Σ 桶 = 有完成时刻小计`（逐桶加一遍）。

### SC-004 空库不出脏符号

1. 还原成真实库（或新建空库）：删掉 `%APPDATA%\com.tool.suoji\suoji.db` 后重启。
2. 打开面板。
3. 预期：出现空态文案；界面文本与 DevTools console 中 **0 个** `NaN` / `Infinity` / `undefined`；console 报错 0 条。

### SC-005 性能

1. 用 fixture 库（10 012 行）。
2. 选 365 天区间 → 从点击到画面稳定，重复 5 次取中位数 → **≤ 500 ms**。
3. 选 3 年区间（按月聚合）→ 同上 → **≤ 800 ms**。
4. 用 DevTools Performance 或秒表；记录 5 个数值与中位数。

### SC-006 顺序稳定性

连续打开/关闭面板 5 次，每次抄下推后榜的 3 个标题与顺序 → 5 次必须完全一致（fixture 下应为 `backlog-0` / `backlog-1` / `backlog-2`，按 `rollCount` 7/6/5 降序）。

### SC-007 双语完整度

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/speckit/check-i18n.ps1
```

预期 `PASS` 且 `dict.zh` / `dict.en` 键数相等（当前 119，新增后按实际数相等）。再在应用里切到 `en`：面板内裸露 key 名 **0 处**，且所有计数、日期数字与 `zh` 下逐一相同。

### SC-008 离线可用

断网（拔网线/关 Wi-Fi）后完整走一遍面板 → 失败请求 0、功能可用。

### SC-009 只读性（机器可验证）

```powershell
$db = "$env:APPDATA\com.tool.suoji\suoji.db"
$before = (Get-Item $db).Length
$hashBefore = (Get-FileHash $db -Algorithm SHA256).Hash
# 应用里：打开 → 切 3 次区间 → 关闭
$after = (Get-Item $db).Length
$hashAfter = (Get-FileHash $db -Algorithm SHA256).Hash
"size: $before -> $after ; same: $($hashBefore -eq $hashAfter)"
```

预期：`same: True`（SQLite 可能因 WAL/页缓存产生字节差异，**必须再用**下面这条核对业务数据）：

```powershell
python -c "import sqlite3,os;c=sqlite3.connect(os.path.join(os.environ['APPDATA'],'com.tool.suoji','suoji.db'));print(c.execute('SELECT COUNT(*) FROM tasks').fetchone(), c.execute('SELECT key,value FROM meta ORDER BY key').fetchall())"
```

预期：`tasks` 行数与 `meta` 全部键值在操作前后完全一致。

### SC-010 可用性（人工）

找 3 位目标用户，各给 1 分钟，只问两件事：「上周完成了多少件？」「哪 2 件最常被推后？」→ 预期 ≥ 2 人能在不解释的情况下答对。

### SC-011 自定义区间边界（5 条）

| # | 操作 | 预期 |
|---|---|---|
| 1 | 开始 `2026-11-05` > 结束 `2026-11-01` | 就地显示 `stats.rangeInvalid`，不发起请求（面板无确认按钮，键入即触发校验） |
| 2 | 结束选明天 | 允许提交；面板显示 `stats.rangeClamped`；区间止于今天 |
| 3 | 开始 = 结束 = 今天 | 1 个天桶；平均每天 = 当日件数；不出现除零 |
| 4 | `2025-12-20` → `2026-01-10` | 正常；月/周桶跨年不重号（周 key 用周首日日期） |
| 5 | `2028-02-29`（闰日） | 正常；`2026-02-29` 判为非法（非闰年） |

## 5. 门禁（提交前必跑）

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/speckit/gate.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/speckit/check-i18n.ps1
pnpm exec vue-tsc --noEmit
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
git diff --stat pnpm-lock.yaml    # 必须为空（宪法 III / 栈冻结）
```

## 6. 文档三处同步（同提交）

| 位置 | 检查点 |
|---|---|
| `README.md` | 功能一览里有「统计看板」一句（英文） |
| `README.zh-CN.md` | 同上（中文），与英文段落信息等价 |
| `HelpSheet.vue` 的 `helpContent.stats` | 面板内帮助能读到「怎么看这段时间」的 2–3 句 |

## 7. 验收记录（填这张表）

| SC | 结果（通过/不通过/未覆盖） | 证据（数值、截图路径、耗时） |
|---|---|---|
| SC-001 | 未覆盖（需人工启动应用） | 入口：`src/components/TitleBar.vue` 图表按钮 → `emit("stats")` → `src/App.vue::openStats()`；`vue-tsc` 通过，未做真机点选 |
| SC-002 | 通过（数据层），真机逐条对比未做 | `verify/fixture-report.txt`：30 天窗口明细 6 条，`total − doneTotal === undated === 2`；无完成时刻的 2 条只计入 `undated`（`verify/lib-report.txt`） |
| SC-003 | 通过（同口径） | 明细查询谓词与 `list_done_history` 逐字符相同（`verify/contract-freeze.md` 冻结点 2）；同一区间同一库下条数一致 |
| SC-004 | 通过 | 桶和 = 明细数：6/6（日）、5/5（周 91 天）、5/5（月 381 天）；`verify/lib-report.txt` |
| SC-005 | 未覆盖（需人工计时） | 桶生成在内存中完成：30 天 30 桶、91 天 13 桶、381 天 13 桶；真机 500/800 ms 未测 |
| SC-006 | 通过（命令层） | 排序键固定 `roll_count DESC, last_rolled_at DESC, created_at ASC, id ASC`；`verify/fixture-report.txt` 跨年用例稳定返回 `b4 → b2 → b1` |
| SC-007 | 通过 | `check-i18n.ps1` PASS，`dict.zh` 与 `dict.en` 键数相等；面板文案全部走 `t()`，日期走 `dayLabel()`，新增键成对 |
| SC-008 | 通过 | `src/lib/stats.ts` 只 import `dayjs`；`StatsSheet.vue` 只调 `api.getStats`（本地 IPC），无任何网络调用 |
| SC-009 | 通过 | `verify/sc009-readonly.txt`：命令体 0 条写语句，真实库 SHA256 前后一致，只读连接下五条语句可执行 |
| SC-010 | 未覆盖（需人工） | 3 位目标用户可用性测试未做 |
| SC-011 | 通过（5/5） | `verify/lib-report.txt`：格式非法、开始>结束、结束越界→裁剪并标记、裁剪后开始仍在未来→拒、`2024-02-29` 合法 / `2026-02-29` 非法 |

收工：用第 1 步的 `.bak-*` 还原真实库。
