---

description: "Task list for 004-stats-visual"
---

# Tasks: 复盘面板的视觉重做（热力图 + 指标卡 + 克制动效）

**输入**：`specs/004-stats-visual/`（spec.md / plan.md / research.md / data-model.md / contracts/heat-grid.md / quickstart.md）

**前置**：plan.md（必需）、spec.md（必需）、contracts/heat-grid.md（签名与 14 条 key 的权威来源）

**测试**：本 feature 不引入测试框架（宪法「栈冻结」+ 仓库现状）。断言任务指 `/speckit.implement` 用既有 `verify/*.mjs` 机制跑的脚本，不是新增测试依赖。

**组织**：按用户故事分组；US1 即可独立交付的 MVP。

## 任务行格式

任务行格式：复选框 + `T001`（三位序号，按执行顺序递增）+ 可选 `[P]` + 可选 `[US1]` + 必填类型标签 + 描述（含文件路径）。

类型标签四选一：`[契约]` `[门禁]` `[双语]` `[数据]`。

## 同文件串行约束（并发时必读）

- `src/lib/stats.ts`：T004 → T005 → T006 → T007，逐个追加以便断言（同一文件，**不得并行**）。
- `src/components/StatsSheet.vue`：T010 → T011 → T012 → T013 → T015 → T016 → T017 → T020（同一文件，**不得并行**）。
- `src/lib/i18n.ts`：T009 → T024 → T027。
- 可并行：T001/T003、T008/T009、T022/T023、T025/T026、T028。

---

## Phase 1: Setup（准备工作）

**目的**：让 004 的验收在一个可重复、可回滚的数据现场上进行。

- [x] T001 [门禁] 关停 dev 实例后备份当前库为 `%APPDATA%\com.tool.suoji\suoji.db.bak-<时间戳>`，用 `python specs\002-stats-dashboard\verify\seed_demo.py --out specs\004-stats-visual\verify\demo.db --days 90` 生成演示库并装回；把「当前生效 demo / 本次备份 / 用户真库 `bak-20261106-1730`」三条记录写进 `specs/004-stats-visual/verify/demo-note-004.txt`
- [x] T002 [门禁] 记录基线到 `specs/004-stats-visual/verify/baseline-004.txt`：`git status --short`、`git diff --stat package.json pnpm-lock.yaml src-tauri/Cargo.toml`、`scripts/speckit/check-i18n.ps1` 的 `zh=189 en=189`、`dist/assets/*.js` 当前体积（SC-011 的对照值）、demo 库三表行数
- [x] T003 [P] [契约] 冻结面快照到 `specs/004-stats-visual/verify/contract-freeze-004.txt`：`grep -c "commands::" src-tauri/src/lib.rs` = 17、`grep -c "invoke<" src/lib/api.ts`、`grep -c "stats\." src/components/StatsSheet.vue` 的 `api.` 调用数 = 1、`capabilities/default.json` 条目数 = 15、`src-tauri/src/model.rs` 里 `StatsRaw` 的字段清单

---

## Phase 2: Foundational（阻塞项：纯函数 + 双语 + 断言）

**目的**：把「一格亮几档」这类规则放进 `src/lib/stats.ts`，组件只做格式化。

**⚠️ 关键**：本阶段不完成，任何用户故事都无法独立验收。

