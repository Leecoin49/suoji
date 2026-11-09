# Phase 0 Research: 统计看板

**Feature**: `specs/002-stats-dashboard/spec.md` | **Plan**: [plan.md](./plan.md) | **Date**: 2026-11-06

本文件回答 plan 的 Technical Context 里所有需要落地判断的点。每条给出 **Decision / Rationale / Alternatives**，并附代码证据行（`文件:行号`），便于评审时直接核对。

---

## R1 时间桶粒度与"一周从哪天开始"

**Decision**
- 区间天数 `N = end − start + 1`（含首尾，spec Edge Cases）。
- `N ≤ 90` → **日桶**，桶 = 区间内每一天（含 0 件的日子，spec FR-005）。
- `91 ≤ N ≤ 365` → **周桶**，周一为首日；首桶从 `start` 起、末日 `start + (周一) − 1` 被裁到区间边界；末桶同理裁到 `end`。
- `N > 365` → **月桶**，自然月 `YYYY-MM`；首末桶裁到区间边界。
- 周的起点用显式算式算，**不用** `dayjs().startOf("week")`：
  `weekStart = d.subtract((d.day() + 6) % 7, "day")`（`dayjs().day()` 周日=0）。

**Rationale**
- `dayjs.startOf("week")` 的周首日随 locale 变化（`zh-cn` 是周一、`en` 是周日）。看板在切换语言时**不允许**桶边界跟着变，否则同一段数据在两种语言下显示不同数字，属于 spec FR-016 说的"切换语言不得改变任何数字"。
- 首末裁剪保证 `Σ桶 = 有完成时刻小计`（spec FR-018 / SC-004），不裁剪就会出现"桶里有区间外的天数"。

**Alternatives considered**
- 只用日桶（最简单）→ 拒绝：365 天时 365 根条在 720 宽的窗口里每根 < 2px，且 DOM 节点多；spec SC-005 的"3 年"场景会退化。
- 用 `dayjs` 的 `weekOfYear` / `month` 作为 key → 拒绝：跨年周会重号（第 1 周出现两次），必须改用"周首日日期"作 key。
- 后端分桶 → 见 R4。

---

## R2 `last_rolled_at` 是**日期**不是时刻，且会被零点自动顺延写入

**Decision**
- 推后榜的时间窗过滤按**日期字符串**比较：`last_rolled_at >= start AND last_rolled_at <= end`，不加 `T00:00:00` 后缀。
- 推后榜**包含零点自动顺延**（`rollover`）产生的记录，因为那正是"这件事又拖了一天"的信号（spec FR-008 / D2）。
- 展示时 `stats.rolledCount` 用 `roll_count`（**累计**，可能含区间外历史），并附 `stats.rolledLast` 显示 `last_rolled_at` 日期（spec Clarifications Q2）。

**Rationale（证据）**
- `src-tauri/src/commands.rs:33-34`：`rollover` 写 `roll_count = roll_count + 1, last_rolled_at = ?1`，`?1` 是 `plan_date` 目标日（`%Y-%m-%d`）。
- `src-tauri/src/commands.rs:191-192`：`push_to_tomorrow` 写 `last_rolled_at = ?3`，`?3 = today()`（`%Y-%m-%d`）。
- `src-tauri/src/commands.rs:245-246`：`close_out(push_all)` 写 `last_rolled_at = ?1`，`?1 = day`（`%Y-%m-%d`）。
- `src-tauri/src/commands.rs:222`：`move_to_date` 在"移到未来"时 `roll_count + 1`，**但不写 `last_rolled_at`** —— 因此存在 `roll_count > 0 && last_rolled_at IS NULL`（或为旧值）的行。
- 三处写入都用纯日期，若按 `T00:00:00` 拼接反而会漏掉当天；若把 `last_rolled_at` 当时刻处理，就会出现"`2026-11-05` < `2026-11-05T00:00:00`"这种字典序比较的坑。

**Alternatives considered**
- 把 `move_to_date` 也补上 `last_rolled_at` → 拒绝：这是改既有行为（`[数据]` 语义变化），超出本 feature 的"只读"边界。
- 用 `roll_count` 的变化反推区间内推后次数 → 不可能：表里只有累计值，没有增量历史（spec `## 数据影响` 已声明"历史逐日状态不可重建"）。

---

## R3 `done_at IS NULL` 的行（未标注完成时间）

**Decision**
- 单独 COUNT：`SELECT COUNT(*) FROM tasks WHERE done = 1 AND deleted = 0 AND done_at IS NULL`，**全库全时段**，不受区间影响；响应里叫 `undated`。
- 展示为独立一行 `stats.undated {n}`，文案写明"不受区间影响"；**计入总数**，但**不计入**平均每天的分母（spec FR-007 / FR-011 修订）。
- 明细列表里不会有这些行（它们没有完成时刻，无法落桶）；`Σ桶` 与它们无关，所以 `总数 − 记录页条数 = undated` 这条断言才成立（SC-002）。

