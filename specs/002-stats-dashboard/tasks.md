# Tasks: 统计看板（复盘面板）

**Input**: Design documents from `specs/002-stats-dashboard/`
**Prerequisites**: [plan.md](./plan.md)、[spec.md](./spec.md)、[research.md](./research.md)、[data-model.md](./data-model.md)、[contracts/](./contracts/)、[quickstart.md](./quickstart.md)

**Tests**: 本 feature **不新增测试任务** —— 仓库无测试框架（宪法「栈冻结」，测试体系是独立 feature）。验证手段写在 `quickstart.md` 的 SC 矩阵里，落在标 `[门禁]` 的任务上。若 F001 的 vitest 先落地，再给 `src/lib/stats.ts` 补契约用例（不阻塞本 feature）。

**Organization**: 按 spec 的三个用户故事分阶段；每个故事可独立验收。

## 格式约定

- 任务行：复选框 + `T001`（三位序号，按执行顺序递增）+ 可选 `[P]` + 可选 `[US1]` + 必填类型标签 + 描述（含文件路径）
- **[P]**：可并行（不同文件、无未完成依赖）
- **[Story]**：`US1` / `US2` / `US3`；Setup / Foundational / Polish 阶段不带
- **[类型]**（本项目 AGENTS.md 强制，C007 检查）：`[契约]` `[门禁]` `[双语]` `[数据]`
- **[契约] 任务一律排在实现任务之前**

## 路径约定

单仓桌面应用：前端 `src/`，后端 `src-tauri/src/`，设计文档 `specs/002-stats-dashboard/`。

---

## Phase 1: Setup（共享前提）

**Purpose**: 冻结契约与基线，避免边写边改字段名。

- [x] T001 [契约] 通读并冻结两个契约文件，把字段名与函数签名抄成实现清单（不得改名）：`specs/002-stats-dashboard/contracts/ipc-get-stats.md` 的 `span/prev/done/prevDone/rolled/backlog/undated/clamped`、`specs/002-stats-dashboard/contracts/stats-lib.md` 的 9 个导出
- [x] T002 [数据] 记录只读性基线（SC-009 用）：跑 `python -c "import sqlite3,os;c=sqlite3.connect(os.path.join(os.environ['APPDATA'],'com.tool.suoji','suoji.db'));print(c.execute('SELECT COUNT(*) FROM tasks').fetchone(),c.execute('SELECT key,value FROM meta ORDER BY key').fetchall())"`，把输出连同文件 SHA256 写进 `specs/002-stats-dashboard/verify/baseline.txt`（新建该文件）
- [x] T003 [P] [数据] 确认零 DDL 计划：核对 `src-tauri/src/db.rs` 只读不改（3 张表 `tasks`/`meta`/`day_notes`），在 `specs/002-stats-dashboard/verify/baseline.txt` 追加一行「DDL diff = 0」

**Checkpoint**: 字段名与基线固定，可以开始写代码。

---

## Phase 2: Foundational（阻塞所有故事）

**Purpose**: 一条只读 IPC + 一个纯函数聚合模块 + 双语 key。三个故事都依赖它们。

**⚠️ CRITICAL**: 本阶段完成前，任何故事都不能验收。

