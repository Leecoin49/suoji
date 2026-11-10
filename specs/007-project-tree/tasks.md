# Tasks: 项目变成三层树，首页按项目分组

任务行：复选框 + `T001`（三位序号，按执行顺序递增）+ 可选 `[P]` + 可选 `[US1]` + 必填类型标签 + 描述（含文件路径）

## Phase 1：契约与数据

- [x] T001 [契约] `src-tauri/src/db.rs`：`SCHEMA_VERSION = 3`，迁移加 `tasks.node_id`（`has_column` 判断）与 `idx_tasks_node`
- [x] T002 [契约] `src-tauri/src/model.rs` + `src/lib/api.ts`：`Task.node_id` / `Task.nodeId`，`from_row` 读取
- [x] T003 [契约] `src-tauri/src/commands.rs`：`SELECT` 常量加 `node_id`
- [x] T004 [契约] `src-tauri/src/commands.rs`：新增 `set_task_node(task_id, node_id)`（挂步骤时同步 `project_id`）
- [x] T005 [契约] `src-tauri/src/lib.rs`：`generate_handler![]` 注册第 33 条命令

## Phase 2：US1 树形视图

- [x] T006 [US1] `src/components/ProjectSheet.vue`：步骤节点下渲染其任务、显示「N 件事」
- [x] T007 [US1] `src/components/ProjectSheet.vue`：步骤下就地新建任务（`addTask` + `setTaskNode`）
- [x] T008 [US1] `src/components/ProjectSheet.vue`：「没挂步骤的事」区块

## Phase 3：US2 编辑与删除

- [x] T009 [US2] `src/components/ProjectSheet.vue`：项目名、步骤、任务三级就地改名
- [x] T010 [US2] `src/components/ProjectSheet.vue`：三级右键菜单（改名 / 删除 / 移到步骤 / 移出步骤）
- [x] T011 [数据] `src-tauri/src/commands.rs`：删步骤、删项目时解绑任务而非删除

## Phase 4：US3 鱼骨总览

- [x] T012 [US3] `src/components/ProjectSheet.vue`：树形/总览切换 + SVG 鱼骨（脊背、交替刺、完成比例）

## Phase 5：US4 首页分组

- [x] T013 [US4] `src/App.vue`：按 `projectId`/`nodeId` 分组，步骤名按项目懒加载
- [x] T014 [US4] `src/App.vue`：分组标题可折叠（内存态），未归项目垫底，单组时退回扁平列表

## Phase 6：双语、门禁、验收

- [x] T015 [双语] `src/lib/i18n.ts`：20 个新键（zh/en 成对）
- [x] T016 [双语] `src/lib/i18n.ts` 帮助文案 + `README.md` / `README.zh-CN.md` 同步
- [x] T017 [门禁] `pnpm exec vue-tsc --noEmit` 与 `pnpm build`
- [x] T018 [门禁] `scripts/speckit/check-i18n.ps1`、`gate.ps1`、`cargo fmt` + `clippy`
- [x] T019 [门禁] 真库迁移验证（`schema_version = 3`、行数不变）与截图取证
