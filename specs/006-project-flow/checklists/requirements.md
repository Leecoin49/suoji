# Specification Quality Checklist: 006 项目节点链

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-11-09
**Feature**: [spec.md](./spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs) — 正文只讲行为；技术词集中在「数据影响／兼容边界」两段（闸门要求的冻结契约）
- [x] Focused on user value and business needs — US1 回答「接下来做什么」，US2 让链能改，US3 让多项目可用
- [x] Written for non-technical stakeholders — 「一条竖直的步骤链」「做完一步打勾，下一步自动成为当前」
- [x] All mandatory sections completed — 用户故事／Edge Cases／Requirements／Success Criteria／Key Entities／四段契约章节／决策记录

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain — 4 个问题已在 Clarifications 里定案
- [x] Requirements are testable and unambiguous — FR-001…FR-012 每条一个判断（打开、排序、当前标记、勾选、追加、改名、删除、进度、切换、新建、三态、失败保留）
- [x] Success criteria are measurable — SC-001 「≤1 次点击」、SC-002 「三处同时更新」、SC-009 「依赖改动 0 行」
- [x] Success criteria are technology-agnostic — 不出现表名、命令名、框架名
- [x] All acceptance scenarios are defined — 三篇用户故事各带 Why this priority 与场景
- [x] Edge cases are identified — 10 条（空链／全完成／空白标题／超长／空备注／删中间／并发／归档后追加／项目不删／命令失败）
- [x] Scope is clearly bounded — 明确排除拖拽、分列、批量、子任务树、截止日期
- [x] Dependencies and assumptions identified — 依赖 005 的 `projects`；节点不参与统计与顺延

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria — FR-001↔SC-001、FR-003↔SC-002、FR-005/006/007↔SC-003/SC-005、FR-008/009↔SC-004/SC-006/SC-007、FR-012↔SC-008
- [x] User scenarios cover primary flows — 打开→打勾→追加→改名→切换
- [x] Feature meets measurable outcomes defined in Success Criteria — 自动化覆盖 SC-003/SC-005/SC-009/SC-010/SC-011，其余待人工点击（见 verify/acceptance.txt）
- [x] No implementation details leak into specification

## Notes

- 宪法 I 的「看板/甘特视图、子任务树」禁令是本案最大风险，故在「不可破坏的不变量」里写了判据：节点数据只在 `nodes` 表、只被 5 条节点命令读写、`tasks` 表不增加任何节点引用。
- 「当前节点」刻意不落库（D2），避免与完成状态漂移；这条是可测的（SC-002 三处同时更新）。
- 归档项目仍可查看（SC-007），与 005「只归档不删除」一致。