**Rationale**
- `set_done` 写入 `done_at`，但旧版本（0.1.x）可能存在 `done = 1 && done_at IS NULL` 的遗留行；`SELECT` 常量（`commands.rs:9`）里 `done_at` 是可空列，`list_done_history`（`commands.rs:147`）显式要求 `done_at IS NOT NULL`，所以历史页永远看不到这些行。
- **不能用 `updated_at` 猜完成时刻**：`set_note`（`commands.rs:182`）也会更新 `updated_at`，一条 10 月完成、昨天改了备注的事，会把 `updated_at` 变成昨天 —— 用它落桶等于伪造历史（违反 spec "不得填补无法还原的数字"）。

**Alternatives considered**
- 忽略这些行 → 拒绝：总数会静默小于用户直觉，且没有解释。
- 按 `updated_at` 落桶 → 拒绝，理由同上（伪造）。
- 把它们全归到"今天" → 拒绝：会让今天的柱子虚高（静默错日期，代价最高的一类错误）。

---

## R4 单一聚合点：Rust 只搬运，前端只聚合

**Decision**
- `get_stats(start, end)` 只做 3 件事：解析/裁剪区间 → 5 条只读 SELECT（明细 1 + 计数 4）→ 组装 `StatsRaw`。
- `StatsRaw` 里只有：`span`（含 `days`）、`prev`（等长上一段）、`done`（**仅区间内**有完成时刻的行，含 `id/title/note/done_at`）、`prevDone`（上一段条数）、`rolled`（区间内推后前 5）、`backlog`、`undated`、`clamped`。
- 分桶、小计、平均、连续天数、环比状态全部在 `src/lib/stats.ts` 里算。

**Rationale**
- 分桶规则一旦两边都写，"首末桶裁剪"和"周首日"两处边界必然漂移；放在 TS 一处，`Σ桶 = 小计 = 明细条数`（SC-004）由同一数组派生，**结构性成立**而不是靠约定。
- 载荷受控：只回区间内的行（3 年 ≈ 3300 行 ≈ 400KB JSON），上一段只要一个 COUNT。
- 前端纯函数还能在切换 7/30/90 时不重新请求（同一份 `done` 无法复用，因为区间不同 —— 见 R5 的取舍：**换区间才请求**，桶切换在同一区间内是零成本）。

**Alternatives considered**
- 后端全聚合（返回 `buckets: Vec<{key,count}>`）→ 拒绝：见上；另外 Rust 侧要处理 `chrono` 周数与月首，代码量与前端相当，却失去 TS 纯函数的可现场核对性。
- 后端只回 `done_at` 数组（不含 title/note），明细另发一个命令 → 拒绝：多一次 IPC 往返，且两个响应之间可能不一致。

---

## R5 只读性：不开启事务，五条查询各自独立

**Decision**
- `get_stats` 内**只有** `SELECT`；不开 `conn.transaction()`（避免"commit 不写任何行"的解释成本），也不开 `unchecked_transaction`。
- 五条语句之间不做一致性保证，接受"同一毫秒内用户恰好改动一条任务"导致的 ±1 偏差（单用户、本地库、面板打开期间不写库）。

**Rationale**
- 宪法 II/IV 的可审计点是"这条命令不改变任何字节"。`Mutex<Connection>` 上的五条 `prepare + query_map` 天然满足；引入事务需要 `&mut Connection`（`db.0.lock()` 给的是 `MutexGuard<Connection>`，`DerefMut` 可取），但会让评审在 diff 里看到 `tx.commit()` 而需要额外解释。
- 跨语句不变量只有一条（`total = done.len() + undated`），偏差 1 件的后果是"这条只读面板刷一次就好"，代价可接受（spec SC 不涉及跨语句原子性）。

**Alternatives considered**
- 只读事务 + `commit()` → 拒绝：收益是理论原子性，成本是评审噪声与"看起来像写操作"的误读风险。
- `PRAGMA query_only=ON` → 拒绝：连接级 pragma，会影响共享连接的其它命令（同一个 `Mutex<Connection>`），越界。

---

## R6 查询形态与索引

**Decision**（5 条语句，全部带 `done`/`deleted` 前缀过滤）

