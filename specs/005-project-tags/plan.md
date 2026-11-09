# Implementation Plan: 005 项目与标签——给任务归类，并按类统计

**Feature Branch**: `005-project-tags`
**Spec**: [spec.md](./spec.md)
**Created**: 2026-11-09

## Summary

给任务加两个正交维度（项目、标签），并让复盘面板能按这两个维度计数。核心约束：不动既有 17 条 IPC 的签名、不动 `StatsRaw` 的既有字段、迁移必须单事务可回滚。

## Technical Context

- **栈（冻结）**：Tauri 2 + rusqlite（bundled）+ chrono + Vue 3 + TS + Vite + Tailwind 4 + Pinia + dayjs。
- **数据存放**：`%APPDATA%\com.tool.suoji\suoji.db`（用户唯一副本）。
- **本轮新增依赖**：无。`dayjs` 已在用，季度起止手工算，不引 `quarterOfYear` 插件。
- **迁移机制**：`meta.schema_version`（现在不存在 → 视为 `0`）。`db::init` 在建完基础表后跑 `migrate()`，单事务；失败整事务回滚并把错误返回给启动流程。
- **查询形态**：复盘面板仍是**一次** `get_stats` 往返；分类计数在前端由已取回的明细派生（`DoneEntry` 追加 `projectId` 与 `tagIds` 两个可空/空数组字段），因此**不新增统计命令**。
- **测试**：仓库无测试框架（宪法「测试另立 feature」）。验收靠 `specs/005-project-tags/verify/` 下的脚本（Python 直连库 + Node 直跑编译后的纯函数），沿用 002/003/004 的做法。

## Constitution Check

- [x] **I 一件事** → 证据：本 plan 的功能面只有「项目、标签、按类计数、月季年预设」；节点推进图不在本轮（`spec.md` 的 `### 为什么流程图放到 006`），项目只做单层（`D1`），不做拖拽/批量/子任务树。
- [x] **II 数据唯一副本** → 证据：迁移只 `CREATE TABLE IF NOT EXISTS` + 补列前 `PRAGMA table_info` 判断（`src-tauri/src/db.rs` 新增 `migrate()`），不改既有行、不改列类型；迁移前自动复制 `suoji.db.pre-005`；`verify/migration_check.py` 比对三表行数与指纹。
- [x] **III 本地优先** → 证据：`package.json` 与 `src-tauri/Cargo.toml` 零改动（SC-007 用 `git diff --stat` 验证）；无网络调用。
- [x] **IV IPC 最小** → 证据：新增 6 条（下节逐条给理由），全部只碰本地库；`capabilities/default.json` 不增项（15 项不变）；前端只经 `src/lib/api.ts` 访问。
- [x] **V 双语成对** → 证据：新增 key 一次性写进 `dict.zh` 与 `dict.en`（`check-i18n.ps1` 必须 `zh=N en=N`），`content.*.stats` 与 README×2 同步。
- [x] **栈冻结** → 证据：不新增 `Cargo.toml` 依赖、不加 `pnpm` 依赖、不引入图表库。
- [x] **锁纪律** → 证据：新命令全部在 `Mutex<Connection>` 的作用域内读完即释放，不跨 `.await`（这些命令都是同步 `fn`，与既有命令同形态）。
- [x] **阈值不写死在组件** → 证据：项目名 1–20、标签名 1–16、单任务 10 个标签、列表折叠 12 行，全部进 `src/lib/classes.ts` 常量并由 spec 背书。

## Existing Code Impact

| 既有文件 | 改动 | 为什么不能只新增文件 |
|---|---|---|
| `src-tauri/src/db.rs` | 加 `SCHEMA_VERSION`、`migrate()`、`PROJECTS/TAGS/TASK_TAGS` 建表语句 | 建表与迁移是 `db::init` 的职责，另开文件会绕开「单事务」这个不变量 |
| `src-tauri/src/model.rs` | `Task` 加 `project_id`、`tag_ids`（都可缺省）；新增 `Project`、`Tag`、`ClassRow`、`ClassStats` | `Task` 是 IPC 契约的载体，必须就地扩展 |
| `src-tauri/src/commands.rs` | 追加 6 条命令 + 一个把 `tag_ids` 附到任务列表的私有 helper | 命令注册与连接使用方式与既有 17 条完全一致，拆文件会造成两套风格 |
| `src-tauri/src/lib.rs` | `generate_handler![]` 追加 6 条 | 注册点唯一 |
| `src/lib/api.ts` | 追加 `Project`/`Tag` 类型、6 个方法、`Task.projectId|tagIds`、`DoneEntry.projectId|tagIds` | 单一调用网关，宪法 IV |
| `src/stores/day.ts` | 持有 `projects`/`tags` 字典 + `loadClasses()`、`setTaskProject()`、`setTaskTags()` | 行内筹码要显示名字，需要字典；store 是唯一状态源 |
| `src/components/TaskRow.vue` | 行内项目筹码、标签筹码（>3 折叠为 +N）、hover「归类」按钮 | 归类入口必须贴在任务上 |
| `src/components/StatsSheet.vue` | 新增「按项目 / 按标签」卡片、月/季/年预设、类维度下钻 | 复盘面板是既有唯一统计视图，另开面板会让用户找不到 |
| `src/lib/stats.ts` | 追加 `classRowsOf`、`classShareOf`（纯函数） | 与既有聚合口径同源，放一起才能被同一份断言覆盖 |
| `src/lib/i18n.ts` | 新增 ~30 对 key + `content.*.stats` 补一句 | 双语唯一来源 |
| `src/App.vue` | 挂 `ClassSheet`、把 `classOpen` 纳入 Esc 与 `v-if` 互斥 | 浮层互斥规则集中在 App |