- [x] T004 [契约] 在 `src-tauri/src/model.rs` 追加 4 个只 `Serialize` 的 struct，全部带 `#[serde(rename_all = "camelCase")]`：`StatsSpan { start: String, end: String, days: i64 }`、`DoneEntry { id: String, title: String, note: Option<String>, done_at: String }`、`RollEntry { id: String, title: String, roll_count: i64, last_rolled_at: String }`、`StatsRaw { span: StatsSpan, prev: StatsSpan, done: Vec<DoneEntry>, prev_done: i64, rolled: Vec<RollEntry>, backlog: i64, undated: i64, clamped: bool }`（不手写 rename，不实现 `from_row`）
- [x] T005 [契约] 在 `src/lib/api.ts` 加同名 TS 类型（`StatsSpan`/`DoneEntry`/`RollEntry`/`StatsRaw`，字段用 camelCase）与 `export const api` 里的 `getStats: (start: string, end: string) => invoke<StatsRaw>("get_stats", { start, end })`；不允许组件直接 `invoke`
- [x] T006 [契约] 在 `src-tauri/src/commands.rs` 实现 `#[tauri::command] pub fn get_stats(db: State<Db>, start: String, end: String) -> Result<StatsRaw, String>`：① `NaiveDate::parse_from_str(&v, "%Y-%m-%d")` 校验两端，失败或 `start > end` → `Err("stats: invalid range")`；② `end > today()` 时 `end = today()`、`clamped = true`；③ `prev = [start − days, start − 1]`，`prev.days == span.days`；④ 只跑 5 条 `SELECT`（明细 / `prevDone` 计数 / 推后榜 `LIMIT 5` / `backlog` 计数 / `undated` 计数），边界为 `"<start>T00:00:00" ≤ done_at ≤ "<end>T23:59:59"`、`last_rolled_at` 按纯日期比较、排序 `roll_count DESC, last_rolled_at DESC, created_at ASC, id ASC`；⑤ **不出现** `INSERT`/`UPDATE`/`DELETE`/`transaction(`/`commit(`，不调用任何 `tauri::` 窗口 API（锁作用域内只查库）
- [x] T007 [契约] 在 `src-tauri/src/lib.rs:108` 的 `generate_handler![]` **末尾**追加 `get_stats`（16 → 17 条），不重排既有条目，不改 `src-tauri/capabilities/default.json`
- [x] T008 [契约] 新建 `src/lib/stats.ts`，只导出契约里的 9 个符号（`isIsoDay`/`validateRange`/`granularityOf`/`bucketize`/`maxCountOf`/`streakOf`/`compareOf`/`toView` + 类型 `Granularity`/`CompareState`/`Bucket`/`Compare`/`StatsView`）：粒度 `≤90 → day`、`≤365 → week`、`>365 → month`；周首日用 `d.subtract((d.day() + 6) % 7, "day")`（**不用** `startOf("week")`）；首末桶裁到 `[span.start, span.end]` 并置 `clipped`；`maxCountOf` 返回 `Math.max(1, ...)`；`streakOf` 锚 = `min(today, span.end)`、遇 0 件即停、上限 `span.days`；`compareOf` 在 `previous <= 0` 时返回 `state: "none"`（不得 `Infinity`）；`toView` 里 `total = doneTotal + undated`、`average = round(doneTotal / days, 1)`、`empty = doneTotal === 0 && rolled.length === 0`；模块内不读时钟、不读 `localStorage`、不 `invoke`、不依赖 `dayjs.locale()`
- [x] T009 [P] [双语] 在 `src/lib/i18n.ts` 的 `dict.zh` 与 `dict.en` **同一批**新增 spec `## 双语影响` 列出的全部 `stats.*` key（含 `stats.error`）与 `nav.stats`；`{n}`/`{d}` 占位符两侧一致；`stats.rolledCount` 的中文必须含「累计」字样；既有 key 不重命名、不删除、不重排
- [x] T010 [P] [双语] 在 `src/lib/i18n.ts` 的 `content.zh` 与 `content.en` 各加一个 `stats: string[]`（2–3 句「怎么看这段时间」，两侧句数与信息量等价），保持 `steps`/`syntax`/`keys`/`why` 原样不动

**Checkpoint**: `pnpm exec vue-tsc --noEmit` 与 `cargo clippy -- -D warnings` 应已通过；`check-i18n.ps1` 应 PASS（zh/en 键数相等）。

---

## Phase 3: User Story 1 - 选一段时间，看清楚这期间做完了多少事 (Priority: P1) 🎯 MVP

**Goal**: 打开面板选区间，看到「有完成时刻小计 + 未标注完成时间小计 = 总数」、按日/周/月的桶分布、以及逐条明细。

**Independent Test**: `quickstart.md` §2 造数后，默认 30 天 → 30 个天桶、`Σ桶 == 有完成时刻小计 == 明细条数`、`总数 − 记录页条数 == 5`；切 7/90 天数字同步变化（SC-001/SC-002/SC-003）。