- [x] T004 [契约] 在 `src/lib/stats.ts` 追加 `HeatLevel` / `HeatCell` / `MonthTick` / `HeatGrid` 类型与 `levelOf(count)`：0→0、1→1、2–3→2、4–6→3、≥7→4，负数与 NaN→0（`contracts/heat-grid.md` §2 逐字照抄）
- [x] T005 [契约] 在 `src/lib/stats.ts` 追加 `heatGridOf(axis, span, today)`：列优先、每列恒 7 格（周一…周日）、首列以 `span.start` 所在周的周一为首日、`isOutside` 覆盖 `date < span.start || date > span.end`、末列补到周日、`cellSize` 按 `weekCount ≤5→22 / ≤8→18 / 其余 14`、`dates` 只含区间内日期且升序、`ticks` 调 `monthTicksOf`
- [x] T006 [契约] 在 `src/lib/stats.ts` 追加 `monthTicksOf(weeks)`（按周一所属年月归属，相邻同月合并，`span` = 合并后的列数）与 `heatDatesOf(grid)`（返回 `grid.dates` 的副本）
- [x] T007 [契约] 在 `src/lib/stats.ts` 追加 `heatMove(dates, current, key)`：`ArrowLeft/Right` ±1、`ArrowUp/Down` ±7、`Home/End` 首末，越界停在边界不循环，未知键原样返回 `current`
- [x] T008 [P] [门禁] 新建 `specs/004-stats-visual/verify/visual_check.mjs`：断言 data-model 的 H-1（格数 = 7×列数）、H-2（档位单调）、H-3（今天至多一个）、H-4（峰值并列全标）、H-5（首末对齐区间）、H-6（dates 升序）、H-8（cellSize 三档边界 5/6/8/9）、T-1（月标签连续覆盖、span 之和 = 列数）、`levelOf` 全边界（-1/0/1/2/3/4/6/7/NaN）、`heatMove` 六键与越界、`heatDatesOf` 与 `dates` 等长；跑法照 `quickstart.md` §1（临时 `tsconfig.visual-verify.json` + `pnpm exec tsc -p` + `$env:STATS_BUNDLE`），结果写 `specs/004-stats-visual/verify/visual-report.txt`
- [x] T009 [P] [双语] 在 `src/lib/i18n.ts` 的 `dict.zh` 与 `dict.en` 成对追加 `contracts/heat-grid.md` §5 的 14 条 key（含 `stats.metricUnavailable` 两侧同为「—」），并在 `content.zh.stats` / `content.en.stats` 各补一句「日历热力图：一列一周，颜色越深那天做得越多」；改完跑 `scripts/speckit/check-i18n.ps1`，期望 PASS 且 `zh=203 en=203`

**检查点**：`visual-report.txt` 为 `OK (0 failure(s))`，`check-i18n` 通过，故事可以开工。

---

## Phase 3: User Story 1 - 一眼看到节奏（P1）🎯 MVP

**目标**：天档下主视图换成日历热力图，能看出哪几天忙、中间断没断、哪一周最密。

**独立验收**：只改天档渲染路径，周/月档不动；用 demo 库 90 天数据，点开面板默认 30 天即可验收 SC-001 / SC-002 / SC-006。

- [x] T010 [US1] 在 `src/components/StatsSheet.vue` 把天档（`granularity === "day"`）的柱区替换为热力图：`heatGrid` computed 调 `heatGridOf(axis, applied, today)`；容器 `grid` + `grid-template-rows: repeat(7, <cellSize>px)` + `grid-auto-flow: column` + `justify-content: space-between`；行标签列只渲染 `stats.weekdayMon/Wed/Fri` 三行且 `aria-hidden="true"`；列头月标签用 `grid.columnStart = tick.weekIndex + 1` 绝对对齐；图例 = 5 个色块（`bg-line-soft` / `bg-accent/20` / `/40` / `/65` / `bg-accent`）+ `stats.heatLegendLess` / `stats.heatLegendMore` + 最高档 `≥7`；周/月档保留 003 的柱图分支
- [x] T011 [US1] 在 `src/components/StatsSheet.vue` 补齐形状标记（FR-005/FR-006）：今天 = `ring-1 ring-ink/55 ring-offset-1 ring-offset-card`，峰值 = 右上角 `h-[4px] w-[4px] rounded-full bg-ink/70`；两者可叠加；0 件格用 `bg-line-soft` 保持边界可见；`stats.heatToday` / `stats.heatPeak` 在图例区各配一个小标记作说明
- [x] T012 [US1] 在 `src/components/StatsSheet.vue` 接通悬停与下钻（FR-007/FR-008）：复用一个 `activeCellKey`，提示框内容为 `hoverRange{fullDayLabel}` + `hoverCount{n}` + `hoverShare{p}`，`left` 由 `(列索引+0.5)/weekCount` 计算并 clamp 到 8%–92%；点击格子调既有 `toggleDrill`（key = date），再点同格取消，区间外空格不响应；下钻后 `filterText` 与 `filterClear` 行为不变
- [x] T013 [US1] 在 `src/components/StatsSheet.vue` 实现键盘与 ARIA（FR-009 + `contracts/heat-grid.md` §4）：roving tabindex（仅 `activeDate` 那格 `tabindex="0"`）、`@keydown` 用 `heatMove(heatDatesOf(grid), activeDate, e.key)` 更新焦点并 `focus()` 目标、`Enter/Space` 交原生 click、区间内格为 `<button aria-pressed aria-current>`、区间外格为无 `tabindex` 的 `<div>`、容器 `role="group"` + `aria-label`、焦点环沿用 `focusRing` 常量
- [x] T014 [US1] [门禁] 跑 `visual_check.mjs` 与 `pnpm exec vue-tsc --noEmit`；再把 SC-001 / SC-002 / SC-006 的判定步骤与观察结果写进 `specs/004-stats-visual/verify/acceptance-004.txt`（需要真人的项留表格待填，不得预填「通过」）

