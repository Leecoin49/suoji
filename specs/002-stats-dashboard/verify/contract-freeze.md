# 契约冻结清单（T001）

抄自 `contracts/ipc-get-stats.md` 与 `contracts/stats-lib.md`，实现时**逐字对照，不得改名**。

## IPC `get_stats`

```text
命令名            get_stats
Rust 签名         pub fn get_stats(db: State<Db>, start: String, end: String) -> Result<StatsRaw, String>
JS 调用           invoke<StatsRaw>("get_stats", { start, end })
注册点 3 处       src-tauri/src/commands.rs / src-tauri/src/lib.rs:108 generate_handler![] 末尾 / src/lib/api.ts:39
错误串            "stats: invalid range"
```

`StatsRaw` 字段（camelCase，`#[serde(rename_all = "camelCase")]`）：

| Rust | JSON | 类型 |
|---|---|---|
| `span` | `span` | `StatsSpan { start, end, days }` |
| `prev` | `prev` | `StatsSpan`（`= [start − days, start − 1]`） |
| `done` | `done` | `Vec<DoneEntry { id, title, note, done_at }>` |
| `prev_done` | `prevDone` | `i64` |
| `rolled` | `rolled` | `Vec<RollEntry { id, title, roll_count, last_rolled_at }>`（≤5） |
| `backlog` | `backlog` | `i64`（实时） |
| `undated` | `undated` | `i64`（全库全时段） |
| `clamped` | `clamped` | `bool` |

## `src/lib/stats.ts`

8 个函数 + 5 个类型，一个不多一个不少：

```text
export type Granularity = "day" | "week" | "month";
export type CompareState = "up" | "down" | "flat" | "none";
export interface Bucket { key; label; count; start; end; clipped }
export interface Compare { state; delta; prevTotal }
export interface StatsView { span; prev; doneTotal; undated; total; average; streak;
                             granularity; buckets; maxCount; compare; rolled; backlog; clamped; empty }

export function isIsoDay(value: string): boolean
export function validateRange(start, end, today): {ok:true;start;end;clamped} | {ok:false;reason:"format"|"order"}
export function granularityOf(days: number): Granularity
export function bucketize(entries: DoneEntry[], span: StatsSpan): Bucket[]
export function maxCountOf(buckets: Bucket[]): number
export function streakOf(entries: DoneEntry[], span: StatsSpan, today: string): number
export function compareOf(current: number, previous: number): Compare
export function toView(raw: StatsRaw, today: string): StatsView
```

## 冻结点（违反即返工）

1. 组件不自己分桶、不自己算连续天数、不自己算环比 —— 只能调上面 8 个函数。
2. `stats.ts` 不读 `Date.now()`、不读 `localStorage`、不 `invoke`、不 import store / 组件、不依赖 `dayjs.locale()`。
3. `get_stats` 体内只有 `SELECT`，语句 ≤ 5 条，无 `transaction(` / `commit(`。
4. `list_done_history` 签名与 `since = today − days` 语义不变；`capabilities/default.json` 不改。