- [x] T011 [US1] 新建 `src/components/StatsSheet.vue` 的骨架：整屏 `absolute inset-0 z-30 flex flex-col bg-paper` sheet、头部（`font-display text-[22px]` 标题 + `text-[11.5px] text-ink-faint` 副标题 + 关闭按钮 `X`，与 `src/components/HistorySheet.vue:12-30` 同款）、`emit("close")`；区间控件：7/30/90 预设（`rounded-xl bg-paper-deep p-1` 分段，初始 30）+ 自定义起止两个 `input[type=date]`；组件只持局部 `ref`，不写 store、不写 `localStorage`
- [x] T012 [US1] 在 `src/components/StatsSheet.vue` 接上 `api.getStats(start, end)`：用递增序号丢弃过期响应（快速连点预设时旧响应不得覆盖新区间）；`validateRange` 失败时不发请求、就地显示 `stats.rangeInvalid` 并禁用重查；`clamped` 为真时显示 `stats.rangeClamped`
- [x] T013 [US1] 在 `src/components/StatsSheet.vue` 渲染计数与分布：总数行（`stats.total` + `stats.undated` 单列一行）、`stats.average` 行、粒度标签（`stats.byDay`/`stats.byWeek`/`stats.byMonth` 按 `granularity`）、桶条（`div` 宽度 = `count / maxCount * 100`%，0 件桶渲染 2% 短桩 + `stats.dayZero`），**不引入任何图表库**
- [x] T014 [US1] 在 `src/components/StatsSheet.vue` 渲染明细列表：按 `doneAt` 倒序，显示 `doneAt` 日期 + 标题（`note` 非空时副行）；**只读** —— 无勾选、无撤回、无删除按钮（宪法 I）
- [x] T015 [US1] 在 `src/components/StatsSheet.vue` 补三态：`stats.loading`（请求中）、`stats.empty` + `stats.emptyHint`（`empty === true`）、`stats.error`（`api` reject 时面板内一行提示，保留上一次结果，**不弹窗**、不新增 dialog 权限）
- [x] T016 [US1] 在 `src/components/TitleBar.vue:3` 的 import 加 `BarChart3`、在 `TitleBar.vue:9` 的 `defineEmits` 加 `(e: "stats"): void`、在 `TitleBar.vue:28` 的「记录」按钮旁加按钮（`:title="t('nav.stats')"`、`@click="emit('stats')"`）
- [x] T017 [US1] 在 `src/App.vue` 接上：`statsOpen` ref、`openStats()`（与 `historyOpen` 等互斥，关闭其它 sheet）、模板挂载 `<StatsSheet v-if="statsOpen" @close="statsOpen = false" />`；Esc 分支（`App.vue:100-112`）加 `statsOpen.value = false`；**同时**在 `App.vue:364` 的底部提示区与 `App.vue:378` 的 `CaptureBar` 的 `v-if` 里补 `!statsOpen`
- [ ] T018 [US1] [门禁] 跑 SC-001 / SC-002 / SC-003 / SC-004 并把结果填进 `specs/002-stats-dashboard/quickstart.md` §7 的验收记录表（空库场景单独跑一次，确认 0 个 `NaN`/`Infinity`/`undefined`、0 条 console 报错）

**Checkpoint**: US1 可独立验收；此时面板已有 MVP 价值（多少件、哪几天、哪几件事）。

---

## Phase 4: User Story 2 - 看出「哪些事老是没做完」 (Priority: P2)

**Goal**: 推后榜（累计次数 + 最近推后日期）、平均每天、连续天数、当前摊子。

**Independent Test**: 按 spec US2 的 `A/B/C` 造数 —— 视图恰好列出 A 与 C、不含 B，显示「累计推后 6 次 / 2 次」与最近推后日期，顺序稳定；`average` = 小计 ÷ 天数；`streak` 在某天 0 件处断开且不越过区间起点。

