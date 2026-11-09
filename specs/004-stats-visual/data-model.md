# Data Model — 004-stats-visual

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Contracts**: [contracts/heat-grid.md](./contracts/heat-grid.md)

本 feature **不碰持久层**：没有表、没有列、没有迁移，也没有任何写入。这里的「实体」全部是渲染期内存结构，由既有只读查询的结果在 `src/lib/stats.ts` 里派生，生命周期止于一次 `computed`。

```
StatsRaw (既有，冻结)
   └─ done[] ──┐
               ├─> toView() ──> StatsView (既有)
               │                    └─> axisBucketsOf() ──> AxisBucket[] (既有)
               │                                              │
               │                                              ▼
               └──────────────────────────────────> heatGridOf() ──> HeatGrid ──> HeatCell[][]
                                                                           └──> MonthTick[]
StatsView ──────────────────────────────────────────> metric intents ──> MetricCard[]
```

## 1. HeatLevel

一个日历日的「热度」档位，0–4 的封闭枚举。

| 档 | 件数区间 | 语义 |
|---|---|---|
| `0` | `count === 0` | 那天什么都没完成 |
| `1` | `count === 1` | 一件 |
| `2` | `2 ≤ count ≤ 3` | 少量 |
| `3` | `4 ≤ count ≤ 6` | 不少 |
| `4` | `count ≥ 7` | 很多（无上限，图例写「≥7」） |

**规则**：`levelOf(count)` 对负数与 `NaN` 一律返回 `0`（防脏数据把色阶打乱）。

## 2. HeatCell

一个可渲染的日历格。

| 字段 | 类型 | 说明 | 来源 |
|---|---|---|---|
| `date` | `string` (`YYYY-MM-DD`) | 该格代表的日历日 | 由列序推算 |
| `count` | `number` | 当日完成件数（沿用「有完成时刻」口径） | `AxisBucket.count` |
| `level` | `HeatLevel` | 档位 | `levelOf(count)` |
| `isToday` | `boolean` | 是否为今天 | `date === today` |
| `isPeak` | `boolean` | 是否为区间内件数最多的日子（并列全为 `true`） | `count > 0 && count === maxCount` |
| `isOutside` | `boolean` | 是否落在区间外（只占位，不可交互） | `date < span.start` 或 `date > span.end` |
| `key` | `string` | 稳定标识，等于 `date`（供 `:key`、`data-cell-key`、焦点查找） | `date` |

## 3. HeatGrid

一张热力图的全部排版信息。

| 字段 | 类型 | 说明 |
|---|---|---|
| `weeks` | `HeatCell[][]` | 列优先：外层 = 周（列），内层恒 7 个（周一…周日） |
| `weekCount` | `number` | 列数 |
| `firstMonday` | `string` | 第一列的周一（`≤ span.start`） |
| `lastSunday` | `string` | 最后一列的周日（`≥ span.end`） |
| `cellSize` | `22 \| 18 \| 14` | 格边长（px），由 `weekCount` 决定（R1） |
| `dates` | `string[]` | 区间内日期，按网格顺序（列优先）升序 |
| `ticks` | `MonthTick[]` | 列头的月标签 |

## 4. MonthTick

列头的一个月份标记。

| 字段 | 类型 | 说明 |
|---|---|---|
| `weekIndex` | `number` | 从哪一列开始（0 起） |
| `span` | `number` | 覆盖几列（同一月份连续覆盖的列数） |
| `monthKey` | `string` | `YYYY-MM`，供组件决定文案（`MM月` / `MMM`） |

**规则**：每列恰好归属一个月份（按该列周一的年月），相邻同月合并；**第一个 tick 的 `weekIndex` 必为 0**，最后一批 tick 必须覆盖到末列。

## 5. MetricCard

指标区的一张卡（四张之一，顺序固定）。

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | `"average" \| "streak" \| "compare" \| "backlog"` | 稳定标识 |
| `value` | `string` | 已格式化好的主数值；不可用时为 `"—"` |
| `labelKey` | `MessageKey` | `stats.cardAverage` / `cardStreak` / `cardCompare` / `cardBacklog` |
| `hint` | `string` | 一句补充（可为空串） |
| `live` | `boolean` | 是否为实时值（只有 `backlog` 为 `true`） |

**规则**：`value` 永远不为空串、不为 `NaN`/`Infinity`（FR-011）；`live === true` 的卡片必须渲染「实时」标记（FR-012）。

## 不变量（可断言）

| 编号 | 不变量 | 对应需求 |
|---|---|---|
| **H-1** | 每列恰好 7 个格；`weekCount * 7 === 空格数 + span.days`；区间内格数 `=== span.days` | FR-002 |
| **H-2** | `levelOf` 单调不减：`c1 ≤ c2 ⇒ levelOf(c1) ≤ levelOf(c2)`；`levelOf(0) === 0`；`levelOf(7) === 4`；负数/NaN → `0` | FR-003 |
| **H-3** | `isToday` 为真的格**恰好 1 个**（当 `today ∈ [start, end]`），否则 0 个 | FR-005 |
| **H-4** | 当 `maxCount > 0` 时，`isPeak` 的格 ≥1 个，且**每一个** `isPeak` 格的 `count === maxCount`；`maxCount === 0` 时无峰值 | FR-006 |
| **H-5** | 第一列第 0 个格的日期是该周的周一，且 `≤ span.start`；最后一列第 6 个格 `≥ span.end` | FR-002 |
| **H-6** | `dates` 严格升序、无重复、长度 `=== span.days`，且 `dates[0] === span.start`、末项 `=== span.end` | FR-009 |
| **H-7** | `isOutside` 的格不出现在 `dates` 中，且组件不得给其 `tabindex` 或 `data-cell-key` | FR-007 / FR-009 |
| **H-8** | `cellSize` 由 `weekCount` 唯一决定（≤5 → 22、≤8 → 18、否则 14），与区间长度无关的抖动不存在 | FR-018 |
| **T-1** | `ticks[0].weekIndex === 0`；`Σ ticks[i].span === weekCount`；`ticks` 无重叠 | Edge Case「跨年」 |
| **M-1** | 四张卡始终存在（顺序固定）；`value` 非空且非 `NaN`/`Infinity` | FR-010 / FR-011 |
| **M-2** | 只有 `backlog` 卡 `live === true` | FR-012 |

## 状态与生命周期

- **无持久状态**：`activeDate`（键盘焦点）、`tooltipOpen`、`filter`（下钻）、分组折叠状态全部是组件内 `ref`，**不落库、不落 localStorage**（FR-017 + 宪法 II）。
- **重置时机**：`load()` 成功时统一重置（与原 `resetGroups()` 同一处），并重新把 `activeDate` 落在峰值日（无峰值落在 `dates[0]`）；`pickPreset()`、`onEdit()`、应用自定义日期时清空 `filter`。
- **时间基准**：`today` 在组件挂载时取一次（`dayjs().format("YYYY-MM-DD")`），与 002/003 一致；跨零点不刷新（面板可关闭重开）。

## 校验规则（来自需求）

| 规则 | 说明 |
|---|---|
| 区间必为闭区间 | 起止都含（沿用 002） |
| 区间外不渲染数据 | 空格没有 `count`，不参与悬停/点击/键盘 |
| 档位不含比例换算 | 今天未过完也按已计数落档，不做「按时间折算」的假精确（spec Edge Case） |
| 0 件区间仍出骨架 | 全中性格 + 结论句空态 + 引导（Clarifications Q5） |
