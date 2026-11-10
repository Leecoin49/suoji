# Tasks: 周期任务

任务行：复选框 + `T001`（三位序号，按执行顺序递增）+ 可选 `[P]` + 可选 `[US1]` + 必填类型标签 + 描述（含文件路径）

同文件串行约束：`src-tauri/src/commands.rs` 的 T003 → T004 → T005 顺序执行；`src/lib/i18n.ts` 的 T010 → T016。

## Phase 1: Setup

- [x] T001 [数据] 备份真库并记录 `schema_version` 与行数，写入 `specs/008-recurring/verify/db-before.txt`
- [x] T002 [契约] 在 `spec.md` 冻结 4 条新 IPC 名与 `Task` 新增字段，写入 `specs/008-recurring/verify/contract-freeze.md`

## Phase 2: Foundational

- [x] T003 [数据] `src-tauri/src/db.rs`：`SCHEMA_VERSION` 提到 4，新增 `MIGRATION_3`（`recurrences` 表），迁移里加 `tasks.recurrence_id`、`tasks.occurrence_date` 与 `ux_tasks_occurrence`
- [x] T004 [契约] `src-tauri/src/model.rs`：`Task` 加 `recurrence_id`/`occurrence_date`；新增 `Recurrence`/`RecurrenceInput`
- [x] T005 [合同] `src-tauri/src/commands.rs`：`SELECT` 常量加两列、`from_row` 读取、`recurrence_from_row`
- [x] T006 [合同] `src-tauri/src/commands.rs`：`materialize`（按规则生成当天这一班，幂等）与 `expire_stale`（跨天标记错过）
- [x] T007 [合同] `src-tauri/src/commands.rs`：`rollover` 先过期、跳过周期行；`build_day` 先 `materialize`
- [x] T008 [合同] `src-tauri/src/commands.rs`：`list_recurrences`、`save_recurrence`、`delete_recurrence`、`archive_recurrence`
- [x] T009 [合同] `src-tauri/src/lib.rs`：注册 4 条命令（33 → 37）
- [x] T010 [双语] `src/lib/i18n.ts`：20 个 `repeat.*` / `capture.repeat` / `nav.repeat` 键（zh/en 成对）

## Phase 3: US1 每天出现

- [x] T011 [契约] `src/lib/api.ts`：`Recurrence`/`RecurrenceInput` 类型与 4 个方法
- [x] T012 [契约] `src/stores/day.ts`：`recurrences` 状态与 `loadRecurrences`/`saveRecurrence`/`removeRecurrence`/`toggleRecurrence`
- [x] T013 [US1] `src/components/RecurringSheet.vue`：规则列表 + 新建表单（每天/每周若干天/每月某日）
- [x] T014 [US1] `src/components/RecurringSheet.vue`：暂停/恢复、删除（含影响提示）
- [x] T015 [US1] `src/components/CaptureBar.vue` + `src/App.vue`：周期入口胶囊与浮层挂载、Esc 关闭
- [x] T016 [双语] `src/components/TaskRow.vue`：周期徽标（每天/每周/每月）

## Phase 4: US2 不欠账

- [x] T017 [US2] 验证过期行为：昨天的未完成班不进今天列表、`roll_count` 不变
- [x] T018 [US2] 验证撤销完成不重复生成

## Phase 5: US3 统计口径

- [x] T019 [US3] 验证复盘面板把每一班计入总数（`get_stats` 不改）

## Phase 6: Polish

- [x] T020 [门禁] `specs/008-recurring/verify/recur_check.mjs`：命中规则矩阵（31 号夹月末、周一三五）与幂等断言
- [x] T021 [门禁] `pnpm exec vue-tsc --noEmit`、`cargo fmt --check`、`cargo clippy -D warnings`
- [x] T022 [双语] README 双语 + 应用内帮助同步（周期任务一段）
- [x] T023 [门禁] `gate.ps1` + `check-i18n.ps1` + `pnpm build`，结果落 `verify/gate-report.txt`
- [x] T024 [门禁] 真机验收记录落 `verify/acceptance.md`，清理演示数据
