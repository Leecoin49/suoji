# Data Model: 复盘面板的可读性重做

**无数据库实体。** 本 feature 不新增表/列/索引，也不读取任何新字段（`tasks` 现有 15 列照旧）。以下是**视图层**实体：它们全部在内存中由 `StatsRaw` 派生，刷新即重建，不持久化。

派生链：

```
StatsRaw (api.getStats, 冻结)
   └─ toView(raw, today) ──► StatsView (002 冻结)
        ├─ conclusionOf(view) ──► Conclusion          ← 新增
        ├─ axisBucketsOf(view) ──► AxisBucket[]       ← 新增（Bucket 的呈现扩展）
        ├─ groupDoneByDay(raw.done) ──► DayGroup[]    ← 新增
        ├─ filterEntries(raw.done, filter) ──► DoneEntry[]  ← 新增
        └─ sparsityOf(view) ──► Sparsity              ← 新增
```

---

## 1. Conclusion（结论）

一句人话结论的结构化形态。**不是新数据**，只是既有聚合的叙述化表达。

| 字段 | 类型 | 说明 | 来源 |
|---|---|---|---|
| `done` | `number` | 区间内有完成时刻的件数 | `StatsView.doneTotal` |
| `compare.state` | `"up" \| "down" \| "flat" \| "none"` | 与上一等长区间的比较态 | `StatsView.compare.state`（`prevTotal <= 0` 时为 `none`） |
| `compare.delta` | `number` | 差值（`none` 时为 0） | `StatsView.compare.delta` |
| `peak` | `{ date: string; count: number } \| null` | 最忙的一天；并列取**最早**的一天；`done === 0` 时为 `null` | 由 `raw.done` 的日计数算出 |
| `gapDays` | `number` | 区间内「0 件」的完整天数（天桶；周/月档时为「0 件的桶数」） | `AxisBucket[]` 计数 |

**不变量**

- `C-1`：`done` 恒等于 `StatsView.doneTotal`（FR-003 与 SC-002 的自洽性锚点）。
- `C-2`：`compare.state === "up"` ⟺ `delta > 0`；`"down"` ⟺ `delta < 0`；`"flat"` ⟺ `delta === 0 && prevTotal > 0`；`"none"` ⟺ `prevTotal <= 0`。
- `C-3`：`peak === null` ⟺ `done === 0`。
- `C-4`：`gapDays` 不包含「今天」这个不完整日（区间结束日为今天时，今天 0 件不计为断档，由 `AxisBucket.isPartial` 单独标注，FR-013）。
- `C-5`：所有字段有限数，`Number.isFinite` 全为真（FR-004 / SC-004）。

**呈现规则**：组件按 `compare.state` 与 `peak`/`gapDays` 选 key 拼句；`gapDays === 0` 用 `stats.conclusionNoGap`，不省略节奏分句（避免句子结构因数据而残缺）。

---

## 2. AxisBucket（可读时间桶）

在既有 `Bucket` 之上加呈现标记。**不修改 002 的 `Bucket`**，而是在 `axisBucketsOf` 里返回新的数组类型。

| 字段 | 类型 | 说明 |
|---|---|---|
| `key` / `label` / `start` / `end` / `count` / `clipped` | 同 `Bucket` | 逐字沿用（`label` 仍是数字形式，跨语言一致） |
| `isPeak` | `boolean` | 是否等于区间最大值；并列时**全部**标记（图上看得出「一样忙」） |
| `isZero` | `boolean` | `count === 0` |
| `isPartial` | `boolean` | 该桶包含今天，且区间结束日 ≥ 今天（「今天还没过完」） |
| `share` | `number` | `count / doneTotal`，`doneTotal === 0` 时为 0（永不产出 `NaN`） |
| `heightPct` | `number` | `count === 0 ? 0 : max(4, round(count / maxCount * 100))`，取值 0 或 [4,100] |

**校验与不变量**

- `B-1`：`Σ bucket.count === StatsView.doneTotal`（002 的 SC-003 仍成立）。
- `B-2`：`share` 之和 ≈ 1（浮点容差 1e-6；`doneTotal === 0` 时全 0）。
- `B-3`：`isZero.length + 非零数 === buckets.length`；`isPeak` 至少标记 1 个（`doneTotal > 0` 时）。
- `B-4`：`start <= end`，且 `bucket.start >= span.start`、`bucket.end <= span.end`（裁剪后）。
- `B-5`：`heightPct` 单调：`count1 > count2 ⟹ heightPct1 >= heightPct2`（避免小值被抬高后视觉倒挂）。

---

## 3. DayGroup（明细分组）

