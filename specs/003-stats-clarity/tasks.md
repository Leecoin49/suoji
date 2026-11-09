# Tasks: 复盘面板的可读性重做

**Input**: `specs/003-stats-clarity/`（spec.md、plan.md、research.md、data-model.md、contracts/stats-clarity.md、quickstart.md）

**Prerequisites**: plan.md ✔ · spec.md ✔ · data-model.md ✔ · contracts/ ✔

**Tests**: 本 feature **不引入测试框架**（宪法「测试现状」）。纯函数用 `specs/003-stats-clarity/verify/clarity_check.mjs`（`tsc → node`，沿用 002 的手法）断言；交互用 `quickstart.md` §2 的验收矩阵人工记录。

**Organization**: 按用户故事分阶段；类型标签为 `[契约]` `[门禁]` `[双语]` `[数据]`（AGENTS.md 要求），`[契约]` 永远排在实现之前。

任务行：复选框 + `T001`（三位序号，按执行顺序递增）+ 可选 `[P]` + 可选 `[US1]` + 必填类型标签 + 描述（含文件路径）

**同文件串行约束**（本次最大的执行陷阱）：

- `src/lib/stats.ts`：T004 → T005 → T006 → T007 → T008 必须串行，**不得标 [P]**。
- `src/components/StatsSheet.vue`：T011 → T012 → T013 → T015 → T016 → T017 → T018 → T019 → T020 → T021 必须串行。
- `src/lib/i18n.ts`：T010 → T024 串行。
- 真正可并行的只有「不同文件」：T003 / T010 / T022 / T023 / T026 / T028。

---

## Phase 1: Setup（数据准备与基线）

**Purpose**: 有演示数据才能验收；有基线才能证明「零写入、零依赖」。

- [x] T001 [数据] 关停应用后备份真实库（`%APPDATA%\com.tool.suoji\suoji.db` → `suoji.db.bak-<yyyyMMdd-HHmm>`），再用 `python specs\002-stats-dashboard\verify\seed_demo.py --out specs\003-stats-clarity\verify\demo.db` 生成演示库并装入真实路径；把备份文件名写入 `specs/003-stats-clarity/verify/demo-note.txt`（验收结束必须用它还原）
- [x] T002 [数据] 记录改动前基线到 `specs/003-stats-clarity/verify/baseline-003.txt`：`git status --short`、`git diff --stat pnpm-lock.yaml src-tauri/Cargo.toml package.json`（应为空）、`count_rows.py` 输出的 `tasks`/`meta`/`day_notes` 行数与库字节、`check-i18n.ps1` 的键数（155）
- [x] T003 [P] [门禁] 把 `quickstart.md` §2 的只读统计脚本落地为 `specs/003-stats-clarity/verify/count_rows.py`（`sqlite3.connect(f"file:{db}?mode=ro", uri=True)`，只打印三表行数与文件字节，不写库）

**Checkpoint**: 演示库可用、基线留档、指针脚本就绪。

---

## Phase 2: Foundational（纯函数与文案，阻塞所有故事）

**⚠️ CRITICAL**: T004–T010 未完成前，任何用户故事都不能开始。