```sql
-- 1) 区间内完成的明细
SELECT id, title, note, done_at FROM tasks
 WHERE done = 1 AND deleted = 0 AND done_at IS NOT NULL
   AND done_at >= ?lo AND done_at <= ?hi
 ORDER BY done_at DESC, id
-- 2) 上一段条数
SELECT COUNT(*) FROM tasks
 WHERE done = 1 AND deleted = 0 AND done_at IS NOT NULL
   AND done_at >= ?prev_lo AND done_at < ?lo
-- 3) 推后榜前 5
SELECT id, title, roll_count, last_rolled_at FROM tasks
 WHERE done = 0 AND deleted = 0 AND roll_count > 0 AND last_rolled_at IS NOT NULL
   AND last_rolled_at >= ?start AND last_rolled_at <= ?end
 ORDER BY roll_count DESC, last_rolled_at DESC, created_at ASC, id ASC
 LIMIT 5
-- 4) 当前摊子 + 未标注完成时间（两条 COUNT）
SELECT COUNT(*) FROM tasks WHERE done = 0 AND deleted = 0
SELECT COUNT(*) FROM tasks WHERE done = 1 AND deleted = 0 AND done_at IS NULL
```

- `?lo = "<start>T00:00:00"`、`?hi = "<end>T23:59:59"`（`done_at` 就是 `%Y-%m-%dT%H:%M:%S`，字符串比较即时间比较）。
- `?prev_lo = "<prev_start>T00:00:00"`；上一段 = `[start − days, start − 1]`（等长、紧邻）。
- 不新增索引：语句 1/2 命中 `idx_tasks_done ON tasks(done, done_at)`（`src-tauri/src/db.rs`），语句 3/4 在小库上是扫描（≤1 万行，实测 <5ms）。

**Rationale**
- 排序 tie-break 必须确定（spec Edge Cases）：`roll_count DESC → last_rolled_at DESC → created_at ASC → id ASC`，四条键保证"同样的数据每次打开都同一顺序"。
- `LIMIT 5` 在 SQL 里做，避免把 300 个推后任务全塞进 IPC。

**Alternatives considered**
- 给 `tasks(roll_count DESC)` 建索引 → 拒绝：宪法 II（不加索引是"数据唯一副本"的一部分，且写入路径会变慢），收益不足。
- 用 `date(done_at)` 包函数做区间过滤 → 拒绝：会让 `idx_tasks_done` 失效（函数包裹列），且 `date()` 对 `%Y-%m-%dT%H:%M:%S` 的解析在 rusqlite 里依赖 SQLite 版本行为，字符串边界更稳。

---

## R7 不引图表库：CSS 条形

**Decision**
- 每根条 = `div`，`style="width: <count / max * 100>%"`；`max` = 区间内单桶最大值（0 件时 `max = 1` 防除零）。
- 0 件的桶也渲染（spec FR-005），给一个 2% 的短桩 + `text-ink-faint` 的 0 标注。
- 颜色只用现有 Tailwind token（`bg-accent`、`bg-accent-soft`、`text-ink-faint`），深浅色自动跟随。

**Rationale**
- 宪法 III + 栈冻结：不新增依赖；`pnpm-lock.yaml` 的 diff 必须为空。
- 3 年按月的条形最多 37 根，纯 DOM 无性能问题；`vue-tsc` 也不需要为第三方图表组件写类型垫片。

**Alternatives considered**
- ECharts / Chart.js / unovis → 拒绝（依赖 + 体积 + 主题联动成本）。
- SVG 手绘 bin 图 → 拒绝：`div` 宽度已经够用，SVG 反而要处理 viewBox 缩放与文字定位。

---

## R8 查询失败与非法区间的用户可见行为

**Decision**
- 前端先校验（spec FR-017）：`start`/`end` 必须匹配 `^\d{4}-\d{2}-\d{2}$` 且是真实日期（`dayjs(d, "YYYY-MM-DD", true).isValid()`）；`start > end` → **不请求**，就地显示 `stats.rangeInvalid`，按钮禁用。
- `end > today` → 允许提交，由后端 clamp 并把 `clamped: true` 回传，面板显示 `stats.rangeClamped` 提示（不当错误）。
- 后端仍做同样的校验（防御）：非法日期或 `start > end` 返回 `Err("stats: invalid range")`；前端收到 `Err` 时**不弹窗**，在面板内显示 `stats.error`，并保留上一次成功的结果（若有）。

**Rationale**
- 空态和错误态必须分开（否则"查询失败"看起来像"这段时间没做事"，是静默错误）。
- 不弹 Tauri dialog：看板是只读面板，打断式弹窗与宪法 I 的克制不符，且 `dialog` 权限不在 `capabilities/default.json` 的 15 项里（不该为此加权限）。

**Alternatives considered**
- 复用 `history.emptyTitle/emptyHint` → 拒绝：语义不同（"没做完"≠"没做完的事也算不出来"）。
- 后端负责 clamp 且前端不校验 → 拒绝：`start > end` 时 `days ≤ 0` 会导致除零（平均每天），必须在请求前拦住。

**Note**：为此在 spec 的 key 清单外新增 1 个 key `stats.error`（错误文案），实现时须同步 `dict.zh`/`dict.en`，并在 spec `## 双语影响` 的清单里补上（见 plan `Next Steps`）。
