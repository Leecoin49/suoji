# Feature 009 — 截止日期、改期与按步骤录入

**Feature**: 009-deadline
**Status**: implemented
**Created**: 2026-11-10

## 用户故事（P1）

**As a** 每天靠琐记安排工作的人
**I want** 给一件事设一个真正的「最晚什么时候交」，并且随时能改日期、把新事直接放进项目的某一步
**So that** 我能一眼看到哪几件已经压线，而不用自己在备注里数天数

**Why this priority**: 现在只有「今天 15:30」这种当天的钟点（`due_at`），跨天的截止只能写在备注里，等于没有。

## 功能需求

- **FR-001** 任务可以有一个截止时刻（日期 + 时分），与「计划哪天做」相互独立。
- **FR-002** 截止时刻未填时分时按当天 23:59 处理。
- **FR-003** 任务行显示截止提示：逾期显示「逾期 N 天」，当天显示「今天 HH:MM 截止」，明天显示「明天 …」，更远显示 `MM-DD HH:MM 截止`。
- **FR-004** 逾期与当天的提示用醒目色（逾期 warn，当天 accent），其余用弱色。
- **FR-005** 右击菜单提供「设截止日期」，可就地选择日期时分，也可清除。
- **FR-006** 已计划的任务可以「改日期」（右击菜单），改到未来的日期才算推后（`roll_count` +1），与既有 `move_to_date` 规则一致。
- **FR-007** 未完成的任务才显示截止与改期入口；已完成的行不显示。
- **FR-008** 首页按项目/步骤分组时，分组头显示该组的逾期条数。

## 兼容边界

- 既有 37 条 IPC 全部保留，新增一条 `set_deadline(id, deadline)`（共 38 条）。
- `Task` 结构只增字段（`deadline`），既有字段名与语义不动；`due_at` 的含义仍是「当天几点」。
- `add_task` 的签名不动；步骤归属在创建后用既有的 `set_task_node` 补一次。
- `capabilities/default.json` 不变（15 项）。

## 数据影响

- `schema_version` 4 → **5**；`tasks` 新增可空列 `deadline TEXT`（`YYYY-MM-DDTHH:MM`）+ `idx_tasks_deadline`。
- 迁移仍在单事务内、幂等；旧库打开即自动加列，无数据丢失，无回填。
- 回滚方式：删除该列不可行（SQLite），改为忽略该列；代码回退后旧版本照常工作。

## 双语影响

新增 key（zh/en 成对）：`task.menu.reschedule`、`task.menu.deadline`、`task.deadline.overdue/today/tomorrow/later/clear`、`home.overdue`、`capture.stepAll`、`capture.newStep`；`capture.projectNone` 文案由「不归项目 / No project」改为「个人 / Personal」。

## 不可破坏的不变量

- 宪法 II：迁移在事务内、可重跑，不改历史行。
- 宪法 IV：IPC 只增不改；前端只经 `src/lib/api.ts`。
- 宪法 V：新文案 zh/en 同批落地。
- 宪法 I（v1.1.0）：仍然只有 项目 → 步骤 → 任务 三层，本 feature 不新增层级。
