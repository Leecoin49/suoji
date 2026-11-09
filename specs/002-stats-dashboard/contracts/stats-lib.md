# Contract: `src/lib/stats.ts`（前端纯函数）

**Feature**: `specs/002-stats-dashboard/spec.md` | **Data model**: [../data-model.md](../data-model.md) | **Research**: [../research.md](../research.md)

本文件钉死聚合模块的导出面。组件只能调这里列出的函数，**不得在 `.vue` 里自己分桶、自己算连续天数**（否则规则漂移，宪法 I 的可核对性消失）。

## 1. 导出清单

```ts
import type { DoneEntry, RollEntry, StatsRaw, StatsSpan } from "@/lib/api";

export type Granularity = "day" | "week" | "month";
export type CompareState = "up" | "down" | "flat" | "none";

export interface Bucket {
  key: string;        // day: "YYYY-MM-DD"；week: 周一的 "YYYY-MM-DD"；month: "YYYY-MM"
  label: string;      // 由 key 派生的固定格式，不含语言分支（如 "11/05"、"11/05–11/11"、"2026-11"）
  count: number;
  start: string;      // 该桶在区间内的真实起止（首末桶被裁剪）
  end: string;
  clipped: boolean;   // 首/末桶是否被截断
}

export interface Compare {
  state: CompareState;
  delta: number;      // 当前段 − 上一段；state === "none" 时恒 0
  prevTotal: number;
}

export interface StatsView {
  span: StatsSpan;
  prev: StatsSpan;
  doneTotal: number;
  undated: number;
  total: number;
  average: number;
  streak: number;
  granularity: Granularity;
  buckets: Bucket[];
  maxCount: number;
  compare: Compare;
  rolled: RollEntry[];
  backlog: number;
  clamped: boolean;
  empty: boolean;
}

// 校验
export function isIsoDay(value: string): boolean;
export function validateRange(
  start: string,
  end: string,
  today: string,
): { ok: true; start: string; end: string; clamped: boolean } | { ok: false; reason: "format" | "order" };

// 聚合
export function granularityOf(days: number): Granularity;
export function bucketize(entries: DoneEntry[], span: StatsSpan): Bucket[];
export function maxCountOf(buckets: Bucket[]): number;
export function streakOf(entries: DoneEntry[], span: StatsSpan, today: string): number;
export function compareOf(current: number, previous: number): Compare;
export function toView(raw: StatsRaw, today: string): StatsView;
```

## 2. 逐函数语义

| 函数 | 规则 | 必须成立 |
|---|---|---|
| `isIsoDay` | `^\d{4}-\d{2}-\d{2}$` 且 `dayjs(v, "YYYY-MM-DD", true).isValid()` | `"2026-02-29"` → `false`（2026 非闰年）、`"2026-2-9"` → `false` |
| `validateRange` | 两端 `isIsoDay` 失败 → `format`；`start > end` → `order`；`end > today` → 返回 `end = today`、`clamped = true` | 不交换、不静默修正 `start`；`start === end` 合法 |
| `granularityOf` | `≤ 90 → day`；`≤ 365 → week`；`> 365 → month` | `days ≥ 1` 由调用方保证（`prev.days === span.days`） |
| `bucketize` | 生成**覆盖整个区间**的桶序列（含 0 件桶），按 `doneAt.slice(0, 10)` 落桶；周桶按 `d.subtract((d.day() + 6) % 7, "day")` 对齐到周一；首末桶 `clipped = true` 并裁 `start`/`end` | `Σ count === entries.length`；`buckets[0].start === span.start`；`buckets.at(-1).end === span.end`；`buckets.length ≥ 1` |
| `maxCountOf` | `Math.max(1, ...counts)` | 空桶数组时返回 1（防除零） |
| `streakOf` | 锚 = `min(today, span.end)`（字符串比较，同格式即可）；从锚往前逐日，命中即 `+1`，未命中即停；锚日无记录返回 0 | 返回值 `≤ span.days`；不得数到 `span.start` 之前（Q3） |
| `compareOf` | `previous <= 0` → `{ state: "none", delta: 0, prevTotal: previous }`；否则差值为正/负/零 → `up`/`down`/`flat` | `previous = 0 && current > 0` 不得产生 `up` 或 `Infinity`（SC-004 的「0 个 NaN/Infinity」断言 + spec Edge Cases「上一段为 0」） |
| `toView` | 组合上述函数；`total = doneTotal + undated`；`average = round(doneTotal / span.days, 1)`；`empty = doneTotal === 0 && undated === 0 && rolled.length === 0`（`undated > 0` 不算空，否则「其中 N 件没留完成时间」会被空态挡住 —— T037） | 见下方不变量 |

## 3. 纯度要求

- 不读 `Date.now()`、不读 `localStorage`、不做 `invoke`、不 import store 或组件。
- `today` 一律由调用方传入（`StatsSheet.vue` 用 `dayjs().format("YYYY-MM-DD")`），保证同一输入同一输出。
- 不依赖 `dayjs.locale()`：`label` 只用固定数字格式（研究 R1）；语言化文字由组件用 `t()` 拼。
- **B2 裁决（2026-11-06，实现时落定）**：spec「双语影响」里“日期一律按当前语言格式化（`11月6日` / `Nov 6`）”只约束**逐条列表的日期与推后日期**（组件调 `dayLabel()` 现算），**不约束桶标签**。桶标签是横轴刻度，必须在切换语言时逐字形不变，否则不变量 3 无法成立。理由是分析 B2 指出的冲突：两份要求同时照字面执行则互相矛盾。

## 4. 不变量（评审与验收的硬断言）

1. `Σ buckets[].count === doneTotal` —— 同源派生 + 首末裁剪（SC-004）。
2. `total − doneTotal === undated`。
3. 同输入下 `bucketize` 的结果与 `dayjs.locale()` 无关（切换 zh/en 前后逐字段相等）。
4. 所有 `Granularity` 切换只影响桶的数量与 `label`，不改变 `doneTotal` / `total` / `average` / `streak` / `compare`。
5. 任何函数都不返回负数 count，不返回 `NaN`（`days ≥ 1`、`maxCount ≥ 1` 双保险）。

## 5. 实现时落定的两处呈现口径（2026-11-06，T030 / T035）

- **「总数」怎么显示**：`stats.total` 的 `{n}` 用 `view.total`（= 有完成时刻 + 未标注），紧跟一行 `stats.undated`（「其中 {n} 件没留完成时间，不计入下面的分布」）。这样 FR-011 的「未标注计入总数」与 FR-018 的「桶之和 = 有完成时刻」同时成立，屏幕上不会出现两个都叫「总数」的数。横轴（分布那一块）的 `Σ` 仍等于 `doneTotal`，不是 `total`。
- **备注：常显而不是「展开」**：FR-005 写的是「有备注的任务 MUST 可展开看备注」。实现选常显（有备注就多一行 `whitespace-pre-wrap` 的灰字），理由是①`HistorySheet.vue:141-144` 已是这个约定，两处不一致更差；②只读的复盘列表不需要额外点击。此口径视为「可展开」的超集，不视为偏离；若将来备注变长需要折叠，改的是组件而不是 lib。
