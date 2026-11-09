# Specification Quality Checklist: 项目与标签——给任务归类，并按类统计

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-11-09
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

### 逐项判定与证据

- **No implementation details**: 主体（`## 背景与切分` 到 `## Success Criteria`）只写行为、口径与数字。`## 兼容边界` / `## 数据影响` / `## 双语影响` / `## 不可破坏的不变量` 四段是项目闸门（C003）强制的契约章节，按 001–004 的惯例保留技术词（IPC、serde、`schema_version`、DDL），它们约束「不许变什么」，不描述「怎么做」。实现手段（命令名、表名、索引、组件结构）全部留给 `plan.md`。
- **Focused on user value**: 一句话价值写在 `## 背景与切分`：「这件事属于哪个项目、打了什么标签；一个月/一季/一年到底写了多少篇，一眼看到件数」。三篇用户故事各自独立可交付（P1 项目分类、P2 标签计数、P3 月/季/年预设）。
- **Non-technical stakeholders**: 用户故事与验收场景用「建项目 → 归任务 → 看件数」的业务语言写成，验收人不需要知道数据库。
- **All mandatory sections completed**: 用户故事 3 篇（P1/P2/P3，含 Why this priority 与 Independent Test）、Edge Cases 20 条、FR-001…FR-018、Key Entities 6 个、SC-001…SC-011、Assumptions 7 条、决策记录 D1–D7，加闸门四段。
- **No NEEDS CLARIFICATION**: 全文 0 个标记。曾有 3 个范围冲突（先做哪件 / 宪法 I 的越界线 / 迁移是否前置），用户选择直接继续，已按 `## 决策记录` D1–D3 定夺并写明「如需调整，在 `/speckit.plan` 之前提出」。
- **Testable and unambiguous**: 每条 FR 都可判断真假，例如 FR-005「未分类行恒定显示（0 件也显示）」、FR-013「多标签各计一次且页面必须说明」。含糊处一律给了具体数字（项目名 1–20 字、标签名 1–16 字、单任务最多 10 个标签、列表超 12 行折叠）。
- **Measurable success criteria**: SC-001（3 次点击、1 秒）、SC-002（抽样 10 组 0 偏差）、SC-003（5 次点击 2 次输入）、SC-004（500 ms）、SC-005（0 行变化 + 指纹一致）、SC-007（依赖改动 0 行）、SC-010（3/3）。
- **Technology-agnostic criteria**: SC 里没有框架、库、API 名；SC-007 的「依赖清单与锁文件」是项目既有的冻结契约（宪法 III），不是选型。
- **Acceptance scenarios defined**: 每个用户故事 2–3 条 Given/When/Then，状态与动作都是具体的（如「一件任务当前属于「部门内务」→ 改归「重点项目 A」」）。
- **Edge cases identified**: 20 条，覆盖空库、重名、超长、上限、删除/归档、软删任务、未留完成时刻、多标签重复计数、0 件行、跨年、单日、未来结束日、时间边界、30 项目 / 1 年、快速连点、外部改动后的刷新。
- **Scope clearly bounded**: `## 背景与切分` 明确 005 = 项目 + 标签 + 按类计数，006 = 节点推进图；`### 为什么流程图放到 006` 给出三条理由；`## 后续` 再列一次不在本 feature 内的东西。
- **Dependencies and assumptions**: Assumptions 7 条（完成时刻概念、双语、数量级、单层够用、自然季度、不影响顺延、备份意愿），依赖既有 002/003/004 的统计口径与只读约束。
- **FR have clear acceptance criteria**: 每条 FR 都能在用户故事或 Edge Cases 里找到对应场景；统计口径类 FR（FR-013 / FR-014）与 SC-002 直接挂钩。
- **User scenarios cover primary flows**: 建/改/归档项目、归任务、打标签、按项目看、按标签看、月/季/年切换 —— 覆盖用户提的三件事中属于 005 的部分。
- **Feature meets measurable outcomes**: SC-001…SC-011 与 FR 一一可追溯，验收矩阵将在 `quickstart.md` 里逐条落到命令与人工步骤。
- **No implementation details leak**: 输出里没有出现表名、命令名、组件名、库名；唯一的技术名词集中在四段契约章节。

### 待用户确认（不阻塞）

- D1（单层项目）、D2（流程图推迟到 006）、D3（先落 `schema_version`）是按宪法与 AGENTS.md 自行定夺的。若与预期不符，请在 `/speckit.plan` 之前说，改 spec 的成本最低。