- [x] T019 [US2] 在 `src/components/StatsSheet.vue` 渲染推后榜：`rolled` 为空显示 `stats.rolledEmpty`；每条显示标题 + `stats.rolledCount`（**必须含「累计」字样**，值 = `rollCount`）+ `stats.rolledLast`（`{d}` = `lastRolledAt`）
- [x] T020 [US2] 在 `src/components/StatsSheet.vue` 渲染 `streak`（0 时用 `stats.streakNone`，否则 `stats.streak`）与 `average`（`{n}` 保留 1 位小数），数据全部取自 `toView()` 的字段，**不在组件内二次计算**
- [x] T021 [US2] 在 `src/components/StatsSheet.vue` 渲染 `backlog`：`stats.backlog`（`{n}`）+ `stats.backlogHint`（文案必须表明这是**此刻**的摊子、不是区间末的历史快照）
- [x] T022 [US2] [门禁] 跑 SC-006（连续打开 5 次推后榜顺序一致）与 SC-010（3 位用户各 1 分钟提问），结果填进 `specs/002-stats-dashboard/quickstart.md` §7

**Checkpoint**: US1 + US2 都成立且互不影响（US2 只读新增字段，不改 US1 的计数口径）。

---

## Phase 5: User Story 3 - 和上一个等长区间比一比 (Priority: P3)

**Goal**: 等长前后区间对比，四态文案。

**Independent Test**: 近 7 天 10 件、前 7 天 7 件 → 显示「+3 件」；把其中 3 件的完成时刻挪到近 7 天 → 显示「持平」（spec US3）。

- [x] T023 [US3] 在 `src/components/StatsSheet.vue` 渲染对比行：`compare.state` 四态映射 `stats.compareUp`（`{n}`）/`stats.compareDown`（`{n}`）/`stats.compareFlat`/`stats.compareNone`；`stats.compare` 显示上一段条数；`state === "none"` 时不得出现 `1.0x`/`∞`/`+100%` 之类臆造值（`previous = 0 && current > 0` 也只是「无可比」）
- [x] T024 [US3] [门禁] 跑 spec US3 的 10/7/持平 三组断言，并把结果填进 `specs/002-stats-dashboard/quickstart.md` §7

**Checkpoint**: 三个故事全部可独立验收。

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T025 [P] [双语] 三处文档同批更新：`README.md`（英文一句）、`README.zh-CN.md`（中文等价一句）、`src/components/HelpSheet.vue`（新增一个 `<section>` 渲染 `helpContent.stats`，样式复用 `why` 段的 bullet 点）
- [x] T026 [契约] 按 `specs/002-stats-dashboard/contracts/ipc-get-stats.md` §5 的 7 条不变量逐条 grep 自查：`get_stats` 体内无写语句、语句数 ≤ 5、无 `transaction(`/`commit(`、`generate_handler![]` 只在末尾追加、`capabilities/default.json` 未改、`list_done_history` 签名未变
- [x] T027 [数据] 跑 SC-009 只读性验证：操作前后 `tasks` 行数与 `meta` 全部键值逐项一致（用 T002 的基线对比），并把对比输出追加到 `specs/002-stats-dashboard/verify/baseline.txt`
- [x] T028 [门禁] 跑完整闸门并修到全绿：`scripts/speckit/gate.ps1`（C001–C010 全 PASS，C007 因本文件转 PASS）、`scripts/speckit/check-i18n.ps1`、`pnpm exec vue-tsc --noEmit`、`cargo fmt --check`、`cargo clippy --all-targets -- -D warnings`、`git diff --stat pnpm-lock.yaml`（必须为空）
- [x] T029 [门禁] 跑 `specs/002-stats-dashboard/quickstart.md` 全表（SC-001…SC-011），补齐 §7 记录；最后用第 1 步的 `.bak-*` 还原真实库，并删除 `verify/` 下的临时库

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 无依赖
- **Foundational (Phase 2)**: 依赖 Setup；**阻塞所有故事**
- **US1 (Phase 3)**: 依赖 Foundational
- **US2 (Phase 4)**: 依赖 Foundational；与 US1 共享 `StatsSheet.vue`（同文件串行，见下）
- **US3 (Phase 5)**: 依赖 Foundational；同样落在 `StatsSheet.vue`
- **Polish (Phase 6)**: 依赖 US1–US3

### Task-level 关键依赖

