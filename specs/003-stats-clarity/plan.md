# Implementation Plan: 复盘面板的可读性重做

**Feature**: `specs/003-stats-clarity/spec.md` | **Branch**: `003-stats-clarity` | **Date**: 2026-11-09

## Summary

把已有的复盘面板从「一列细条 + 一串数字」改造成「一句结论 + 一张能读的图 + 可下钻、可分组的明细」。改动**只发生在前端渲染层与纯函数模块**：不新增 IPC、不改 `StatsRaw`、不碰 Rust、不写库、不引入依赖。数据口径（区间、推后榜、未标注）全部沿用 002 已定稿的契约。

## Technical Context

| 项 | 值 |
|---|---|
| Language / Version | TypeScript 5.x + Vue 3.5.13（`<script setup>`）；**Rust 侧 0 改动** |
| Primary Dependencies | `vue`、`dayjs 1.11.13`、`lucide-vue-next 0.469`（既有，按需引入）；**新增 0 个** |
| Storage | 不直接访问；只消费 `api.getStats()` 的返回值（`models.rs` 的 `StatsRaw` 冻结） |
| Testing | 仓库无测试框架（宪法「测试现状」）。验证 = `specs/003-stats-clarity/verify/*.mjs`（纯函数，沿用 002 的 `tsc → node` 手法）+ 手工验收记录 + 截图 |
| Target Platform | Windows 10/11 桌面（Tauri 2 / WebView2），窗口可窄至主窗最小宽度 |
| Project Type | 桌面应用（单窗口 + 浮层），本 feature 只改浮层内部 |
| Performance Goals | 10 000 条 / 365 天档：切换区间到画面稳定 ≤ 500 ms，且相对 002 基线（SQL 6.0 ms + 聚合 8.3 ms）增幅 ≤ 100 ms；首屏可交互元素受折叠约束 |
| Constraints | IPC 17 条冻结、`capabilities` 15 项、0 新依赖、0 写入、0 DDL、i18n 严格成对、既有 key 不重命名/删除/重排 |
| Scale / Scope | ≤ 50 000 条任务；1 个组件重写 + 1 个纯函数模块扩展 + i18n 增量 + 两份 README |

## Constitution Check

| 原则 | 本 feature 的落实 | 判定 |
|---|---|---|
| I 一件事（NON-NEGOTIABLE） | 只做「让面板读得懂」：结论句、图、下钻、分组、键盘、空态分档、口径脚注。不含时段/星期/完成率（004）、导出（005）、标签（006），不含拖拽/分列/批量 | ✅ |
| II 数据是唯一副本（NON-NEGOTIABLE） | 0 DDL、0 迁移、0 写入；下钻与折叠是内存状态，不落 `meta`；不新增快照表 | ✅ |
| III 天生本地、最小外联 | 0 新依赖、0 网络；图形用既有 Tailwind + 内联样式绘制 | ✅ |
| IV IPC 最小攻击面 | 命令集 17 条不变；不新增查询参数（下钻走视图层筛选）；`capabilities/default.json` 不增删 | ✅ |
| V 双语是结构 | 新增 ~34 个 `stats.*` key 中英同批；`content.zh` / `content.en` 的 `stats` 段落同结构重写；Rust `Labels` 不动 | ✅ |
| 锁纪律 | 不触及 Rust 持锁路径；不新增任何 `State<Db>` 使用 | ✅ |
| 栈冻结 | 不加图表库/日期库/新工具链；`pnpm@8.15.9`、Node 22 不变 | ✅ |
| 门禁 | `vue-tsc --noEmit`、`cargo fmt --check`、`cargo clippy -D warnings`、`gate.ps1`、`check-i18n.ps1` 全绿才算完成 | ✅ |
| 测试现状 | 不引入测试框架；纯函数规则用 `verify/` 下的 Node 脚本断言，交互用验收表 + 截图 | ✅ |
| 可访问性底线（本 feature 自加） | 时间桶是原生 `<button>`（天然可 Tab），focus 环可见，Esc 关闭 | ✅ |

### 证据行（逐条对应上表，C010 的机器可读形式）

