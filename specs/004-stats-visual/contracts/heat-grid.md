# Contract — 热力图与指标卡（004-stats-visual）

**Plan**: [plan.md](../plan.md) | **Data model**: [data-model.md](../data-model.md) | **Spec**: [spec.md](../spec.md)

本契约规定三件事：**什么被冻结**（003 已交付的行为不得回退）、**新增什么签名**（纯函数与 DOM 契约）、**怎么断言**。

---

## 1. 冻结面（不得改动）

| 面 | 内容 |
|---|---|
| **IPC** | 17 条命令；`StatsRaw` 的 9 个字段名与类型；`getStats(start, end)` 入参 |
| **纯函数** | 002 的 8 个：`isIsoDay` / `validateRange` / `granularityOf` / `bucketize` / `maxCountOf` / `streakOf` / `compareOf` / `toView`；003 的 6 个：`conclusionOf` / `axisBucketsOf` / `axisTicksOf` / `sparsityOf` / `groupDoneByDay` / `filterEntries` —— **签名与行为一字不改** |
| **口径** | 闭区间、`end` 超过今天钳到今天、推后榜（区间内被推后 + 累计次数）、连续天数（区间内数到起点即停）、平均（有完成时刻 ÷ 区间天数）、未标注单独计数 |
| **文案** | 既有 34 条 `stats.*` key 不删不改；`history.*` 不得被复盘复用为空态 |
| **权限** | `capabilities/default.json` 15 项不变 |

## 2. 新增纯函数（`src/lib/stats.ts`）

全部无副作用：不读 DOM、不读 `Date.now()`（`today` 由调用方传入）、不写存储。

```ts
export type HeatLevel = 0 | 1 | 2 | 3 | 4;

/** 件数 → 档位。0 → 0；1 → 1；2–3 → 2；4–6 → 3；≥7 → 4；负数/NaN → 0。 */
export function levelOf(count: number): HeatLevel;

export type HeatCell = {
  date: string;        // YYYY-MM-DD
  count: number;       // 区间外为 0
  level: HeatLevel;    // 区间外为 0
  isToday: boolean;
  isPeak: boolean;     // count > 0 && count === maxCount
  isOutside: boolean;  // date < span.start || date > span.end
  key: string;         // === date
};

export type MonthTick = { weekIndex: number; span: number; monthKey: string };

export type HeatGrid = {
  weeks: HeatCell[][]; // 列优先；每列恒 7 格（周一…周日）
  weekCount: number;
  firstMonday: string;
  lastSunday: string;
  cellSize: 22 | 18 | 14; // weekCount ≤5 → 22；≤8 → 18；否则 14
  dates: string[];        // 区间内日期，网格顺序升序
  ticks: MonthTick[];
};

/**
 * @param axis 天档桶（`granularityOf(days) === "day"` 时与日期一一对应）
 * @param span 已钳制过的区间（`StatsSpan` 的 start/end）
 * @param today 本地今天（YYYY-MM-DD）
 */
export function heatGridOf(axis: AxisBucket[], span: { start: string; end: string }, today: string): HeatGrid;

/** 列头月标签：每列按周一的年月归属，相邻同月合并。 */
export function monthTicksOf(weeks: HeatCell[][]): MonthTick[];

/** 键盘可漫游的日期序列（= 区间内日期，网格顺序）。 */
export function heatDatesOf(grid: HeatGrid): string[];

/**
 * 焦点移动：ArrowRight/ArrowLeft ±1 天，ArrowUp/ArrowDown ±7 天，
 * Home/End 跳到首末；越界停在边界，不循环。未知键原样返回 current。
 */
export function heatMove(
  dates: string[],
  current: string,
  key: "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown" | "Home" | "End" | string,
): string;
```

## 3. 组件必须保留的既有行为

以下 6 项在 003 已验收，重排时不得改变（违反即 SC-008 回退）：

1. 每次区间变化只发**一次** `api.getStats`。
2. `ticket` 递增防串号：迟到响应不得覆盖较新结果（FR-014「快速连点」）。
3. 查询失败时保留上一次结果，只显示 `stats.error` 横幅，**不弹窗、不清空**。
4. 预设 7/30/90 + 自定义起止；`end` 超过今天显示 `stats.rangeClamped`；非法区间只显示 `stats.rangeInvalid`、不提交。
5. 结论句仍由 `conclusionOf(view, today, raw.done)` 产出，位置在图表之上。
6. `emit("close")` 与标题栏关闭按钮语义不变。

**新增**：

7. 天档（`granularity === "day"`）渲染热力图；周/月档渲染 003 的柱图；两者共用同一份 `axis` 与 `filter`。
8. 热力图结果容器带 `:key="applied.start + applied.end"` 与 `.fade-swap`，触发 150ms 淡入。
9. 图表容器高度固定（`min-h-[168px]`），切换区间不改变高度。

## 4. 键盘与 ARIA 契约

