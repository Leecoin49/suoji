# Tasks — 009-deadline

任务行：复选框 + `T001`（三位序号，按执行顺序递增）+ 可选 `[P]` + 可选 `[US1]` + 类型标签 + 描述（含文件路径）

## Phase 1 — 数据与契约

- [x] T001 [US1] [数据] `src-tauri/src/db.rs`：`SCHEMA_VERSION` 4 → 5，新增 `MIGRATION_4`（`idx_tasks_deadline`）与 `tasks.deadline` 幂等加列
- [x] T002 [US1] [数据] `src-tauri/src/model.rs`：`Task.deadline` + `from_row` 读取
- [x] T003 [US1] [契约] `src-tauri/src/commands.rs`：`SELECT` 常量与两处显式列清单加 `deadline`；新增 `normalize_deadline` 与 `set_deadline`
- [x] T004 [US1] [契约] `src-tauri/src/lib.rs`：`generate_handler![]` 37 → 38 条
- [x] T005 [US1] [契约] `src/lib/api.ts`：`Task.deadline`、`api.setDeadline`

## Phase 2 — 逻辑

- [x] T006 [US1] [契约] `src/lib/utils.ts`：`deadlineOf` / `deadlineInput`（逾期/今天/明天/不久/以后 + 时分）
- [x] T007 [US1] `src/stores/day.ts`：`setDeadline`、`moveTo`（改期）、`captureNodeId` / `setCaptureStep`，`add()` 之后补 `setTaskNode`
- [x] T008 [双语] `src/lib/i18n.ts`：`task.deadline.*`、`task.menu.deadline/reschedule`、`home.overdue`、`capture.stepAll/newStep`；`capture.projectNone` 改「个人 / Personal」

## Phase 3 — 界面

- [x] T009 [US1] `src/components/TaskRow.vue`：截止徽标（逾期 warn / 当天 accent）、原地日期时分选择器、清除、右击「设截止日期」
- [x] T010 [US1] `src/components/TaskRow.vue`：右击「改日期」+ 原地 `type="date"` 输入
- [x] T011 [US1] `src/components/CaptureBar.vue`：项目行右侧箭头展开步骤，可选「整个项目」/具体步骤/新建步骤；胶囊显示「项目 · 步骤」
- [x] T012 [US1] `src/App.vue`：分组头显示逾期条数

## Phase 4 — 验收

- [x] T013 [门禁] `cargo test`（10 条，含 `normalize_deadline` 的 5 个断言）
- [x] T014 [门禁] `cargo fmt` / `cargo clippy -D warnings` / `pnpm exec vue-tsc --noEmit`
- [x] T015 [门禁] `scripts/speckit/gate.ps1` 与 `check-i18n.ps1`（zh=en=324）
- [x] T016 [门禁] `pnpm build`
- [x] T017 [双语] `README.md` / `README.zh-CN.md` / 应用内帮助同步