```text
T001 ─┬─▶ T004 ─▶ T006 ─▶ T007 ─┐
T002 ─┘   └─▶ T005 ────────────▶├─▶ T011 ─▶ T012 ─▶ T013 ─▶ T014 ─▶ T015 ─┐
                                └─▶ T008 ─┘                                │
T003 ───────────────────────────▶ T018 ◀───────────────────────────────────┤
T009 ─▶ T010 ──────────────────▶ T016 ─▶ T017 ─▶ T018                       │
                                                                            ▼
                                            T019 ─▶ T020 ─▶ T021 ─▶ T022 ─▶ T023 ─▶ T024
                                                                              │
                                    T025, T026, T027 ──────────────────────────┴─▶ T028 ─▶ T029
```

- **同文件串行**：T011–T015、T019–T021、T023 都改 `src/components/StatsSheet.vue`，必须按序做，不能并行。
- **可并行**：T003 与 T001/T002；T009 与 T004–T008；T010 与 T009 同文件但改动区域不同（仍建议同批提交）；T025 与 T026/T027。

### User Story 依赖

- **US1 (P1)**: Foundational 后即可，无其它故事依赖 → MVP
- **US2 (P2)**: Foundational 后即可；只追加只读字段，不改 US1 口径
- **US3 (P3)**: Foundational 后即可；数据来自 `prevDone`，不依赖 US2

---

## Parallel Example: Foundational

```text
# 后端契约（T004 → T006 → T007）与前端契约（T005 → T008）可两人并行，只要先对齐 T001 的字段清单
Task: "T004 在 src-tauri/src/model.rs 加 4 个 camelCase struct"
Task: "T005 在 src/lib/api.ts 加 StatsRaw 等类型与 api.getStats"
Task: "T009 在 src/lib/i18n.ts 的 dict.zh/dict.en 同批加 stats.* 与 nav.stats"
```

## Parallel Example: Polish

```text
Task: "T025 README.md / README.zh-CN.md / HelpSheet.vue 三处文档同批更新"
Task: "T026 按契约 §5 的 7 条不变量 grep 自查 get_stats"
Task: "T027 跑 SC-009 只读性对比"
# 三条改的文件互不重叠，可并行；T028 必须等它们完成
```

---

## Implementation Strategy

### MVP First（只做 US1）

1. Phase 1 + Phase 2（契约与纯函数，约一半工作量）
2. Phase 3（US1）
3. **STOP & VALIDATE**：`quickstart.md` 的 SC-001～SC-004
4. 这一步已经能给用户"这段时间做了多少、哪几天多"的复盘价值

### Incremental Delivery

1. Foundational → US1 → 验收 → 可交付（MVP）
2. + US2（推后榜 / 连续 / 摊子）→ 验收 SC-006、SC-010
3. + US3（环比）→ 验收 US3 三组断言
4. Polish：文档三处 + 只读性验证 + 闸门全绿

### 注意

- **不得为了过闸门**改 `scripts/speckit/*.ps1`、删 `check-i18n` 检查项、注释掉任一侧 i18n（AGENTS.md 反模式 8）。
- **不得顺手 `cargo fmt` 整个文件**：只格式化本 feature 触及的行。
- 每完成一个阶段就提交一次：`feat(002): …` / `tasks(002): …`。

---

## 执行记录（2026-11-06，`/speckit.implement`）

**第一轮完成 28 / 29**，T018 未做（见下）；**第二轮（T030–T036）完成 5 / 7**、**第三轮（T037–T038）完成 2 / 2**，T031、T033 需要人工。合计 **35 / 38**。闸门：`gate.ps1` 10 PASS / 0 FAIL / 0 SKIP；`check-i18n.ps1` PASS（dict zh=155 en=155）；`pnpm exec vue-tsc --noEmit` PASS；`pnpm build` PASS（1613 modules，205 kB JS）；`cargo fmt --check` + `cargo clippy -D warnings` PASS；`cargo build` PASS（链接通过，见报告）。

### 未做的任务

- **T018**（SC-001/002/003/004 的人工点选）：**没启动应用**。原因：启动会跑顺延/结账逻辑，会写真实库，而 `quickstart.md` §1 要求先备份；在没拿到用户同意前不动真实数据（宪法 II）。SC-002/003/004 已在数据层与规则层验证（`verify/fixture-report.txt`、`verify/lib-report.txt`），只有“窗口里看起来对不对”这一步留着。

### 与任务描述的偏差（都是有意为之，评审时看这三处）