| 元素 | 契约 |
|---|---|
| 热力图容器 | `role="group"`，`aria-label` = 图表标题 + 区间 |
| 区间内格 | `<button>`；`aria-label` = 「10月29日，8 件，占 13%」；`aria-pressed` = 是否已下钻；`aria-current="date"` 仅今天 |
| 焦点管理 | roving tabindex：仅 `activeDate` 那格 `tabindex="0"`，其余 `-1` |
| 键位 | `←/→` ±1 天、`↑/↓` ±7 天、`Home/End` 首末、`Enter/Space` 交原生 click、不被 `←/→` 拦截的 `Tab` 正常离开图表 |
| 区间外格 | 渲染为 `div` 占位，**无** `tabindex`、**无** `data-cell-key`、无 `aria` 语义（颜色仅作网格纹理） |
| 行标签 | 周一/周三/周五三行文字，`aria-hidden="true"`（日期已在每格 `aria-label` 里） |
| 图例 | `aria-hidden="true"`（纯装饰；颜色含义已在每格 `aria-label` 的数字里） |
| 焦点环 | `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-1 focus-visible:ring-offset-card`（与 003 相同常量） |

## 5. 新增 i18n key（14 条，zh/en 必须同提交）

| key | zh | en |
|---|---|---|
| `stats.heatLegendLess` | 少 | Less |
| `stats.heatLegendMore` | 多 | More |
| `stats.heatToday` | 今天 | Today |
| `stats.heatPeak` | 最忙 | Peak |
| `stats.heatEmptyRange` | 这段时间一格都不亮 | Nothing lit up in this stretch |
| `stats.weekdayMon` | 一 | Mon |
| `stats.weekdayWed` | 三 | Wed |
| `stats.weekdayFri` | 五 | Fri |
| `stats.cardAverage` | 平均每天 | Per day |
| `stats.cardStreak` | 连续天数 | Streak |
| `stats.cardCompare` | 环比上一段 | vs. previous |
| `stats.cardBacklog` | 此刻积压 | Backlog now |
| `stats.realtime` | 实时 | Live |
| `stats.metricUnavailable` | — | — |

> 与 spec 的 10 条差异：`weekdayMon/Wed/Fri`（热力图行标签，3 条）与 `realtime`（FR-012 的显式标注，1 条）在 spec 写完后补齐。总数 14，`check-i18n` 期望 `zh=203 en=203`（189 + 14）。
>
> 复用不改：`hoverRange` / `hoverCount` / `hoverShare` / `peakBadge` / `dayZero` / `partialDay` / `axisZero/Mid/Max` / `average` / `streak` / `streakNone` / `compare` / `compareUp/Down/Flat/None` / `backlog` / `backlogHint` / `undated` / `emptyNone` / `emptyOne` / `emptyFew` / `emptyNextHint` / `groupUndated` / `filterActive` / `filterActiveDay` / `filterClear` / `filterEmpty` / `conclusion*` / `footnote*`。

## 6. 只读约束

- 组件内 `api.*` 调用只允许 `api.getStats`（`grep -n "api\." src/components/StatsSheet.vue` 只命中一次）。
- 禁止 `localStorage` / `sessionStorage` / 直接 `invoke` / 任何写命令名（`add_task`、`set_done`、`drop_task` …）。
- 热力图、卡片、焦点、下钻、折叠状态全部只在内存；关闭面板即丢弃。

## 7. 断言清单（`verify/visual_check.mjs`）

必须以 `OK (0 failure(s))` 结束，覆盖：

| 组 | 断言 |
|---|---|
| 档位 | `levelOf` 的 0/1/2/3/4 边界（0、1、2、3、4、6、7、20）、负数、`NaN` |
| 网格形状 | 30 天 → 5 列 ×7 格、区间内 30 格、空格 = 5；90 天 → 13 列；1 天 → 1 列 7 格中 1 个在内；365 天走向由调用方保证（本函数只处理天档） |
| 首末对齐 | `firstMonday ≤ span.start` 且是周一；`lastSunday ≥ span.end` 且是周日；区间起点不在周一时首列前几格 `isOutside` |
| 今天 | 区间含今天 → 恰 1 格 `isToday`；区间在过去 → 0 格 |
| 峰值 | 并列最大 → 多个 `isPeak`；全 0 → 无峰值 |
| 顺序 | `dates` 严格升序、`dates[0] === start`、末项 `=== end`、长度 = `span.days` |
| 尺寸 | `cellSize` 三档切换点（5/6 列、8/9 列） |
| 月标签 | `ticks[0].weekIndex === 0`、`Σ span === weekCount`、跨年（12 月 → 1 月两个 tick） |
| 键盘 | `heatMove` 的 ±1 / ±7 / Home / End / 边界不循环 / 未知键原样 |
| 回归 | 直接复用 002 的 `lib_check.mjs` 与 003 的 `clarity_check.mjs`，两者仍须全绿 |