- [x] T004 [契约] 在 `src/lib/stats.ts` 追加 5 个类型与对应注释：`Sparsity = "none" | "undatedOnly" | "one" | "few" | "ok"`、`Conclusion { done; compare:{state,delta}; peak:{date,count}|null; gapDays }`、`AxisBucket extends Bucket { isPeak; isZero; isPartial; share; heightPct }`、`DayGroup { date; isUndated; count; entries }`（`date` 为 `YYYY-MM-DD` 或固定值 `"__undated__"`）、`DrillFilter { key; start; end }`；**既有 8 个导出与 4 个类型一字不改**
- [x] T005 [契约] 在 `src/lib/stats.ts` 实现 `conclusionOf(view: StatsView, today: string): Conclusion`：`done = view.doneTotal`（C-1）；`peak` 并列时取**日期最早**，`done === 0` 时为 `null`（C-3）；`gapDays` 统计 0 件的天桶且**不含今天**（C-4，`span.end >= today` 时今天 0 件不算断档）
- [x] T006 [契约] 在 `src/lib/stats.ts` 实现 `axisBucketsOf(view, today): AxisBucket[]` 与 `axisTicksOf(maxCount: number): [number, number, number]`：`share = count / doneTotal`（`doneTotal === 0` 时全 0，禁止 `NaN`，B-2）；`isPeak` 对**所有**并列最大值为真（B-3）；`isPartial` 为「桶包含今天且区间结束日 ≥ 今天」；`heightPct = count === 0 ? 0 : Math.max(4, Math.round(count / maxCount * 100))`（B-5 单调）；`axisTicksOf` 返回 0 / 中 / 最大三档整数，`maxCount === 1` 时返回 `[0, 1, 1]`
- [x] T007 [契约] 在 `src/lib/stats.ts` 实现 `sparsityOf(view): Sparsity`，严格按短路顺序 `none → undatedOnly → one → few → ok`（S-1；`few` 判据为「有数据的天数 < 3」），并实现 `groupDoneByDay(entries: DoneEntry[]): DayGroup[]`（按 `doneAt.slice(0,10)` 分组、日期**倒序**、组内按 `doneAt` 降序再按 `id` 升序保证稳定，G-1）
- [x] T008 [契约] 在 `src/lib/stats.ts` 实现 `filterEntries(entries: DoneEntry[], filter: DrillFilter | null): DoneEntry[]`：`null` 时原样返回；否则**闭区间**比较 `doneAt.slice(0,10)`，满足 F-1（结果条数等于该桶 `count`）
- [x] T009 [门禁] 新建 `specs/003-stats-clarity/verify/clarity_check.mjs`，用构造的 `StatsRaw`/`StatsView` 断言 `C-1`、`C-3`、`C-4`、`B-2`、`B-5`、`G-1`、`F-1`、`S-1`、`axisTicksOf(1) === [0,1,1]`、30/90/365/1096 天四档的桶数与 `Σ count`、所有数值 `Number.isFinite`；用 `tsc -p` 临时配置编译 `stats.ts` 后 `node` 运行，输出 `OK (0 failure(s))` 到 `specs/003-stats-clarity/verify/clarity-report.txt`
- [x] T010 [P] [双语] 在 `src/lib/i18n.ts` 的 `dict.zh` 与 `dict.en` 各追加 `contracts/stats-clarity.md` §5 的 30 条 key（含 `stats.conclusionJoin`），占位符逐字一致、**既有 key 不重命名不重排**；跑 `check-i18n.ps1` 确认两侧键数相等（155 → 185）

**Checkpoint**: 纯函数全部可断言、文案齐备，可以开始做界面。

---

## Phase 3: User Story 1 - 打开就是一句结论（P1）🎯 MVP

**Goal**: 首屏第一行是人话结论（件数 + 环比 + 最忙一天/断档），数据太少时给分档引导。

**Independent Test**: 用演示库打开面板，结论句里的每个数字都能在下方数字区与明细里找到出处；空库 / 1 件 / 2 天三种库各打开一次，文案各不相同。

- [x] T011 [US1] [契约] 在 `src/components/StatsSheet.vue` 增加结论句区块：`computed conclusion = conclusionOf(view, today)`，按 `compare.state` 选 `stats.conclusionPrevUp/Down/Flat/None`，再用 `stats.conclusionJoin` 连接节奏分句（`peak` → `stats.conclusionPeak`，`gapDays > 0` → `stats.conclusionGap`，否则 `stats.conclusionNoGap`）；`sparsityOf(view) !== "ok"` 时**不渲染**结论句
- [x] T012 [US1] [双语] 在 `src/components/StatsSheet.vue` 实现稀疏四档空态：`none` → `stats.emptyNone`、`undatedOnly` → 未标注说明、`one` → `stats.emptyOne`、`few` → `stats.emptyFew`（`{n}` 为有数据天数），四档都带 `stats.emptyNextHint`；**移除**对 `history.emptyTitle` / `history.emptyHint` 的引用（FR-010、S-3）
- [x] T013 [US1] [契约] 在 `src/components/StatsSheet.vue` 把原「大数字 + 数字堆」重排为结论句之下的次级区（总数 = `view.total`、`stats.undated` 小字、`stats.average` 保留 1 位、`stats.streak`/`streakNone`、`stats.compare*`、`stats.backlog` + `backlogHint`），确保结论句的 `done` 与 `view.doneTotal` 同源（C-1）
- [ ] T014 [US1] [门禁] 用演示库与三种稀疏库手工验收 US1 的三个场景（spec US1 Acceptance Scenarios 1–3），把结果与截图文件名写入 `specs/003-stats-clarity/verify/acceptance-us1.txt`

**Checkpoint**: 只完成 P1 也是可交付的「能看一眼的面板」。

---

## Phase 4: User Story 2 - 图要能看出形状，柱子要能点进去（P2）

**Goal**: 竖柱 + 刻度 + 最值/断档标注 + 悬停三段信息 + 点击下钻。

**Independent Test**: 逐桶悬停核对三段信息；点任意桶后明细条数等于桶件数；再点取消；切区间后筛选自动清除。

