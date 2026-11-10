# Implementation Plan: 项目变成三层树，首页按项目分组

**Branch**: `007-project-tree` | **Spec**: [spec.md](./spec.md) | **Date**: 2026-11-10

## Constitution Check

- [x] **I 一件事**（v1.1.0 允许固定三层）→ 证据：`spec.md` 的 FR-016 明确禁止第四层、拖拽、多选；
      层级只有 `projects` → `nodes` → `tasks.node_id` 三张表三个 id，靠 `set_task_node` 一条命令推进。
- [x] **II 数据唯一副本** → 证据：`src-tauri/src/db.rs` 的 `SCHEMA_VERSION = 3`，迁移里
      `has_column(conn, "tasks", "node_id")` 存在性判断 + `BEGIN IMMEDIATE` 单事务 + 迁移前
      `suoji.db.pre-005` 备份；只 `ALTER TABLE ... ADD COLUMN`，不删不改任何行。
- [x] **III 本地最小外联** → 证据：无新增插件、无网络请求；`pnpm-lock.yaml` 与
      `src-tauri/Cargo.toml` 依赖段零改动。
- [x] **IV IPC 最小面** → 证据：`src-tauri/src/lib.rs` 的 `generate_handler![]` 32 → 33 条
      （只加 `set_task_node`），同步落在 `src/lib/api.ts` 的 `api.setTaskNode`；
      `src-tauri/capabilities/default.json` 未改（仍 15 项）。
- [x] **V 双语成对** → 证据：`src/lib/i18n.ts` 两份 dict 各加 20 键，`scripts/speckit/check-i18n.ps1`
      PASS（`dict zh=286 en=286`）；应用内帮助 `content.zh/en.stats` 各 +2 条；README 双语同步。
- [x] **锁纪律** → 证据：`set_task_node` 在 `db.0.lock()` 作用域内只做 SQL，返回前由
      `load(&conn, &task_id)` 出结果，不触碰窗口或系统 API。
- [x] **版本号三处同步** → 本 feature 未发版，未改动版本号；发布时再按三处同步。

## Technical Context

- 前端：Vue 3 + TS + Tailwind 4 + Pinia（不引入新库）；`ProjectSheet.vue` 内部实现树形与鱼骨，
  不新增独立组件文件（保持 005/006 的单面板形态）。
- 后端：Rust + rusqlite；schema v3；一条新命令 `set_task_node(task_id, node_id)`。
- 目标平台：Windows（NSIS）。

## Existing Code Impact

| 文件 | 改动 | 为什么不能新增文件 |
| --- | --- | --- |
| `src-tauri/src/db.rs` | `SCHEMA_VERSION = 3`、`node_id` 列与索引 | 迁移只在这里发生 |
| `src-tauri/src/model.rs` | `Task.node_id` + `from_row` | 现有 `Task` 是唯一读取处 |
| `src-tauri/src/commands.rs` | `SELECT` 加列、新增 `set_task_node`、删步骤/删项目时解绑任务 | IPC 实现集中在此 |
| `src-tauri/src/lib.rs` | 注册第 33 条命令 | 唯一 `generate_handler!` |
| `src/lib/api.ts` | `Task.nodeId`、`api.setTaskNode` | 唯一 IPC 网关 |
| `src/components/ProjectSheet.vue` | 树形 + 鱼骨总览 + 三级右键菜单 + 就地新建任务 | 复用既有面板与其状态机 |
| `src/App.vue` | 首页按项目/步骤分组折叠 | 首页渲染在 `App.vue`，没有独立列表组件 |
| `src/lib/i18n.ts` | 20 个新键 + 帮助文案 | 唯一文案表 |

## 决策

- **D1** 三层固定（项目 → 步骤 → 任务），任务只挂一个步骤；挂步骤时自动把任务的项目改成该步骤的项目，
  避免「按项目」与「按步骤」两套口径打架。
- **D2** 删步骤解绑任务（`node_id = NULL`），不级联删除；删项目两样都解绑。
- **D3** 鱼骨用内联 SVG 手绘（脊背 + 交替上下刺），不引图表库：形状简单、可访问性好、零依赖。
- **D4** 首页分组只在「有项目」时出现；全部未归项目时退回旧版扁平列表，避免空壳标题。
- **D5** 折叠状态放内存（`Record<string, boolean>`），不落盘 —— 与 002–004 的只读口径一致。

## 验证

- `pnpm exec vue-tsc --noEmit`、`cargo clippy -- -D warnings`、`gate.ps1`、`check-i18n.ps1` 全绿。
- 真库迁移后 `schema_version = 3`、行数不变；截图见 `verify/`。
