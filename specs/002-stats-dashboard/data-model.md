# Phase 1 Data Model: 统计看板

**Feature**: `specs/002-stats-dashboard/spec.md` | **Plan**: [plan.md](./plan.md) | **Research**: [research.md](./research.md)

本 feature **不新增表、不新增列、不新增索引、不写任何行**。下面是三层数据的形状：数据库（只读）→ IPC（`StatsRaw`）→ 视图（`StatsView`）。

## 0. DDL 影响

| 项 | 结论 | 证据 |
|---|---|---|
| 新建表 | 无 | `src-tauri/src/db.rs` 保持 3 张表（`tasks` / `meta` / `day_notes`）不变 |
| 加列 / 改列 | 无 | 同上；不写 `ALTER TABLE`（宪法 II，且 `schema_version` 尚未落地） |
| 新建索引 | 无 | 复用 `idx_tasks_done ON tasks(done, done_at)`（研究 R6） |
| 迁移 / 回滚 | 无 | 零 DDL ⇒ 旧库直接可开；回滚 = 回滚代码 |
| 写入 | 无 | `get_stats` 只有 5 条 `SELECT`（明细 1、上一段计数 1、推后榜 1、摊子 1、未标注 1） |

## 1. 数据源（既有表，只读）

只用到 `tasks` 的 8 列，语义按现有实现理解，**不得重新解释**：

| 列 | 类型 | 本 feature 的用法 | 语义钉死点 |
|---|---|---|---|
| `id` | TEXT | 明细/推后榜的行标识、排序 tie-break 末位 | `commands.rs` 新增任务时用 uuid |
| `title` | TEXT | 只读展示 | 不改 |
| `note` | TEXT NULL | 明细里可选展示 | 不改 |
| `done` | INTEGER 0/1 | 完成过滤 `done = 1`；摊子 `done = 0` | 布尔语义 |
| `done_at` | TEXT NULL | **唯一的完成时刻来源**，格式 `%Y-%m-%dT%H:%M:%S`（本地时间、无时区后缀） | 由 `now_iso()`（`commands.rs:16`）写入 |
| `deleted` | INTEGER 0/1 | 一律排除 `deleted = 1`（软删，`drop_task`） | 删除的行不出现在任何统计里 |
| `roll_count` | INTEGER | 推后榜排序键，展示为「累计」 | 所有推后路径都 `+1`（含 `move_to_date`） |
| `last_rolled_at` | TEXT NULL | 推后榜入榜时间窗过滤，格式 `%Y-%m-%d`（**纯日期**） | 研究 R2；`move_to_date` 不写它 |
| `created_at` | TEXT | 推后榜 tie-break（第三键） | — |

## 2. IPC 层实体（`src-tauri/src/model.rs`，`#[serde(rename_all = "camelCase")]`）

```text
StatsSpan   { start: String, end: String, days: i64 }
            start/end = "YYYY-MM-DD"；days = end − start + 1（含首尾，≥ 1）

DoneEntry   { id: String, title: String, note: Option<String>, doneAt: String }
            只包含「区间内」「done=1」「deleted=0」「done_at IS NOT NULL」的行

RollEntry   { id: String, title: String, rollCount: i64, lastRolledAt: String }
            只包含「区间内 lastRolledAt」「done=0」「deleted=0」「roll_count>0」的前 5 行

StatsRaw    {
              span:      StatsSpan,        // 请求区间（end 可能被 clamp 到 app 本地今天）
              prev:      StatsSpan,        // 等长且紧邻的前一段 [start − days, start − 1]
              done:      DoneEntry[],      // 区间内明细，doneAt DESC, id ASC
              prevDone:  i64,              // 上一段条数（只回计数，不回行）
              rolled:    RollEntry[],      // 长度 ≤ 5
              backlog:   i64,              // done = 0 AND deleted = 0（全库当前值）
              undated:   i64,              // done = 1 AND deleted = 0 AND done_at IS NULL（全库全时段）
              clamped:   bool,            // 请求的 end 是否被裁到今天
            }
```

**校验规则（后端，防御性；前端先拦一遍）**

| 输入 | 规则 | 违反时 |
|---|---|---|
| `start` / `end` | 必须匹配 `^\d{4}-\d{2}-\d{2}$` 且 `NaiveDate::parse_from_str` 成功 | `Err("stats: invalid range")` |
| `start > end` | 拒绝（不做交换） | `Err("stats: invalid range")` |
| `end > today` | `end = today`，`clamped = true`（不报错） | 正常返回 |
| `start` 早于 1970 | 允许（无上限，spec Q5 D） | 正常返回 |
| `days` | 恒 ≥ 1 | 由上面三条推出 |

**不做的事**：不按 `done_at` 分桶、不算小计、不算连续天数、不算环比 —— 这些全在视图层（研究 R4）。

## 3. 视图层实体（`src/lib/stats.ts`）

```text
Granularity = "day" | "week" | "month"          // 由 days 决定：≤90 / 91–365 / >365（研究 R1）

Bucket      { key: string,        // day: "YYYY-MM-DD"；week: 周一的 "YYYY-MM-DD"；month: "YYYY-MM"
              label: string,      // 由 key 派生，仅数字与固定分隔符，可再拼语言化文字
              count: number,      // 落在该桶内的完成件数（可为 0）
              start: string,      // 桶的真实起止（首末桶被裁到区间边界）
              end: string,
              clipped: boolean }  // 首/末桶是否被裁剪

Compare     { state: "up" | "down" | "flat" | "none",
              delta: number,      // 当前段 − 上一段（⊥ state = "none" 时恒 0）
              prevTotal: number }

StatsView   { span: StatsSpan,
              prev: StatsSpan,
              doneTotal: number,        // = 区间内有完成时刻的条数（小计）
              undated: number,          // 全库未标注完成时间（不受区间影响）
              total: number,            // = doneTotal + undated（spec FR-011）
              average: number,          // = doneTotal / span.days，保留 1 位小数（FR-007 分母不含 undated）
              streak: number,           // 以 min(today, end) 为锚，向前数到 0 件或区间起点（Q3）
              granularity: Granularity,
              buckets: Bucket[],        // 覆盖整个区间、含 0 件桶（FR-005）
              maxCount: number,         // = max(bucket.count, 1)，条形宽度分母
              compare: Compare,
              rolled: RollEntry[],
              backlog: number,
              clamped: boolean,
              empty: boolean }          // doneTotal === 0 && rolled.length === 0
```