**检查点**：天档热力图可用、键盘可下钻、周/月档无回退。

---

## Phase 4: User Story 2 - 四张指标卡扫读（P2）

**目标**：把 `dl` 里的四组数字改成等宽卡片，一眼扫完四个维度。

**独立验收**：只改指标区，不动图表；560×720 下四张卡首屏可读。

- [x] T015 [US2] 在 `src/components/StatsSheet.vue` 用 `grid grid-cols-2 min-[620px]:grid-cols-4 gap-2` 渲染四张卡（`stats.cardAverage` / `cardStreak` / `cardCompare` / `cardBacklog`），每张 = 主数值（`text-[19px] font-display`）+ 标签（`text-[11px] text-ink-faint`）+ 一句补充（复用 `average` / `streakNone` / `compareLabel` / `backlogHint`）；删除原 `dl`；补上 T013 留下的卡片区高度不撑破首屏
- [x] T016 [US2] 在 `src/components/StatsSheet.vue` 处理不可用值（FR-011）：连续天数为 0、环比为 `none`、上一段为 0 三种情形主数值显示 `stats.metricUnavailable`（「—」）并在补充行解释原因；确认全链路 `isFinite`，不出现 `NaN` / `Infinity` / 空串
- [x] T017 [US2] 在 `src/components/StatsSheet.vue` 给积压卡加 `stats.realtime` 标注（`text-[10.5px]` + `bg-warn-soft` 小胶囊），其余三张不加；确保窄窗 2×2 时不换行截断
- [x] T018 [US2] [门禁] 把窗口拖到 560×720，截图存 `specs/004-stats-visual/verify/screenshots/two-by-two.png`，核对四张卡完整可读、无横向滚动；结果写进 `acceptance-004.txt` 的 SC-003 行

**检查点**：四张卡在两种宽度下都完整，数字与 003 一致。

---

## Phase 5: User Story 3 - 切换不抖（P3）

**���标**：区间切换有 150ms 淡入但不跳高度，尊重系统「减少动态效果」。

**独立验收**：只改容器与样式；录屏对比切换前后的高度。

- [x] T019 [P] [US3] 在 `src/style.css` 追加 `.fade-swap`（`animation: fade-swap 150ms ease-out`，只动 `opacity`）与 `@media (prefers-reduced-motion: reduce)` 下把所有 `animation-duration` / `transition-duration` / `scroll-behavior` 归零的全局规则；不改既有 `.rise` / `.sheet-up` 的定义
- [x] T020 [US3] 在 `src/components/StatsSheet.vue` 给结果容器加 `:key="applied.start + applied.end"` 与 `class="fade-swap"`，并把图表容器高度固定为 `min-h-[168px]`（两种视图共用），确认连续切换不叠加动画
- [x] T021 [US3] [门禁] 录屏连续切 7/30/90 各 3 次，逐帧确认可见高度跳变 0 次、空白闪烁 0 次；在系统「减少动态效果」开启前后各测一次切换耗时（期望 150±50ms / 0ms）；纯键盘走「移到某天 → 下钻 → 取消」计时（≤10 秒）；三条结果写进 `acceptance-004.txt` 的 SC-004 / SC-007 / SC-005 行

**检查点**：没有高度跳变，reduce 下无动画。

---

## Phase 6: Polish（回归、门禁、文档、收尾）