- [x] T015 [US2] [契约] 在 `src/components/StatsSheet.vue` 用 `axisBucketsOf` + `axisTicksOf` 重写分布区：flex 竖柱（`flex-1`、1px 间距、容器 `h-24`），3 条绝对定位刻度线（`border-line-soft`）配 `stats.axisZero/axisMid/axisMax`，`isPeak` 加 `stats.peakBadge` 徽标，`isZero` 渲染 2px `bg-line` 底线，非零柱最小高度 4px（FR-005）
- [x] T016 [US2] [契约] 在 `src/components/StatsSheet.vue` 实现自绘提示框：单一 `activeKey`（鼠标 `hover` 与键盘 `focus` 合并，focus 优先），内容 = `stats.hoverRange`（`fullDayLabel`/`dayLabel`）+ `hoverCount` + `hoverShare`（`Math.round(share*100)`）；按左右边界 clamp，0 件桶显示 `0 件` 而非空框（FR-006、SC-003）
- [x] T017 [US2] [契约] 在 `src/components/StatsSheet.vue` 实现下钻：`filter = ref<DrillFilter | null>(null)`，点桶 → `filterEntries(raw.done, filter)`，筛选条显示 `stats.filterActive` + `stats.filterClear`，0 条时显示 `stats.filterEmpty`；在 `load()` 成功、`pickPreset()`、`onEdit()`、应用自定义日期四处**重置**筛选（FR-007、F-3）
- [x] T018 [US2] [双语] 在 `src/components/StatsSheet.vue` 给「包含今天且未过完」的桶加 `stats.partialDay` 标记（`isPartial`），避免用户把今天读成效率下降（FR-013）

**Checkpoint**: US1 + US2 均独立可用；只做 P1+P2 已可对内演示。

---

## Phase 5: User Story 3 - 明细能翻，键盘能用，数据少时说人话（P3）

**Goal**: 明细按天分组折叠、roving tabindex 键盘路径、口径脚注。

**Independent Test**: 200 条明细首屏只渲染 5 组且可逐组展开；仅用键盘完成「切 90 天 → 下钻 → 取消 → 折叠 → 关闭」。

- [x] T019 [US3] [契约] 在 `src/components/StatsSheet.vue` 把明细改为 `groupDoneByDay` 分组渲染：组头 `stats.groupCount`、默认展开最近 5 个**有数据**的组（D4）、其余收进 `stats.groupMore`（`{n}` = 剩余组数）、组内超过 10 条折叠、每组可 `stats.groupCollapse`；`raw.undated > 0` 时在末尾渲染 `stats.groupUndated` 组（`isUndated`，不伪造条目行，G-1/G-2）
- [x] T020 [US3] [门禁] 在 `src/components/StatsSheet.vue` 实现键盘与焦点：组件内常量 `focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-1 focus-visible:ring-offset-card"`；图形容器用 roving tabindex（仅一个桶 `tabindex="0"`，`←/→/Home/End` 移动，`Enter/Space` 切下钻，`Tab` 只占 1 位）；打开后 `nextTick` 聚焦第一个预设按钮；桶带 `aria-label`（日期 + 件数 + 占比）与 `aria-pressed`，折叠按钮带 `aria-expanded`（FR-011、SC-006）
- [x] T021 [US3] [双语] 在 `src/components/StatsSheet.vue` 底部加口径脚注：默认一行 `stats.footnoteSummary`，展开后三条 `stats.footnoteRolled` / `footnoteBacklog` / `footnoteUndated`，状态 `footnoteOpen` 只在内存（FR-012、SC-009）

**Checkpoint**: 三个故事全部完成，面板达到 spec 的可读性目标。

---

## Phase 6: Polish & 交叉验证

