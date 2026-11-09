# Tasks: 005 项目与标签

任务行：复选框 + `T001`（三位序号）+ 可选 `[P]` + 可选 `[US1]` + 类型标签 + 描述（含文件路径）。

## Phase 1: Setup

- [x] T001 [数据] 备份真实库为 `%APPDATA%\com.tool.suoji\suoji.db.bak-005`，用 `specs/005-project-tags/verify/db_before.py` 记录迁移前三表行数与 `PRAGMA user_version`，写入 `specs/005-project-tags/verify/db-before.txt`
- [x] T002 [数据] 写 `specs/005-project-tags/verify/migration_check.py`：在库副本上跑两次迁移，断言幂等、`schema_version=2`、三表行数不变、重复迁移不重复加列、`tasks` 原有 15 列列名与顺序不变

## Phase 2: Foundational

- [x] T003 [契约] `src-tauri/src/model.rs` 新增 `Project`、`Tag`、`Classes`，给 `Task` 加 `project_id`/`tag_ids`，给 `DoneEntry` 加 `project_id`/`tag_ids`
- [x] T004 [数据] `src-tauri/src/db.rs` 加 `SCHEMA_VERSION`、`MIGRATION_1`（projects/tags/task_tags 三表 + 唯一索引）、`MIGRATION_2`（006 的 `nodes` 表）、`migrate()`（单事务、`PRAGMA table_info` 判断后补 `tasks.project_id`、迁移前自动复制 `.pre-005`）
- [x] T005 [数据] `src-tauri/src/commands.rs` 新增 `list_classes`、`save_project`、`set_task_project`、`save_tag`、`delete_tag`、`set_task_tags` 六条命令 + `attach_tag_ids` helper；`get_stats` 的明细带上 `project_id` 与 `tag_ids`
- [x] T006 [契约] `src-tauri/src/lib.rs` 的 `generate_handler![]` 追加上述六条（17 → 23）
- [x] T007 [契约] `src/lib/api.ts` 追加 `Project`/`Tag`/`Classes` 类型、六个方法与两处字段扩展
- [x] T008 [契约] `src/lib/classes.ts` 新增常量（`PROJECT_NAME_MAX=20`、`TAG_NAME_MAX=16`、`TAGS_PER_TASK=10`）、`normalizeName`、`validateProjectName`、`validateTagName`、`classRowsOf`、`classShareOf`
- [x] T009 [双语] `src/lib/i18n.ts` 追加 `stats.byProject`/`byTag`/`unclassified`/`noTag`/`classEmpty*`/`assign*`/`project*`/`tag*`/`archive*`/`rangeMonth|Quarter|Year`/`filterClass*` 等成对 key
- [x] T010 [契约] `src/stores/day.ts` 持有 `projects`/`tags` 字典，加 `loadClasses`、`saveProject`、`saveTag`、`deleteTag`、`setTaskProject`、`setTaskTags`、`openClass`/`closeClass`/`classTask`

## Phase 3: US1 归类（P1）

- [x] T011 [US1] 新增 `src/components/ClassSheet.vue`：选/建项目、勾/建标签、上限与重名校验、保存即生效
- [x] T012 [US1] `src/components/TaskRow.vue` 显示项目与标签筹码（>3 折叠为 +N）并在 hover 时提供「归类」入口
- [x] T013 [US1] `src/App.vue` 挂 `ClassSheet`，把「归类浮层打开」纳入 Esc 关闭与 `CaptureBar`/提示行的互斥 `v-if`

## Phase 4: US2 按类计数（P2）

- [x] T014 [US2] `src/components/StatsSheet.vue` 新增「按项目 / 按标签」卡片：计数、占比、未标注小字、点行下钻
- [x] T015 [US2] `src/components/StatsSheet.vue` 增加分类下钻状态 `classFilter`，明细与分组随之筛选，并提供清除
- [x] T016 [US2] `src/components/StatsSheet.vue` 预设扩展「本月 / 本季 / 本年」（季度手工算，不引插件）

## Phase 5: US3 跨期复盘（P3）

- [x] T017 [US3] 校验分类卡随区间联动：切预设/自定义日期后 `classRowsOf` 重算，`classFilter` 与时间筛选可叠加
- [x] T018 [门禁] 写 `specs/005-project-tags/verify/class_check.mjs`：断言「行计数 === 下钻条数」「占比和 ≈ 1」「多标签各计一次」「未分类恒存在」，运行结果写入 `verify/class-report.txt`

## Phase 6: Polish

- [x] T019 [门禁] `specs/005-project-tags/verify/readonly-check.txt`：确认统计读取路径没有新增写命令，`StatsSheet.vue` 不直接 invoke
- [x] T020 [双语] `README.md`、`README.zh-CN.md` 与应用内帮助 `content.zh.stats`/`content.en.stats` 同步项目/标签/按类统计说明
- [x] T021 [门禁] 跑 `pnpm exec vue-tsc --noEmit`、`pnpm build`、`cargo fmt --check`、`cargo clippy -D warnings`、`gate.ps1`、`check-i18n.ps1`，结果写入 `verify/gate-report.txt`
- [x] T022 [门禁] 写 `specs/005-project-tags/verify/acceptance.txt` 记录 SC-001…SC-011 的达成状态与人工项
- [ ] T023 [数据] 还原用户真实库（`suoji.db.bak-005`），确认 `schema_version=2` 且行数不变