- [x] T022 [P] [门禁] 跑 002 的 `verify/fixture_check.py`、003 的 `verify/clarity_check.mjs`、`verify/perf_agg_003.mjs`，确认 SC-008 无回退；输出追加到 `specs/004-stats-visual/verify/regression-004.txt`
- [x] T023 [P] [数据] 只读核验到 `specs/004-stats-visual/verify/readonly-004.txt`：`src/components/StatsSheet.vue` 里 `api.*` 只出现 `getStats` 一次，`localStorage|sessionStorage|invoke\(` 命中 0，`INSERT|UPDATE|DELETE` 命中 0；打开面板前后对 demo 库取 SHA256 比对一致（SC-009）
- [x] T024 [P] [双语] 同步三处文档：`README.md` 与 `README.zh-CN.md` 的功能列表各补一句「复盘面板：日历热力图 + 四张指标卡」，`src/lib/i18n.ts` 的 `content.zh.stats` / `content.en.stats` 说明热力图怎么看；改完 `git diff --stat README.md README.zh-CN.md src/lib/i18n.ts` 应只有这三处
- [x] T025 [门禁] 跑 `pnpm build`，把模块数、JS/CSS 体积、与 `baseline-004.txt` 的差值写进 `specs/004-stats-visual/verify/build-report-004.txt`；核对 SC-010（`git diff --stat package.json pnpm-lock.yaml src-tauri/Cargo.toml` 三行全空）与 SC-011（JS 增幅 ≤ +8 kB，超出则在此停下说明）
- [x] T026 [门禁] 全量门禁：`scripts\speckit\gate.ps1`（期望 10 PASS / 0 FAIL / 0 SKIP）、`scripts\speckit\check-i18n.ps1`（`zh=203 en=203`）、`pnpm exec vue-tsc --noEmit`、`cargo fmt --manifest-path src-tauri\Cargo.toml --check`、`cargo clippy --manifest-path src-tauri\Cargo.toml --all-targets -- -D warnings`（后两条期望「无差异」，作为越界哨兵）；结果写 `specs/004-stats-visual/verify/gate-report-004.txt`
- [x] T027 [门禁] 按 `quickstart.md` §2 的矩阵填 SC-001…SC-011 的判定与证据路径；人工项（SC-001/002/003/004/005/006/007）在 `acceptance-004.txt` 里标注「待真人确认」并列出具体点击步骤，禁止预填通过
- [x] T028 [数据] 收尾还原：按 `demo-note-004.txt` 把 `%APPDATA%\com.tool.suoji\suoji.db` 还原为用户真库 `suoji.db.bak-20261106-1730`，删除 `specs/004-stats-visual/verify/demo.db`，比对 SHA256 后把结论追加到 `demo-note-004.txt`

---

## Dependencies & Execution Order

### 阶段依赖

- **Phase 1（Setup）**：无依赖，立即开始
- **Phase 2（Foundational）**：依赖 Phase 1 的验收现场（T001/T002）；**阻塞所有用户故事**
- **Phase 3（US1）**：依赖 T004–T009（纯函数 + i18n + 断言脚本）
- **Phase 4（US2）**：依赖 T009（卡片文案）；可与 US1 并行改不同区块，但同文件串行更稳（T010–T013 之后）
- **Phase 5（US3）**：T019 可独立于 US1/US2 先做；T020 需在 T010 之后（同一结果容器）
- **Phase 6（Polish）**：依赖全部故事完成

### 依赖图

```text
T001 ─┬─ T002 ── T008 ── T014 ── T018 ── T021 ── T022 ── T026 ── T027 ── T028
T003 ─┘          ▲
T004 ─ T005 ─ T006 ─ T007 ─┤
T009 ───────────────────────┴─ T010 ─ T011 ─ T012 ─ T013
                                  └─ T015 ─ T016 ─ T017
T019 ───────────────────────────────┴─ T020
T023 / T024 / T025 在 T020 之后并行
```

### 每个故事内部

1. 纯函数与断言先于组件（数字错了要能定位在 `stats.ts`）
2. 渲染 → 形状标记 → 交互 → 键盘，逐层加
3. 每个故事结束都跑一次 `vue-tsc`

---

## Parallel Example

