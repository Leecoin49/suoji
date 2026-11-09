# Contract: 复盘面板可读性（`003-stats-clarity`）

本 feature 不改任何跨进程契约。以下是**本 feature 自己建立、实现期不得偏离**的契约：新增纯函数签名、UI 交互与键盘映射、i18n key 表、只读性与验收断言。

---

## 1. 冻结面（继承 002，不得改动）

| 项 | 冻结内容 | 违反后果 |
|---|---|---|
| IPC | 17 条命令、`get_stats(db, start, end)` 签名 | 契约破裂，需重走 002 |
| 数据结构 | `StatsRaw` / `StatsSpan` / `DoneEntry` / `RollEntry` 的字段名、顺序、可空性（camelCase） | 前端拿到 `undefined` |
| 纯函数 | `stats.ts` 既有 8 个导出：`isIsoDay`、`validateRange`、`granularityOf`、`bucketize`、`maxCountOf`、`streakOf`、`compareOf`、`toView`（含 `Bucket` / `Compare` / `StatsView` / `Granularity` / `CompareState` 类型） | 002 的 `verify/lib_check.mjs` 会红 |
| 口径 | 预设 N 天 = `today−(N−1)` 至 `today`；≤90 天/91–365 周/>365 月；首末桶裁剪；推后榜累计 + 排序 | 数字与 002 验收记录不符 |
| 依赖 | `package.json` / `pnpm-lock.yaml` / `Cargo.toml` 零改动 | SC-010 失败 |
| 权限 | `src-tauri/capabilities/default.json` 保持 15 项 | 宪法 IV |
| 入口 | `TitleBar.vue` 一个图标按钮 + 面板内关闭；`Esc` 退回「今天」；与其它 sheet 互斥 | FR-016 |

---

## 2. 新增纯函数（`src/lib/stats.ts`，全部无副作用、不读时钟）

```ts
export type Sparsity = "none" | "undatedOnly" | "one" | "few" | "ok";

export interface Conclusion {
  done: number;
  compare: { state: CompareState; delta: number };
  peak: { date: string; count: number } | null;
  gapDays: number;
}

export interface AxisBucket extends Bucket {
  isPeak: boolean;
  isZero: boolean;
  isPartial: boolean;
  share: number;
  heightPct: number;
}

export interface DayGroup {
  date: string;          // "YYYY-MM-DD" 或 "__undated__"
  isUndated: boolean;
  count: number;
  entries: DoneEntry[];
}

export interface DrillFilter {
  key: string;
  start: string;
  end: string;
}

/** 结论：最忙一天（并列取最早）、断档天数（不含今天）、比较态。 */
export function conclusionOf(view: StatsView, today: string): Conclusion;

/** 在既有 Bucket 上加 isPeak / isZero / isPartial / share / heightPct。 */
export function axisBucketsOf(view: StatsView, today: string): AxisBucket[];

/** 按本地日期分组，日期倒序；未标注组由组件按 raw.undated 单独渲染，不在此处伪造条目。 */
export function groupDoneByDay(entries: DoneEntry[]): DayGroup[];

/** 视图层筛选：闭区间，按 doneAt 前 10 字符比较。 */
export function filterEntries(entries: DoneEntry[], filter: DrillFilter | null): DoneEntry[];

/** 稀疏分档，短路顺序见 data-model.md §5。 */
export function sparsityOf(view: StatsView): Sparsity;

/** 刻度值：返回含 0 的三档整数（0 / 中 / 最大）。maxCount 为 1 时返回 [0, 1, 1]。 */
export function axisTicksOf(maxCount: number): [number, number, number];
```

**不变量**（实现与断言共用；编号对应 `data-model.md`）

- `C-1`：`conclusionOf(view).done === view.doneTotal`。
- `C-3`：`peak === null` ⟺ `done === 0`；并列最大取日期最早。
- `C-4`：`gapDays` 不计今天（`span.end >= today` 时，今天 0 件不算断档）。
- `B-2`：`Σ share` 在 `doneTotal > 0` 时落在 `[1 − 1e-6, 1 + 1e-6]`；`doneTotal === 0` 时全 0 且无 `NaN`。
- `B-5`：`heightPct` 单调不减于 `count`。
- `G-1`：`groupDoneByDay` 结果按 `date` 严格倒序，日期格式恒为 `YYYY-MM-DD`。
- `F-1`：`filterEntries(entries, f).length === axisBucketsOf(...).find(b => b.key === f.key).count`。
- `S-1`：五档互斥穷尽。
- 全部函数：`Number.isFinite` 对每个数值字段为真。