## New Files

| 文件 | 作用 |
|---|---|
| `src/lib/classes.ts` | 归类相关的常量与纯函数：`PROJECT_NAME_MAX`、`TAG_NAME_MAX`、`TAGS_PER_TASK`、`normalizeName`、`validateProjectName`、`validateTagName`、`classRowsOf`、`classShareOf` |
| `src/components/ClassSheet.vue` | 单任务的归类浮层：选/建项目、勾/建标签 |
| `specs/005-project-tags/verify/*` | 迁移核验、计数核验、只读核验、门禁报告 |

## New IPC Commands（逐条给理由）

| 命令 | 入参 | 出参 | 为什么不能省 |
|---|---|---|---|
| `list_classes` | — | `{ projects, tags }` | 项目与标签总是一起用（选择器要两列），合成一条省一次往返 |
| `save_project` | `{ id?, name, archived? }` | `Project` | 建/改名/归档三件事共用一条，避免 3 条命令 |
| `set_task_project` | `{ taskId, projectId? }` | `Task` | 归属是任务属性，只能由任务侧写 |
| `save_tag` | `{ name }` | `Tag` | 打标签时可能需要「顺手建新标签」，必须能按名取或建 |
| `delete_tag` | `{ id }` | `void` | 删标签要连带摘关系，必须在一个事务里做，前端做不到 |
| `set_task_tags` | `{ taskId, tagIds }` | `Task` | 整体替换比逐个增删少一次往返，也让「上限 10」只需一处校验 |

命令总数 17 → 23。**不加** `get_class_stats`：分类计数完全由 `get_stats` 已返回的明细派生（见 Technical Context）。

## Phase Design

- **Phase 0 契约先行**：`contracts/classes.md` 冻结字段名、错误码、迁移版本号；`verify/migration_check.py` 先写，跑在未迁移的副本上必须「无事发生」。
- **Phase 1 数据层**：`db.rs` 的 `SCHEMA_VERSION=1` + `migrate()`；`model.rs` 结构体；`commands.rs` 6 条命令；`lib.rs` 注册。
- **Phase 2 前端基座**：`api.ts` 类型与方法、`stores/day.ts` 字典与动作、`classes.ts` 常量与纯函数、i18n key。
- **Phase 3 归类交互**：`TaskRow.vue` 筹码、`ClassSheet.vue`、`App.vue` 挂载与互斥。
- **Phase 4 分类计数**：`stats.ts` 的 `classRowsOf`、`StatsSheet.vue` 的分类卡与三类下钻、月/季/年预设。
- **Phase 5 收尾**：README×2、应用内帮助、verify 报告、门禁、还原库。

## Risks

1. **迁移把用户的库搞坏** —— 最高优先级。缓解：迁移前自动 `suoji.db.pre-005` 副本；单事务；迁移后自检 `schema_version` 与三表行数；失败时回滚并向用户明说「升级没做，数据没动」。
2. **`Task` 加字段导致前端 `undefined`** —— 已被 AGENTS.md 列为高发反模式。缓解：新增字段全部 `Option`/`Vec` 并有默认；`api.ts` 类型同步；`TaskRow` 用 `?? []` 兜底。
3. **分类计数与明细不一致** —— 缓解：计数只从 `raw.done` 派生，下钻也过同一份数据；`verify/class_count_check.mjs` 断言「行计数 === 下钻条数」。
4. **StatsSheet 继续膨胀** —— 现状 37 KB。缓解：新增逻辑尽量进 `classes.ts` 纯函数，组件只做渲染。