**派生规则（唯一实现点，全部在 `src/lib/stats.ts`）**

| 派生量 | 规则 | 对应 FR / SC |
|---|---|---|
| `granularity` | `days ≤ 90 → day`；`≤ 365 → week`；否则 `month` | FR-018 |
| 日桶 | 区间内每一天一个桶，按 `doneAt.slice(0,10)` 落桶 | FR-004、FR-018 |
| 周桶 | 周一起（`d.subtract((d.day()+6)%7,"day")`），key = 周首日；首末桶裁到 `[start, end]` | FR-004、FR-018 |
| 月桶 | key = `doneAt.slice(0,7)`；区间首末月可能存在但不足整月，标 `clipped` | FR-018 |
| `doneTotal` | `done.length` | FR-003 |
| `total` | `doneTotal + undated` | FR-011 |
| `average` | `doneTotal / days`，1 位小数；`days ≥ 1` 恒成立 | FR-007 |
| `streak` | 锚 = `min(today, span.end)`；从锚往前逐日看是否有完成行；遇到 0 件即停；锚日 0 件 → 0 | FR-008、Q3 |
| `compare` | `prevDone > 0`：`delta > 0 → up`，`< 0 → down`，`= 0 → flat`；`prevDone = 0 && doneTotal = 0 → none`；`prevDone = 0 && doneTotal > 0 → none`（不可比，不得显示 ∞） | FR-010、SC-004（0 个 NaN/Infinity）、Edge Cases「上一段为 0」 |
| `maxCount` | `Math.max(1, ...buckets.map(b => b.count))` | 防除零（FR-007 的「天数 ≥ 1」同理） |
| `empty` | `doneTotal === 0 && rolled.length === 0` | FR-012 |

**不变量（必须由结构保证，不是靠测试碰运气）**

1. `Σ buckets[].count === doneTotal` —— 桶由同一个 `done` 数组派生，且首末桶裁剪（SC-004）。
2. `total − doneTotal === undated` —— 两个字段同源于一次响应。
3. 同一份 `StatsRaw` 在 `zh`/`en` 下渲染出的所有计数、日期数字、比值完全相同（FR-016）。
4. 面板内任何交互都不会产生写调用（宪法 I）。

## 4. 状态与流转

只读视图，无状态机。仅有的三个 UI 状态：

```text
idle ──选区间──▶ loading ──成功──▶ ready(raw)
                     │                │
                     ├──失败──▶ error（保留上一次 ready 的内容，只叠加一行提示）
                     └──非法区间──▶ 不请求，就地 invalid（日期框下显示提示；无确认按钮，键入即校验）
ready ──换区间──▶ loading
ready ──关闭/Esc──▶ 丢弃（不缓存，不记忆上次区间，FR-002）
```

## 5. FR ↔ 字段映射（实现时逐条对照）

| FR | 落点 |
|---|---|
| FR-001 只读面板 | 全文件（无写调用，见 `verify/sc009-readonly.txt`） |
| FR-002 预设 + 自定义、默认 30 天、不记忆 | `StatsSheet.vue` 的 `preset` / `start` / `end` ref（初始 30，无持久化） |
| FR-003 完成件数（本地日期） | `doneTotal` = `done.length` |
| FR-004 时间分布（0 件也画）+ 粒度 | `buckets[].count = 0` 渲染、`granularity` |
| FR-005 明细（倒序 + 备注） | `StatsRaw.done` + `DoneEntry`、`note` |
| FR-006 推后榜（累计次数） | `StatsRaw.rolled`（`RollEntry[]`）、`stats.rolledCount`、`stats.rolledLast` |
| FR-007 平均每天 | `average`（`doneTotal / days`） |
| FR-008 连续天数 | `streak` |
| FR-009 此刻摊子 | `backlog`（实时值，`stats.backlogHint` 标注「此刻」） |
| FR-010 等长环比 | `prev`、`prevDone`、`compare` |
| FR-011 未标注完成时间计入总数 | `undated`、`total` |
| FR-012 空态 | `empty`、`stats.empty` / `stats.emptyHint`、无 `NaN` |
| FR-013 以最后一次选择为准 + ≤ 500 ms | `StatsSheet.vue` 的 `ticket` 序号守卫（旧响应丢弃） |
| FR-014 离线可用 | `lib/stats.ts` 只 import `dayjs`；组件只调 `api.getStats` |
| FR-015 唯一入口 + 关闭回今天 | `TitleBar.vue` 的 `emit("stats")`、`App.vue` 的 `openStats()` / `statsOpen` / Esc 分支 |
| FR-016 双语 + 日期随语言 | `dict.zh` / `dict.en` 的 `stats.*`、`dayLabel()` |
| FR-017 自定义区间校验 | `validateRange()`、`StatsRaw.clamped`、`stats.rangeInvalid` / `stats.rangeClamped` |
| FR-018 自动粒度 + 首末裁剪 | `granularityOf()`、`Bucket.clipped`、`first/last` 桶的 `start` / `end` |