---

## 3. 组件契约（`src/components/StatsSheet.vue`）

**props：无**（沿用 002 的 `defineEmits<{ close: [] }>()`，由 `App.vue` 控制显隐）。

**必须保留的既有行为**（重写时不得丢）：

| 行为 | 位置（002 现状） | 说明 |
|---|---|---|
| `api.getStats(range.start, range.end)` 单次调用 | `load()` | 不新增第二次查询 |
| `ticket` 递增防串号 | `let ticket = 0` + `if (mine !== ticket) return` | 快速连点不闪不串 |
| 失败时保留上次结果 + 顶部提示 | `failed` ref + `stats.error` | 失败不白屏 |
| 预设 7 / 30 / 90 + 自定义起止 | `presets` / `pickPreset` / `onEdit` | 语义与 002 一致 |
| 结束日超过今天提示 | `stats.rangeClamped` | 沿用 |
| `Esc` 关闭、`X` 关闭 | `emit("close")` | 与其它 sheet 一致 |

**新增视图状态**

| 状态 | 类型 | 初值 | 重置时机 |
|---|---|---|---|
| `filter` | `DrillFilter \| null` | `null` | `load()` 成功、`pickPreset()`、`onEdit()`、应用自定义日期 |
| `expandedGroups` | `Set<string>` | 最近 5 个有数据的天 | 区间变化、筛选变化 |
| `allGroupsOpen` | `boolean` | `false` | 同上 |
| `activeBarKey` | `string \| null` | `null`（打开后取 `isPeak` 的第一个非 0 桶） | 区间变化 |
| `footnoteOpen` | `boolean` | `false` | 不重置（面板内临时展开） |

---

## 4. 键盘映射（FR-011）

| 位置 | 键 | 行为 |
|---|---|---|
| 面板任意处 | `Esc` | 关闭面板（由 `App.vue` 既有分支处理） |
| 打开后首次 | — | 焦点落在第一个预设按钮（`nextTick`） |
| 面板内 | `Tab` / `Shift+Tab` | 在「关闭 → 预设 → 日期输入 → 图形（单点）→ 折叠按钮 → 脚注开关」间移动 |
| 图形容器内 | `←` / `→` | 在相邻桶之间移动焦点（不改变筛选） |
| 图形容器内 | `Home` / `End` | 跳到第一个 / 最后一个桶 |
| 图形容器内 | `Enter` / `Space` | 切换下钻筛选（等价点击） |
| 图形容器内 | `Tab` | 离开图形，进入下一个区块（只占 1 个 Tab 位，roving tabindex） |

**焦点环**：组件内常量 `focusRing`，所有可聚焦元素 MUST 引用；MUST NOT 新增颜色 token。

**ARIA**：桶元素 `role="button"` 语义（原生 `<button>`）、`aria-label` = 「日期范围，件数，占比」、筛选态 `aria-pressed="true"`；图形容器 `role="group"` + `aria-label="统计.按天/按周/按月"`；折叠按钮 `aria-expanded`。

---

## 5. i18n key 表（zh / en 成对，占位符一致）

