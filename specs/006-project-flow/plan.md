# Implementation Plan: 006 项目节点链

**Feature**: `specs/006-project-flow/spec.md`
**Plan**: 2026-11-09

## Constitution Check

- [x] **I 一件事** → 证据：本 feature 只新增 `nodes` 一张表与 5 条命令（`src-tauri/src/commands.rs` 的 `list_nodes`/`save_node`/`delete_node`/`complete_node`/`reopen_node`），节点不挂任务、不嵌套、不参与顺延与完成统计（`src-tauri/src/schedule.rs` 未改）。
- [x] **II 数据唯一副本** → 证据：`src-tauri/src/db.rs` 的 `MIGRATION_2` 建表与索引；「当前节点」由 `ProjectSheet.vue` 的 `firstOpenId` 派生，无 `current_node_id` 字段、无 localStorage。
- [x] **III 本地优先** → 证据：`pnpm-lock.yaml` 与 `src-tauri/Cargo.toml` 零改动；命令只碰本地 SQLite。
- [x] **IV IPC 最小** → 证据：`src-tauri/src/lib.rs` 的 `generate_handler![]` 由 23 增至 28，仅追加；`src/lib/api.ts` 的五个方法一一对应；五个命令都返回 `Vec<Node>`（整条链），前端不做增量推测。
- [x] **V 双语** → 证据：`src/lib/i18n.ts` 的 `nav.projects` 与 15 个 `nodes.*` 键成对写入，`check-i18n.ps1` 报 zh=248 en=248。
- [x] **栈冻结** → 证据：无新依赖；组件只用 Vue 3 + Tailwind + lucide-vue-next 既有图标（`FolderTree`/`Check`/`Plus`/`Trash2`/`CircleDashed`/`CornerDownRight`/`X`）。
- [x] **锁纪律** → 证据：`commands.rs` 五个命令的 `Mutex<Connection>` guard 只覆盖 SQL，`nodes_of()` 返回前释放。
- [x] **阈值集中** → 证据：`NODE_TITLE_MAX = 60` 在 `src-tauri/src/commands.rs`；前端上限通过 `api.saveNode` 的错误文案呈现，未在 `.vue` 里重复写死数字。

## Existing Code Impact

| 文件 | 改动 | 为什么不能新增文件 |
|---|---|---|
| `src-tauri/src/db.rs` | `MIGRATIONS` 数组追加 `MIGRATION_2` | 迁移只能有一个执行器，否则版本号会打架 |
| `src-tauri/src/model.rs` | 追加 `Node` / `NodeInput` | 与既有 serde 约定同处 |
| `src-tauri/src/commands.rs` | 追加 5 条命令 + `nodes_of` | 单文件 28 条命令，拆分要动 `mod` 声明，超出本 feature |
| `src-tauri/src/lib.rs` | `generate_handler![]` +5 | 单一注册点 |
| `src/lib/api.ts` | 类型 + 5 方法 | 唯一 invoke 网关（宪法 IV） |
| `src/components/ProjectSheet.vue` | 新增 | 面板是独立界面，塞进 `StatsSheet.vue` 会混淆两件事 |
| `src/components/TitleBar.vue` / `src/App.vue` | 入口按钮与互斥挂载 | 与既有 sheet 同一套开合机制 |

## Phase 0: 调研结论

见 spec「Clarifications」：线性链、当前节点派生、节点无额外字段、归档可见。替代方案（拖拽图 / 自动生成下一步 / 节点挂任务）全部因宪法 I 或「不编数据」否决。

## Phase 1: 契约与数据

`db.rs` (`MIGRATION_2`) → `model.rs` (`Node`) → `commands.rs` (5 条) → `lib.rs` (+5) → `api.ts` (+5) → `i18n.ts` (16 key) → `ProjectSheet.vue` → `TitleBar.vue` / `App.vue`。

## Phase 2: 门禁

`vue-tsc --noEmit`、`cargo fmt --check`、`cargo clippy -D warnings`、`pnpm build`、`gate.ps1`、`check-i18n.ps1`，结果写入 `verify/auto_check.txt`；迁移前后库状态写入 `verify/after_check.py` 的输出。

## Post-Design Re-check

- 宪法 I：无拖拽、无分列、无批量、无子任务树 → 通过。
- 宪法 II：`nodes` 是唯一副本，无影子状态 → 通过。
- 复杂度：新增 1 表、1 组件、5 命令、16 key，没有为未来预留字段 → 通过。