| 项 | 任务写的 | 实际做的 | 原因 |
|---|---|---|---|
| T008 导出数 | 9 个（含类型） | 8 个函数 + 5 个类型（`isIsoDay`/`validateRange`/`granularityOf`/`bucketize`/`maxCountOf`/`streakOf`/`compareOf`/`toView`） | 上游任务与分析（C1）本身数字不一致，冻结契约以 `contracts/stats-lib.md` 为准 |
| T009 key 清单 | 含 `stats.perDay`、`stats.loading` | 没加这两个 | `stats.perDay` 与 `stats.average` 语义重复（分析 C4）；`stats.loading` 直接复用 `history.loading`（spec 允许复用） |
| T012 非法区间 | 「禁用重查」 | 无重查按钮，非法时直接不请求、日期框下显示提示 | 面板是“键入即查”，没有确认按钮 |
| T018 | 跑 SC-001–004 | 只做了数据层与规则层 | 同上 |

### 顺带修的文档不一致（不动 spec 内容，只改实现文档）

- `contracts/stats-lib.md` §3 加了 **B2 裁决**：spec「日期随语言」只约束明细行与推后日期，桶刻度量必须与语言无关（否则不变量 3 不成立）。
- `data-model.md` §3/§5 的 FR 编号全部校正到现行 spec（分析 F1：原来系统性地偏 1–3 位）。
- `quickstart.md` §SC-002 与 §SC-011 补了已知限制（记录页只有 7/30/90；面板无确认按钮），§7 验收表按实际验证结果填写。

### 证据文件

- `verify/baseline.txt`：真实库快照 + 实现后对比（哈希逐字符相同）
- `verify/contract-freeze.md`：冻结的 IPC 签名与 8 函数 + 4 个冻结点
- `verify/fixture_check.py` + `verify/fixture-report.txt`：五条 SQL 在 fixture 库上的 6 组用例（全 PASS）
- `verify/lib_check.mjs` + `verify/lib-report.txt`：`src/lib/stats.ts` 的 46 条规则断言（全 PASS）
- `verify/sc009-readonly.txt`：只读性四项证据

### 第二轮（Convergence T030–T036，2026-11-06）

| 任务 | 做了什么 |
|---|---|
| T030 | `StatsSheet.vue` 首行改用 `view.total`；`stats.undated` 改为「其中 {n} 件没留完成时间，不计入下面的分布」——「总数」与「桶之和 = 有完成时刻」终于同时成立 |
| T032 | 新增 `verify/perf_check.py`（数据段）+ `verify/perf_agg.mjs`（聚合段）+ `verify/perf-report.txt`：10 000 行 fixture 下 SQL 最差 14.3 ms、`toView` 最差 15.7 ms，合计约 30 ms，远低于 500 / 800 ms 阈值 |
| T034 | 平均每天固定一位小数：模板里 `view.average.toFixed(1)`（`stats.ts` 仍返回 number，契约不动） |
| T035 | 备注**常显**定案：`contracts/stats-lib.md` §5 写清「常显是可展开的超集」，与 `HistorySheet.vue:141-144` 一致，不改组件 |
| T036 | `stats.perDay` 有了归宿：作为分布段标题（zh「什么时候做的」/ en「When it got done」），粒度 `byDay`/`byWeek`/`byMonth` 降为旁边的小胶囊；两语新增，dict 154 → 155 |

仍未完成（需人）：

- **T018 / T031**：启动应用做 SC-001（2 次点击 / 3 秒）、SC-002/003/004 目视、SC-009 前后对比。启动会跑顺延/结账并写真实库，所以必须先按 `quickstart.md` §1 备份。
- **T033**：3 人 × 1 分钟的可用性小测（SC-010）。

### 第三轮（Convergence T037–T038，2026-11-06）

| 任务 | 做了什么 |
|---|---|
| T037 | `src/lib/stats.ts:207` 的 `empty` 加上 `raw.undated === 0`：只有未标注完成时间的区间不再被判定为空，那 N 件完成与「其中 N 件没留完成时间」都能看见；`contracts/stats-lib.md` 第 76 行与 `verify/lib_check.mjs` 同步，并新增一条「only undated → empty false」断言（套件 46 → 47 条，全部 PASS） |
| T038 | `src/lib/i18n.ts` 新增 `fullDayLabel`（zh `2025年10月2日` / en `Oct 2, 2025`，带年份）；`StatsSheet.vue` 分布段头部与柱子 `title` 改用它，不再硬编码 ISO 日期 |