| 字段 | 类型 | 说明 |
|---|---|---|
| `date` | `string` | `YYYY-MM-DD`；**未标注组**为固定值 `"__undated__"` |
| `isUndated` | `boolean` | 是否为「未标注完成时间」组 |
| `count` | `number` | 该组件数 |
| `entries` | `DoneEntry[]` | 组内条目，组内按 `doneAt` 降序（同日按时分降序，再按 id 升序保证稳定） |
| `expanded` | `boolean` | 是否展开（视图状态，非持久化） |
| `shownCount` | `number` | 展开后默认显示 `min(10, count)`，其余靠 `showAll` 展开 |

**排序与不变量**

- `G-1`：分组按 `date` **倒序**；未标注组**永远在最后**（FR-009）。
- `G-2`：`Σ group.count === raw.done.length`（未标注组不计入，因为 `raw.done` 只含有 `done_at` 的行；未标注来自 `raw.undated` 的计数，条目本体不在 `raw.done` 中）。
  - 呈现：未标注组展示件数并提示「这些任务没有完成时刻，无法归入某一天」，**不**伪造条目行。
- `G-3`：默认展开最近 5 个**有数据**的组（`count > 0`），其余 `expanded === false`（D4）。
- `G-4`：展开/折叠不改变任何数字（FR-008）——`DayGroup.count` 与 `StatsView` 无数据依赖方向。

---

## 4. Filter（下钻筛选）

只在视图层生效的范围约束。

| 字段 | 类型 | 说明 |
|---|---|---|
| `key` | `string` | 被点击桶的 `AxisBucket.key`（用于「再点一次取消」与 `aria-pressed`） |
| `start` | `string` | 桶的 `start`（已裁剪） |
| `end` | `string` | 桶的 `end`（已裁剪） |
| `label` | `string` | 用于 `stats.filterActive` 的展示文本（天桶：`dayLabel`；周/月桶：`fullDayLabel(start) → fullDayLabel(end)` 或月份标签） |

**状态迁移**

```
(none) --点击桶--> Filter(key) --再点同桶--> (none)
Filter(key) --点击其它桶--> Filter(key')
Filter(any)  --切换预设 / 改自定义日期 / 重新 load--> (none)
Filter(any)  --关闭面板再打开--> (none)            [组件重建，不持久化]
```

**不变量**

- `F-1`：`filterEntries(entries, filter)` 的结果满足 `e.doneAt.slice(0,10) >= start && <= end`，且条数等于该桶的 `count`（SC-004）。
- `F-2`：筛选后为 0 条时（理论上仅当桶 `count === 0`）显示 `stats.filterEmpty`，不显示空列表（FR/Edge Cases）。
- `F-3`：筛选状态不写任何存储（SC-009）。

---

## 5. Sparsity（稀疏分档）

| 取值 | 判据（短路顺序） | 呈现 |
|---|---|---|
| `none` | `doneTotal === 0 && undated === 0` | `stats.emptyNone` + `stats.emptyNextHint`，图隐藏（或显示空图骨架） |
| `undatedOnly` | `doneTotal === 0 && undated > 0` | `stats.emptyNone` 的变体文案 + 未标注提示（明确「这些记录没有完成时刻」） |
| `one` | `doneTotal === 1` | `stats.emptyOne` + `stats.emptyNextHint` |
| `few` | `doneTotal > 1 && 有数据的天数 < 3` | `stats.emptyFew`（`{n}`）+ `stats.emptyNextHint` |
| `ok` | 其余 | 正常渲染 |

**不变量**

- `S-1`：五档互斥且穷尽（同一 `StatsView` 只落一档）。
- `S-2`：`ok` 时**不显示**任何空态文案；非 `ok` 时**不显示**结论句与图形（避免「0 件，持平」这类噪声结论，FR-002 / US1 场景 3）。
- `S-3`：不得引用 `history.emptyTitle` / `history.emptyHint`（FR-010）。

---

## 与 spec 需求的对应

| 需求 | 落点 |
|---|---|
| FR-002 / FR-003 / FR-004 | `Conclusion`（C-1 … C-5） |
| FR-005 / FR-006 / FR-013 | `AxisBucket`（B-3、`isPeak`/`isZero`/`isPartial`、`heightPct`） |
| FR-007 | `Filter`（状态迁移 + F-1 … F-3） |
| FR-008 / FR-009 | `DayGroup`（G-1 … G-4） |
| FR-010 | `Sparsity`（S-1 … S-3） |
| FR-001 / SC-009 | 全实体均为内存派生，无写入路径 |
| FR-011 | 组件层（见 `contracts/stats-clarity.md` §4 键盘映射） |
| FR-012 | 组件层静态文案（口径脚注折叠） |
| FR-014 / SC-010 / SC-011 | `research.md` R1 / R9（零依赖、零新 token） |