```text
# Phase 2 并行（不同文件）：
T008  visual_check.mjs         ← 依赖 T004–T007 完成
T009  i18n.ts 的 14 条 key      ← 与 T008 无冲突

# Phase 6 并行（不同文件）：
T022  回归脚本输出
T023  只读扫描输出
T024  README ×2 + content 文案
T025  pnpm build 报告
```

---

## Implementation Strategy

### MVP 优先（只做 US1）

1. Phase 1 → Phase 2 → Phase 3
2. **停下验收**：SC-001 / SC-002 / SC-006 与人眼判断
3. 此时面板已经比 003 好在「一眼看到节奏」，指标卡与动效可以另起一次提交

### 增量交付

1. Setup + Foundational → 断言全绿（数字层已可信）
2. US1 → 热力图可用（MVP）
3. US2 → 四卡扫读
4. US3 → 动效与 a11y 收口
5. 每个故事单独可回滚：US2/US3 不通过时 US1 仍可交付

### 单人串行（本项目默认）

T001→T002→T003→T004→T005→T006→T007→T008→T009→T010→…→T028，每完成一个阶段跑一次门禁。

---

## Notes

- `[P]` = 不同文件、无未完成依赖；同一文件的多个任务永远不加 `[P]`
- 无 DDL、无迁移、无新 IPC、无新依赖：任务里不出现 `ALTER TABLE` / `Cargo.toml` 依赖行
- 人工验收项（SC-001…SC-007）**只能由人填**，脚本不得预置「通过」
- 每阶段一次提交建议前缀：`feat(004): …`；纯文档阶段用 `tasks(004): …`

## 执行记录（2026-11-09，`/speckit.implement`）

| 项 | 结果 |
|---|---|
| 任务 | 28 / 28 完成；勾选前 open=28 done=0，勾选后 open=0 done=28 |
| 闸门 | `gate.ps1` 10 PASS / 0 FAIL / 0 SKIP；`check-i18n` zh=203 en=203；`vue-tsc` exit 0；`cargo fmt --check` 与 `cargo clippy -D warnings` 均 exit 0（本 feature 未改任何 Rust 文件，两条为越界哨兵）→ `verify/gate-report-004.txt` |
| 构建 | JS 219341 → 226992（+7651 B，7.47 KiB ≤ 8 KiB），CSS 29692 → 33009，模块数 1613 不变 → `verify/build-report-004.txt` |
| 断言 | 004 `visual_check.mjs` 58 条全绿；002 `fixture_check.py` 6 例全 OK；003 `clarity_check.mjs` 0 失败；性能 17.25 ms ≤ 500 ms → `verify/visual-report.txt`、`verify/regression-004.txt` |
| 只读 | `api.*` 仅 1 处（`api.getStats`），写关键词 0 命中，demo 库扫描前后哈希一致 → `verify/readonly-004.txt` |
| 现场 | 演示库已还原为用户真库（SHA256 `7a6e3ec1…`，tasks 9 / meta 8 / day_notes 0），`verify/demo.db` 已删 → `verify/demo-note-004.txt` §5 |

### 待真人确认（不阻塞合入，但不许预填通过）

SC-001 / SC-003 / SC-004 / SC-005 / SC-007 / SC-009 的「人眼 + 计时 + 录屏」部分，步骤见 `verify/acceptance-004.txt`。
SC-002 / SC-006 / SC-008 / SC-010 / SC-011 已有自动化证据（数据层 / 结构层 / 回归 / 依赖 / 体积）。

### 实现期偏差（6 条，均已核实）

1. 热力图用「固定格宽 + 容器居中 + 月标签按像素宽对齐」，未用 `justify-content: space-between` + `grid-column-start`——后者会把格子拉成矩形。
2. 峰值点颜色按档位分（浅档 `bg-ink/60`、深档 `bg-card/90`），未用固定的 `bg-ink/70`（深色格上看不见）。
3. 悬停提示框 clamp 到 10%–90%（计划写 8%–92%）。
4. 图例「今天 / 最忙」由色块示意改为一行文字，为压 `SC-011` 体积。
5. 指标卡补充行复用既有 `stats.compare{n}` 与 `stats.conclusionNoGap`，未新增 key（总数仍 203）。
6. `stats.heatEmptyRange` 已按契约加进两份文案，但当前不可达——稀疏五档（`none/undatedOnly/one/few`）会先短路；保留以备将来放宽稀疏判定。