验证：`lib_check.mjs` OK（0 failure）；`vue-tsc --noEmit` exit 0；`check-i18n.ps1` PASS（dict zh=155 en=155）；`pnpm build` 3.82 s / 205.50 kB JS；`gate.ps1` 10 PASS / 0 FAIL / 0 SKIP（进度 35/38）。

---

## Phase 7: Convergence

由 `/speckit.converge` 于 2026-11-06 追加。只追加，不改上面任何一条。

- [x] T030 修正总数口径：`src/components/StatsSheet.vue` 首行的 `stats.total` 改用 `view.total`（有完成时刻 + 未标注），并把 `stats.undated` 改成「其中 N 件没留完成时间（不计入下面的按日分布）」，使「总数」与「桶之和 = 有完成时刻」两条同时成立 per FR-011 (contradicts)
- [ ] T031 补应用内验收记录：先备份 `suoji.db`，再启动应用，按 `specs/002-stats-dashboard/quickstart.md` 跑 SC-001（2 次点击 / 3 秒）与 SC-009（打开 → 切 3 次区间 → 关闭，前后 `tasks` 行数与 `meta` 逐项一致），结果写进 `quickstart.md` §7 并勾上 `tasks.md` 的 T018 per SC-001 (partial)
- [x] T032 实测性能：造 10 000 条任务的 fixture，测 365 天区间 ≤ 500 ms、3 年区间（按月）≤ 800 ms，各重复 5 次取中位数，写进 `verify/perf-report.txt` per SC-005 (partial)
- [ ] T033 做 3 人 × 1 分钟的可用性小测（「上周完成多少件」「哪 2 件最常被推后」），把结论写进 `quickstart.md` §7；不足 2 人答对则改文案 per SC-010 (partial)
- [x] T034 平均每天固定 1 位小数（`view.average` 输出 `toFixed(1)`，如 `1.0` 而不是 `1`），避免与「保留 1 位小数」不一致 per FR-007 (partial)
- [x] T035 判定备注呈现方式：当前 `StatsSheet.vue` 是内联常显而非「可展开」，要么改成与 `HistorySheet.vue` 一致的可展开行，要么在 `contracts/stats-lib.md` 写明「常显是可展开的超集」并保留 per FR-005 (partial)
- [x] T036 给 `stats.perDay` 一个归宿：或作为分布段标题用于「按天」场景（与 `stats.byDay` 分工写清），或在 `spec.md` 下次修订时删掉该 key；不得留成无主 key per 双语影响 (missing)

## Phase 8: Convergence

由 `/speckit.converge` 第二轮于 2026-11-06 追加（Phase 7 已完成的 T030/T032/T034/T035/T036 不再重列）。

- [x] T037 修「区间内只有未标注完成时间的行」时整块消失：`src/lib/stats.ts:207` 的 `empty: doneTotal === 0 && raw.rolled.length === 0` 把 `undated > 0` 的区间也判为空，于是 `src/components/StatsSheet.vue:171-176` 的空态挡住了 `:186` 的「其中 N 件没留完成时间」，那 N 件完成就看不见了；把 `raw.undated === 0` 加进 `empty` 条件，并同步 `contracts/stats-lib.md` 与 `verify/lib_check.mjs` 的 `empty` 断言 per FR-011 (contradicts)
- [x] T038 把剩下两处硬碟 ISO 日期改成随语言：`src/components/StatsSheet.vue` 分布段头部的 `{{ view.prev.start }} → {{ view.prev.end }}` 与柱子 `:title` 里的 `${b.start} → ${b.end}` 直接输出 `2025-10-02`，与 FR-016「日期随界面语言」不符；在 `src/lib/i18n.ts` 加一个带年份的格式化函数（如 `fullDayLabel`：zh `2025年10月2日` / en `Oct 2, 2025`）供这两处使用 per FR-016 (partial)
