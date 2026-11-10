# Implementation Plan: 周期任务

**Feature**: 008-recurring
**Spec**: [spec.md](./spec.md)

## 技术上下文

- 栈：Tauri 2 + rusqlite（bundled）+ chrono / Vue 3 + Pinia + dayjs，**不加依赖**。
- 规则解析放 Rust（写入侧）；前端只做展示与表单，不重复实现命中判断。

## Constitution Check

- [x] **I 一件事**：只做周期任务，不做提醒时间、不做重复提醒的推送 → 证据：spec `## 兼容边界`。
- [x] **II 数据唯一副本**：迁移 `schema_version` 3 → 4，单事务，迁移前复制备份 → 证据：`src-tauri/src/db.rs::migrate`。
- [x] **III 本地优先**：不联网、不加依赖 → 证据：`git diff --name-only` 不含 `package.json` / `Cargo.toml`。
- [x] **IV IPC 最小**：新增 4 条只读/写入命令，既有 33 条不动 → 证据：`src-tauri/src/lib.rs` 的 `generate_handler![]`。
- [x] **V 双语成对**：新增 20 键 zh/en 成对 → 证据：`scripts/speckit/check-i18n.ps1`。
- [x] **锁纪律**：所有 DB 访问在 `State<Db>` 的锁内完成，不跨窗口 API → 证据：`commands.rs` 各命令体。
- [x] **栈冻结**：仅用 chrono 的 `Weekday`，无新 crate。

## Existing Code Impact

| 文件 | 改动 | 为什么不能新增文件 |
|---|---|---|
| `src-tauri/src/db.rs` | 加 `MIGRATION_3`、两列、两索引 | 迁移序列只有一处，分开会导致顺序不可控 |
| `src-tauri/src/model.rs` | `Task` 加字段；新增 `Recurrence`/`RecurrenceInput` | 类型集中在 model.rs |
| `src-tauri/src/commands.rs` | `materialize` / `expire_stale` / 4 条命令；`rollover`、`build_day` 接入 | 命令模块已按领域聚合 |
| `src-tauri/src/lib.rs` | 注册 4 条命令 | 唯一的注册点 |
| `src/lib/api.ts` | 类型 + 4 个方法 | 唯一的前端调用入口 |
| `src/stores/day.ts` | 规则列表与增删改 | 单一状态源 |
| `src/components/RecurringSheet.vue` | 新增浮层 | 新界面，无既有宿主 |
| `src/components/CaptureBar.vue` | 周期入口胶囊 | 录入即设定最省事 |
| `src/components/TaskRow.vue` | 周期徽标 | 行内信息 |
| `src/lib/i18n.ts` | 20 个键 + 帮助 | 唯一文案表 |

## 设计要点

1. **生成（materialize）**：打开今天视图时按规则补当天这一班，`INSERT ... ON CONFLICT(recurrence_id, occurrence_date) DO NOTHING` 保证幂等。
2. **过期（expire_stale）**：跨天时把 `occurrence_date < today` 且未完成的班置为 `bucket='expired'`，它们既不进今天列表也不进收件箱计数。
3. **命中判断**：`daily` 恒真；`weekly` 用 `chrono::Weekday::number_from_monday()` 比对 `days`；`monthly` 用 `month_day`，若大于当月天数则命中当月最后一天。
4. **统计**：不做任何特殊处理 —— 每一班就是一行 `done=1` 的任务，`get_stats` 原样计入。
5. **删除**：未完成的班软删，已完成的班保留并把 `recurrence_id` 置空（成为历史里的普通任务）。

## 阶段

- Phase 0：迁移与模型（契约先行）。
- Phase 1：生成/过期与 4 条命令。
- Phase 2：前端入口与浮层。
- Phase 3：验收脚本与文档同步。