- [x] I 一件事 → `spec.md` 的 `## Clarifications` 与 D1/D2 明列「不做」四类内容（004/005/006/拖拽分列）；本计划的 Source Code 段只列 3 个源文件，未涉及任何新功能面。
- [x] II 数据是唯一副本 → `plan.md` 的 Technical Context 无 Storage 写入；`data-model.md` 五个实体均标注「内存派生、不持久化」；`contracts/stats-clarity.md` §6 给出可扫描的只读约束。
- [x] III 天生本地、最小外联 → `research.md` R1/R9 选定「用布局画图 + 只用既有 token」；SC-010 以 `git diff --stat pnpm-lock.yaml` 输出为空作为机器判据。
- [x] IV IPC 最小攻击面 → 下钻用 `filterEntries` 在已取回的 `raw.done` 上过滤，`src-tauri/src/lib.rs` 与 `src/lib/api.ts` 本 feature 零改动。
- [x] V 双语是结构 → `contracts/stats-clarity.md` §5 已逐条给出 zh/en 示例与占位符（含连接符 `stats.conclusionJoin`）；`check-i18n.ps1` 输出 `PASS dict zh=N en=N` 且 N ≥ 155。
- [x] 锁纪律 → `git diff --stat src-tauri/` 为空，本 feature 不新增任何 `State<Db>` 使用。
- [x] 栈冻结 → `pnpm-lock.yaml` 与 `src-tauri/Cargo.toml` 的 diff 为空（同上一条互证）。
- [x] 门禁 → `quickstart.md` §3 列出 5 条命令与期望输出，其中 `cargo` 两条期望「无差异」，用作「改动越界」的哨兵。
- [x] 测试现状 → `verify/clarity_check.mjs` 以 `node` 直接运行并打印 `OK (0 failure(s))`，不引入 `vitest` 等框架。
- [x] 可访问性底线 → `research.md` R6 的 roving tabindex 与 `contracts` §4 键盘映射表，SC-006 要求「零鼠标操作」。

### 设计后复查（Post-Design Re-check，2026-11-09）

Phase 0/1 的设计没有引入新的宪法风险，逐条复查：

- **I**：设计产出的 6 个纯函数全部只服务于「读得懂」，没有新增任何写入/查询/拖拽能力；`contracts` §1 把 002 的口径列为冻结面，防止实现期顺手扩大范围。
- **II**：`data-model.md` 的五个实体全部标注「内存派生、不持久化」；`contracts` §6 给出可扫描的只读约束（禁写命令、禁 localStorage）。
- **III**：`research.md` R1/R9 明确「用布局画图、只用既有 token」，SC-010 用依赖 diff 行数 0 作为机器判据。
- **IV**：`contracts` §1 冻结 IPC 与 `capabilities`；`data-model.md` 的 `Filter` 在视图层实现下钻，避免新增查询参数。
- **V**：`contracts` §5 的 key 表已逐条给出 zh/en 示例与占位符，`stats.conclusionJoin` 这类「连接符也要成对」的细节已前置决定，避免实现期出现只有中文的连接符。
- **门禁**：`quickstart.md` §3 列了 5 条命令与期望输出；其中 `cargo` 两条期望「无差异」，用作「改动越界」的哨兵。

结论：**无新违反项，`Complexity Tracking` 仍为空**。

## Project Structure

### Documentation (this feature)

```
specs/003-stats-clarity/
├── spec.md                 # 已完成（闸门 8 PASS）
├── plan.md                 # 本文件
├── research.md             # Phase 0：8 个设计决策与备选方案
├── data-model.md           # Phase 1：结论/时间桶/分组/筛选/稀疏 五个视图层实体
├── contracts/
│   └── stats-clarity.md    # Phase 1：纯函数契约 + UI 交互契约 + 键盘映射 + i18n key 表
├── quickstart.md           # Phase 1：用演示库跑通的验收剧本
├── checklists/
│   └── requirements.md     # 已完成（16/16）
└── verify/                 # 实现期产出的断言脚本与报告（沿用 002 命名）
```

### Source Code (repository root)

