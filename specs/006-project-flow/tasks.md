# Tasks: 006 项目节点链

任务行：复选框 + `T001`（三位序号）+ 可选 `[P]` + 可选 `[US1]` + 类型标签 + 描述（含文件路径）。

依赖：005 的 `projects` 表与 `src/lib/classes.ts` 先就位。

## Phase 1: Foundational

- [x] T001 [数据] `src-tauri/src/db.rs` 把 `nodes` 表与 `idx_nodes_project` 注册为 `MIGRATION_2`，`SCHEMA_VERSION = 2`
- [x] T002 [契约] `src-tauri/src/model.rs` 新增 `Node`、`NodeInput`（`#[serde(rename_all = "camelCase")]`），`Node::from_row`
- [x] T003 [数据] `src-tauri/src/commands.rs` 新增 `nodes_of` helper 与 `list_nodes`、`save_node`、`delete_node`、`complete_node`、`reopen_node`，全部返回整条链
- [x] T004 [契约] `src-tauri/src/lib.rs` 的 `generate_handler![]` 追加上述五条（23 → 28）
- [x] T005 [契约] `src/lib/api.ts` 新增 `Node` 类型与五个方法
- [x] T006 [双语] `src/lib/i18n.ts` 追加 `nav.projects` 与 15 个 `nodes.*` key（zh/en 成对）

## Phase 2: US1 一条链走到底（P1）

- [x] T007 [US1] 新增 `src/components/ProjectSheet.vue`：项目胶囊、进度、竖向节点链与连线、勾选完成/重开
- [x] T008 [US1] `src/components/ProjectSheet.vue` 增加链尾追加输入（空标题禁用）
- [x] T009 [US1] `src/components/TitleBar.vue` 新增 `FolderTree` 按钮与 `emit("projects")`

## Phase 3: US2 节点可编辑（P2）

- [x] T010 [US2] `src/components/ProjectSheet.vue` 标题点击就地改名（Enter 提交、Esc 放弃、失焦提交）
- [x] T011 [US2] `src/components/ProjectSheet.vue` hover 删除节点，删除后保持顺序
- [x] T012 [US2] `src/components/ProjectSheet.vue` 备注行展示（有才渲染）

## Phase 4: US3 多项目切换（P3）

- [x] T013 [US3] `src/components/ProjectSheet.vue` 面板内新建项目（复用 `validateProjectName`）
- [x] T014 [US3] `src/components/ProjectSheet.vue` 归档项目以删除线呈现且可点开
- [x] T015 [US3] `src/App.vue` 挂载 `ProjectSheet`，纳入 Esc 关闭与底部提示行/`CaptureBar` 互斥

## Phase 5: Polish

- [x] T016 [门禁] `specs/006-project-flow/verify/chain_check.py`：在库副本上跑 `MIGRATION_1+MIGRATION_2` 两次，断言幂等、`schema_version=2`、`nodes` 空表、三表行数不变，结果写 `verify/chain-report.txt`
- [x] T017 [门禁] `specs/006-project-flow/verify/auto_check.txt`：记录 `vue-tsc`、`cargo fmt --check`、`cargo clippy -D warnings`、`gate.ps1`、`check-i18n.ps1` 五条结果
- [x] T018 [门禁] `specs/006-project-flow/verify/acceptance.txt`：SC-001…SC-011 逐条状态，人工项标「待人工点击」
- [x] T019 [双语] `README.md`、`README.zh-CN.md` 与应用内帮助补充「项目进度」一节
- [x] T020 [数据] 确认用户真库在迁移后 `schema_version=2`、三表行数不变、`nodes` 为 0 行（比对 `verify/chain-report.txt`）