- [x] T022 [P] [门禁] 只读性扫描：对 `src/components/StatsSheet.vue` 做关键字检查（禁止出现 `api.addTask|setDone|setNote|moveToDate|dropTask|pushToTomorrow|backToInbox|closeOut|saveSettings` 与 `localStorage|sessionStorage`），命中即为失败；结果写入 `specs/003-stats-clarity/verify/readonly-check.txt`（FR-001、SC-009）
- [x] T023 [P] [双语] 更新 `README.md` 与 `README.zh-CN.md` 的功能条目为「结论 + 可下钻的分布图 + 按天分组的明细」，两侧同批提交（宪法「文档三处同步」）
- [x] T024 [双语] 改写 `src/lib/i18n.ts` 中 `content.zh.stats` 与 `content.en.stats` 各 3 行，反映结论句/悬停/下钻/折叠/脚注；**不改** `src/components/HelpSheet.vue`（按 `content` 动态渲染）
- [x] T025 [门禁] `pnpm exec vue-tsc --noEmit` 与 `pnpm build` 全绿；记录产物体积到 `specs/003-stats-clarity/verify/build-report.txt`（应与 002 的 205.33 kB 同量级，不得因新代码显著膨胀）
- [x] T026 [P] [门禁] `cargo fmt --manifest-path src-tauri/Cargo.toml --check` 与 `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`：**期望无任何输出差异**（本 feature 不碰 Rust，报错即等于改动越界）
- [x] T027 [门禁] `scripts\speckit\gate.ps1`（期望 PASS 10 / FAIL 0 / SKIP 0）与 `scripts\speckit\check-i18n.ps1`（期望 PASS，两侧键数相等）；把输出写入 `specs/003-stats-clarity/verify/gate-report.txt`
- [x] T028 [P] [门禁] 性能复测：用 10 000 条库测 365 天档，记录 `toView + axisBucketsOf + conclusionOf + groupDoneByDay` 的中位耗时与 002 基线（SQL 6.0 ms / 聚合 8.3 ms）对比，写入 `specs/003-stats-clarity/verify/perf-report-003.txt`（SC-008：≤ 500 ms 且增量 ≤ 100 ms）
- [ ] T029 [数据] 收尾：填满 `quickstart.md` §2 的验收矩阵（SC-001…SC-011，含截图文件名），按 `verify/demo-note.txt` 还原真实库并用 `count_rows.py` + SHA256 核对，删除 `verify/demo.db`，把结论写入 `specs/003-stats-clarity/verify/acceptance-003.txt`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 Setup**：无前置，可立即开始（T003 可与 T001 并行）
- **Phase 2 Foundational**：依赖 Phase 1；**阻塞全部用户故事**；内部 T004→T008 串行（同一文件），T009 依赖 T004–T008，T010 可与 T004–T008 并行（不同文件）
- **Phase 3 US1**：依赖 Phase 2（T004/T005/T007/T010）
- **Phase 4 US2**：依赖 US1 的组件骨架（T011–T013 已建立区块结构）；T015 依赖 T006、T016 依赖 T015、T017 依赖 T008
- **Phase 5 US3**：T019 依赖 T007（`groupDoneByDay`）+ T017（筛选共存）、T020 依赖 T015–T017（桶存在才能 roving）、T021 独立
- **Phase 6 Polish**：依赖所有故事完成；T026/T028 可与 T023/T024 并行

### Within Each Story

- 纯函数先于组件（`[契约]` 先行）；同一文件的改动严格串行；每个阶段结束时跑一次 `vue-tsc --noEmit`，避免错误堆积。

### Parallel Opportunities

```text
# Setup 阶段
T001（造库）  ∥  T003（写 count_rows.py）

# Foundational 阶段
T005–T008（stats.ts，串行）  ∥  T010（i18n.ts）

# Polish 阶段
T023（README×2）∥ T026（cargo 哨兵）∥ T028（性能复测）
```

**并行上限**：`stats.ts` 与 `StatsSheet.vue` 是两条串行链，真正能并行的只有跨文件的 4 组（上列）。

---

## Implementation Strategy

### MVP First（只做 US1）

1. Phase 1 + Phase 2 → 纯函数与文案就绪
2. Phase 3 → 结论句 + 稀疏分档
3. **停下验收**：`verify/acceptance-us1.txt` 三条场景通过即算 MVP（面板已不再「粗糙到不能看」）

### Incremental Delivery

1. `US1` → 结论句（可交付）
2. `US2` → 图与下钻（可对用户演示）
3. `US3` → 分组/键盘/脚注（可算完成）
4. Polish → 门禁与验收记录（可合入）

### 提交粒度

`feat(003): 结论句` → `feat(003): 可读分布图与下钻` → `feat(003): 明细分组与键盘` → `chore(003): 门禁与验收记录`。每步一次提交，`tasks.md` 同步勾选。

---

## Notes

- `[P]` 只标在**不同文件**且无未完成依赖的任务上；同文件任务一律串行（见顶部的「同文件串行约束」）。
- 每个 `[契约]` 任务完成后先跑 T009 的断言脚本再动组件——接口一致性靠脚本而不是肉眼。
- 阶段结束必须 `vue-tsc --noEmit` 通过；不允许把类型错误留到 Polish。
- `cargo` 两条是「越界哨兵」：它们报错说明误改了 `src-tauri/`。
- 验收结束必须还原真实库（T029），演示库 `demo.db` 不入库。