```
src/
├── lib/
│   ├── stats.ts            # 扩展：+6 个纯函数（见 contracts §2），既有 8 个签名冻结
│   └── i18n.ts             # 增量：+~34 个 stats.* key；重写 content.*.stats 三行说明
└── components/
    └── StatsSheet.vue      # 重写渲染层（script 里的 load/ticket/presets 逻辑保留）

README.md / README.zh-CN.md # 功能条目升级为「结论 + 可下钻的分布图 + 按天分组」
```

**不新增组件文件**：面板只有单一消费者（`App.vue` 的 `StatsSheet`），再拆 `StatsChart.vue` / `DoneGroupList.vue` 会产生 props/emits 噪音而不带来复用；纯逻辑已经全部下沉到 `stats.ts`，组件只负责渲染与交互状态。

## Existing Code Impact

| 既有文件 | 为什么必须改它 | 改动性质 | 不能新增替代文件的原因 |
|---|---|---|---|
| `src/components/StatsSheet.vue` | 「粗糙」的 12 处症状全部在这个文件里（`h-[6px]` 细条、原生 `title`、全量明细平铺、无刻度、无下钻） | 重写模板；保留 `load()` / `ticket` 防串号 / `pickPreset` / 自定义日期校验 / `api.getStats` 调用 | 换组件会让 `App.vue` 的 `statsOpen` 互斥、Esc 关窗、`TitleBar` 入口三处都要改，收益为负 |
| `src/lib/stats.ts` | 结论句、分组、稀疏分档、刻度、占比必须是可断言的纯函数（宪法「测试现状」下唯一可靠的验证方式） | 追加 6 个导出 + 2 个类型；**既有 8 个导出签名与语义不改** | 另建 `stats-view.ts` 会把同源计算拆成两处，002 的契约测试脚本要跟着改；同文件扩展更省评审面积 |
| `src/lib/i18n.ts` | FR-015 要求新文案成对；FR-010 要求空态分档；帮助段落要反映新面板 | 追加 key（不重排、不改既有 key）；改写 `content.zh.stats` / `content.en.stats` 的 3 行 | 这是双语唯一事实源，绕不过去 |
| `README.md` / `README.zh-CN.md` | 宪法「文档三处同步」：帮助 + 两份 README 必须同批 | 改写既有「回头看一段」条目 | 同上 |

**明确不改**：`src-tauri/**`（0 改动）、`src/lib/api.ts`（`getStats` 签名冻结）、`src/App.vue`（`statsOpen` 与 Esc 分支 002 已接好）、`src/components/TitleBar.vue`（入口已存在）、`src/components/HelpSheet.vue`（按 `content` 动态渲染，形状不变则无需改）、`src-tauri/capabilities/default.json`。

## Complexity Tracking

无宪法偏离项。两处「看起来更复杂」的选择已在 `research.md` 里记了理由与备选：

1. **自绘提示框**替代原生 `title`（原生有 1 秒延迟、不可样式化、键盘不可达）。
2. **单文件承载 5 个渲染区块**（结论/图/推后/分组明细/脚注）而非拆组件，理由是单一消费者 + 逻辑已下沉。

## Phase 0 / Phase 1 产出

- `research.md`：R1 图形形态（CSS 竖柱 vs SVG vs 图表库）、R2 提示框策略、R3 下钻状态归属、R4 分组折叠默认值、R5 结论句的文案拼装位置、R6 键盘与焦点契约、R7 稀疏分档判据、R8 性能预算。
- `data-model.md`：`Conclusion` / `AxisBucket`（扩展既有 `Bucket`）/ `DayGroup` / `Filter` / `Sparsity` 五个视图层实体，字段、不变量与状态迁移。
- `contracts/stats-clarity.md`：新增纯函数的签名与不变量、UI 契约（props/emits/无 props）、键盘映射表、i18n key ↔ 用途对照表、只读性约束。
- `quickstart.md`：用 `verify/seed_demo.py` 造 248 条演示库 → 逐条验收 SC-001…SC-011 的可执行剧本。

> 实现期还会新增 `specs/003-stats-clarity/verify/clarity_check.mjs`（纯函数断言，`OK (0 failure(s))`）与 `verify/demo.db`（演示库，验收后删除）。

## Next Steps

`/speckit.tasks`（本 feature 无契约变更、无数据迁移，任务以「纯函数 → 渲染层 → 文案 → 验收」顺序编排）。