| key | 占位符 | 用途 | zh 示例 | en 示例 |
|---|---|---|---|---|
| `stats.conclusion` | `{n}` | 主句：这期间做完 N 件 | 这期间做完 {n} 件 | {n} done in this stretch |
| `stats.conclusionPrevUp` | `{n}` | 比上一段多 | 比上一段多 {n} 件 | {n} more than the previous stretch |
| `stats.conclusionPrevDown` | `{n}` | 比上一段少 | 比上一段少 {n} 件 | {n} fewer than the previous stretch |
| `stats.conclusionPrevFlat` | — | 持平 | 和上一段持平 | same as the previous stretch |
| `stats.conclusionPrevNone` | — | 无可比 | 上一段没有记录，暂无可比 | nothing to compare with |
| `stats.conclusionJoin` | — | 分句连接符 | ， | ; |
| `stats.conclusionPeak` | `{d}` `{n}` | 最忙一天 | 最忙的一天是 {d}，做了 {n} 件 | busiest on {d} with {n} |
| `stats.conclusionGap` | `{n}` | 断档天数 | 中间有 {n} 天没做 | {n} quiet days in between |
| `stats.conclusionNoGap` | — | 无断档 | 每天都至少做了一件 | not a single quiet day |
| `stats.axisZero` / `axisMid` / `axisMax` | `{n}`（后两者） | 刻度 | 0 / {n} / {n} | 0 / {n} / {n} |
| `stats.peakBadge` | — | 最高点徽标 | 最多 | peak |
| `stats.partialDay` | — | 今天不完整 | 今天还没过完 | today is not over |
| `stats.hoverRange` | `{from}` `{to}` | 悬停日期段 | {from} → {to} | {from} → {to} |
| `stats.hoverCount` | `{n}` | 悬停件数 | {n} 件 | {n} done |
| `stats.hoverShare` | `{p}` | 悬停占比 | 占 {p}% | {p}% of the stretch |
| `stats.filterActive` | `{from}` `{to}` | 筛选提示 | 只看 {from} → {to} | showing {from} → {to} |
| `stats.filterClear` | — | 清除筛选 | 显示全部 | show all |
| `stats.filterEmpty` | — | 筛选后为空 | 这一段没有完成记录 | nothing finished in this slice |
| `stats.groupCount` | `{n}` | 组头件数 | {n} 件 | {n} done |
| `stats.groupMore` | `{n}` | 还有 N 天 | 还有 {n} 天 | {n} more days |
| `stats.groupCollapse` | — | 收起 | 收起 | collapse |
| `stats.groupUndated` | `{n}` | 未标注组 | 另有 {n} 件没留完成时间 | {n} without a completion time |
| `stats.emptyNone` | — | 0 件 | 这段时间没有完成记录 | nothing was finished in this stretch |
| `stats.emptyOne` | — | 仅 1 件 | 目前只有 1 件有完成时刻的记录 | only one completion on record |
| `stats.emptyFew` | `{n}` | 数据太少 | 只有 {n} 天有记录 | only {n} days have records |
| `stats.emptyNextHint` | — | 下一步 | 再记几天就能看出节奏了 | a few more days and a rhythm will show |
| `stats.footnoteSummary` | — | 口径一行 | 口径说明 | how these numbers are counted |
| `stats.footnoteRolled` | — | 累计推后 | 推后次数是累计值 | push-backs are a running total |
| `stats.footnoteBacklog` | — | 实时积压 | 没做完的件数是此刻的实时值 | the backlog is right now, not then |
| `stats.footnoteUndated` | — | 未标注 | 没有完成时刻的记录只计入总数 | rows without a completion time only count in the total |

**约束**：既有 `stats.empty` / `stats.emptyHint` / `stats.total` / `stats.average` / `stats.streak` / `stats.compare*` / `stats.rolled*` / `stats.backlog*` / `stats.undated` / `stats.detail` / `stats.close` / `stats.title` / `stats.subtitle` / `stats.open` / `stats.range*` / `stats.by*` / `stats.dayZero` / `stats.loading` / `stats.error` **保留不动**；新增 key 只追加；`stats.perDay` 语义保持「分布标题」。`content.zh.stats` / `content.en.stats` 各 3 行改写为反映新面板。

---

## 6. 只读性

- 组件内 MUST NOT 出现 `api.` 的写命令（`addTask` / `setDone` / `setNote` / `moveToDate` / `dropTask` / `pushToTomorrow` / `backToInbox` / `closeOut` / `saveSettings` 等）。
- MUST NOT 写 `localStorage` / `sessionStorage` / Tauri store；筛选、折叠、脚注状态只在内存。
- MUST NOT 新增 `SELECT`；`getStats` 仍是唯一数据来源。
- 验收脚本对组件源码做关键字扫描（参照 002 的 `verify/sc009-readonly.txt`），命中即失败。

---

## 7. 实现期断言清单（`specs/003-stats-clarity/verify/`）

| 脚本 | 断言 | 对应 |
|---|---|---|
| `clarity_check.mjs` | `C-1` / `C-3` / `C-4` / `B-2` / `B-5` / `G-1` / `F-1` / `S-1` / 全 `isFinite` | FR-002…FR-010、SC-002/003/004/005 |
| `clarity_check.mjs` | `axisTicksOf(1)`、`axisBucketsOf` 在 30/90/365/1096 天四档的桶数与 `Σ count` | SC-003（不回归 002） |
| `perf_check.mjs`（可选扩展） | `toView + axisBucketsOf + conclusionOf + groupDoneByDay` 在 10 000 条 / 365 天下的中位耗时 | SC-008 |
| `readonly_check.txt` | 组件源码扫描结果（0 个写命令关键字） | FR-001、SC-009 |
| `quickstart.md` §验收记录 | SC-001 / SC-006 / SC-010 / SC-011 的人工记录与截图清单 | SC-001/006/010/011 |
