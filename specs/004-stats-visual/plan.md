# Implementation Plan: 复盘面板的视觉重排（日历热力图 + 指标卡）

**Branch**: `004-stats-visual` | **Date**: 2026-11-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/004-stats-visual/spec.md`

## Summary

把复盘面板从「自制小工具」重排为「专业产品」的视觉语言：天档主视图由细柱条换成**日历热力图**（7 行 × N 列、5 档单色色阶、今天用环、峰值用点）、数字区由两列描述列表换成**四张等宽指标卡**、区间切换加 **150ms 淡入**并尊重系统「减少动态效果」。全部读逻辑仍只经 `src/lib/stats.ts` 的纯函数；后端零改动、零 IPC 变更、零写入。

关键约束来自用户选择（spec 决策记录 D1–D4）与宪法 I：这是**只读面板的视觉重排**，不加导出、分享、目标、维度、筛选持久化。

## Technical Context

**Language/Version**: TypeScript 5.x（`vue-tsc --noEmit` strict）+ Vue 3.5 `<script setup>`；Rust 侧本次**不改**

**Primary Dependencies**: 既有 `dayjs ^1.11.13`、`lucide-vue-next ^0.469.0`、Tailwind 4（`@theme` 语义色板在 `src/style.css`）；**不新增任何依赖**（SC-010）

**Storage**: 无。0 DDL、0 迁移、0 写入；数据仍来自既有 `api.getStats(start, end)` 背后的 5 条只读查询

**Testing**: 仓库无测试框架（宪法：测试框架另立 feature）。沿用 002/003 的做法——纯函数用 `tsc` 编到 `.pi/tmp/` 后用 `node` 断言（`specs/004-stats-visual/verify/visual_check.mjs`），人工验收走 `quickstart.md` 的 SC 矩阵

**Target Platform**: Windows 桌面（Tauri 2 WebView2）。窗口 760×780，最小 520×560

**Project Type**: 桌面应用（前端 Tauri 壳 + 本地 SQLite）

**Performance Goals**: 切换区间到首帧 ≤300ms（002 实测 SQL 6.0ms + 聚合 8.3ms，增量预算 100ms）；热力图 90 列级渲染即 90 个 `<button>`，无需虚拟化

**Constraints**: 只用既有 12 个语义色与既有 8 档字号；格子最小可点 12×12；不横向滚动；`prefers-reduced-motion` 下过渡归零

**Scale/Scope**: 单个组件重排（`src/components/StatsSheet.vue`）+ `src/lib/stats.ts` 追加 5 个纯函数 + 14 条 i18n key + 1 条全局样式；预计 +250 行组件、+90 行纯函数

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 条款 | 本次是否触碰 | 证据行（文件/命令） |
|---|---|---|
| **I 一件事（NON-NEGOTIABLE）** | 只做视觉重排，功能面零扩张 | 改动面：`src/components/StatsSheet.vue`、`src/lib/stats.ts`、`src/lib/i18n.ts`、`src/style.css`、`README.md`、`README.zh-CN.md`；**不新增**导出/分享/目标/维度/持久化 —— 无新增按钮类目，`grep -c "api\." StatsSheet.vue` 仍只有 `api.getStats` |
| **II 数据唯一副本** | 0 DDL、0 迁移、0 写入 | `specs/004-stats-visual/verify/readonly-check.txt`（0 命中 INSERT/UPDATE/DELETE/localStorage）；`src-tauri/**` 零改动（`git status --short src-tauri` 空） |
| **III 本地优先、无网络** | 无网络调用、无新依赖 | `git diff --stat package.json pnpm-lock.yaml src-tauri/Cargo.toml` 三行均为 0 |
| **IV IPC 最小** | 命令数仍 17，字段不变 | `grep -c "commands::" src-tauri/src/lib.rs` = 17；`src-tauri/capabilities/default.json` 不在改动清单 |
| **V 双语成对** | 新增 14 条 key，zh/en 同提交 | `scripts/speckit/check-i18n.ps1` → PASS（期望 `zh=203 en=203`，即 189+14） |
| **栈冻结** | 不引图表库 | 热力图用 CSS grid + 既有 token；`package.json` 依赖块无 diff |
| **锁纪律** | 不碰 Rust | 同 II 的证据行 |
| **文档三同步** | README×2 + 应用内帮助 | `README.md`、`README.zh-CN.md`、`src/lib/i18n.ts` 的 `content.zh.stats`/`content.en.stats` 三处均提到「日历热力图」 |

**Gate 结论**：全部通过，无需要豁免的条目。`Complexity Tracking` 为空。

逐条证据行（闸门按此计数）：

- [x] **I 一件事** → 证据：改动面仅 `src/components/StatsSheet.vue`、`src/lib/stats.ts`、`src/lib/i18n.ts`、`src/style.css`、两份 README；本次不加任何新按钮类目，`grep -c "api\." src/components/StatsSheet.vue` 仍为 1（只有 `api.getStats`）
- [x] **II 数据唯一副本** → 证据：`git status --short src-tauri` 为空；0 DDL / 0 迁移 / 0 写入，`verify/readonly-check.txt` 对 INSERT/UPDATE/DELETE/localStorage 的扫描命中 0
- [x] **III 本地优先** → 证据：`git diff --stat package.json pnpm-lock.yaml src-tauri/Cargo.toml` 三行均为 0（SC-010），无网络调用
- [x] **IV IPC 最小** → 证据：`grep -c "commands::" src-tauri/src/lib.rs` = 17；`src-tauri/capabilities/default.json` 不在改动清单
- [x] **V 双语成对** → 证据：14 条新 key 同时落 `dict.zh` / `dict.en`，`scripts/speckit/check-i18n.ps1` 期望 `zh=203 en=203`
- [x] **栈冻结** → 证据：热力图用 CSS Grid + 既有 12 个语义 token 派生，`package.json` 依赖块无 diff
- [x] **锁纪律** → 证据：不碰 Rust（同 II 的 `git status` 证据）
- [x] **文档三同步** → 证据：`README.md`、`README.zh-CN.md`、`src/lib/i18n.ts` 的 `content.zh.stats` / `content.en.stats` 三处均补「日历热力图」一句

## Project Structure

### Documentation (this feature)

```text
specs/004-stats-visual/
├── spec.md              # 需求（已完成，16/16 清单通过）
├── plan.md              # 本文件
├── research.md          # R1–R7 决策（Phase 0）
├── data-model.md        # HeatCell / HeatGrid / MetricCard 与不变量（Phase 1）
├── contracts/
│   └── heat-grid.md     # 冻结面 + 新增纯函数签名 + 14 条 i18n key + a11y 契约
├── quickstart.md        # 断言脚本跑法 + 11 条 SC 验收矩阵 + 门禁
├── checklists/
│   └── requirements.md  # 16/16
└── verify/              # 运行期产物（断言报告、只读扫描、体积对比）
```

### Source Code (repository root)

```text
src/
├── components/StatsSheet.vue   # 主要改动：热力图视图、四张指标卡、切换淡入
├── lib/
│   ├── stats.ts                # 追加 levelOf / heatGridOf / monthTicksOf / heatMove / heatDatesOf
│   └── i18n.ts                 # 追加 14 条 stats.* 与 content.*.stats 一句
└── style.css                   # 追加 .fade-swap + prefers-reduced-motion 归零
README.md / README.zh-CN.md     # 功能描述补「日历热力图」
```

**Structure Decision**：不新增组件文件。热力图与柱图共享同一份 `axis` 桶数据、同一套下钻状态、同一个提示框，拆成两个组件会把 `filter`/`activeKey`/`tooltip` 三份状态用 props/emits 来回搬，反而更难维护。`StatsSheet.vue` 预计 600 → ~850 行，仍在单文件可读范围（003 已是 600 行且结构清晰）。

## Phase 0: Outline & Research

无 `NEEDS CLARIFICATION`（spec 已由 4 个用户选择 + 1 个推定结论闭合）。研究聚焦「怎么做才不破坏既有约束」，结论见 [research.md](./research.md)：

- **R1 热力图排版**：CSS `grid-auto-flow: column` + `grid-template-rows: repeat(7, …)`，列宽按周数取 22/18/14px 三档；否决绝对定位（要手算月标签、焦点环、响应式）。
- **R2 五档色阶**：`0 → bg-line-soft`、`1 → bg-accent/20`、`2 → bg-accent/40`、`3 → bg-accent/65`、`4 → bg-accent`；全部由既有 token 派生，不新增颜色。
- **R3 今天/峰值标记**：今天 = `ring-1 ring-ink/55 ring-offset-1`，峰值 = 右上角 4px 圆点；两者形状不同，色盲可辨（SC-006）。
- **R4 键盘**：roving tabindex，顺序 = 时间顺序（列优先），`←/→` ±1 天、`↑/↓` ±7 天、`Home/End` 首末、`Enter/Space` 交原生 click；纯函数 `heatMove` 供断言。
- **R5 动效**：新增 `.fade-swap`（150ms opacity-only），并以 `:key="applied.start+applied.end"` 重挂载触发；`@media (prefers-reduced-motion: reduce)` 全局把 `.rise`/`.sheet-up`/`.fade-swap` 的动画与所有 transition 归零。
- **R6 指标卡**：`grid-cols-2 min-[620px]:grid-cols-4`；760px 窗口内容宽 712 → 四张 ≈168px 同排，520px 最小宽 → 2×2（与 FR-010 一致）。
- **R7 不引图表库**：备选 Canvas（要处理 DPR、主题变化）、SVG（要手写坐标，收益低）、图表库（体积 + 宪法）全部否决。

## Phase 1: Design & Contracts

- **[data-model.md](./data-model.md)**：`HeatLevel`(0–4)、`HeatCell`、`HeatGrid`、`MonthTick`、`MetricCard` 五个实体的字段与不变量（H-1 格数 = 区间天数 + 空格、H-2 档位单调、H-3 今天唯一、H-4 峰值 ≥1 且并列全标、M-1 卡片值不可为 NaN）。
- **[contracts/heat-grid.md](./contracts/heat-grid.md)**：冻结面；`stats.ts` 新增 5 个纯函数签名；保留的 6 项既有行为；14 条 i18n key 对照；ARIA 与键盘契约；断言清单。
- **[quickstart.md](./quickstart.md)**：断言跑法、11 条 SC 矩阵、5 条门禁、还原数据。

## Phase 2: Task Planning Approach

*`/speckit.tasks` 依据本节生成任务，不在 plan 里复述任务清单。*

- **顺序**：纯函数与断言 → i18n → 组件热力图 → 组件指标卡 → 动效与 a11y → 文档与门禁。**纯函数先行**，因为组件只做格式化，数字错了要能定位在 stats.ts。
- **同文件串行**：`src/lib/stats.ts`（5 个函数同一文件，逐个追加以便断言）与 `src/components/StatsSheet.vue`（热力图 → 指标卡 → 动效三段改同一文件）必须串行；可并行的是 i18n、README×2、verify 脚本。
- **类型标签**（对 C007）：`[契约]` 纯函数签名与断言、`[双语]` i18n、`[门禁]` 断言/构建/闸门、`[数据]` 只读扫描与数据核对（本 feature 无 DDL，`[数据]` 仅用于 0 写入核验）。
- **MVP 边界**：纯函数 + 热力图 + 断言 + i18n 即可交付 US1；指标卡与动效是后续两个可独立验收的切片。

## Existing Code Impact

| 文件 | 为什么必须改 | 为什么不能新增文件替代 |
|---|---|---|
| `src/components/StatsSheet.vue` | 热力图替换柱图、指标卡替换 `dl`、切换淡入 | 与柱图共用 `axis`/`filter`/`activeBarKey`/`tooltip`，拆文件要搬三份状态 |
| `src/lib/stats.ts` | 新增 `levelOf`/`heatGridOf`/`monthTicksOf`/`heatMove`/`heatDatesOf` | 宪法「解析/规则唯一实现」精神：档位与网格必须可被断言，不能写在模板里 |
| `src/lib/i18n.ts` | 14 条新 key + content 一句 | 双语成对是硬规则，无处可绕 |
| `src/style.css` | `.fade-swap` 与 reduced-motion 归零 | Tailwind 无「reduce 时归零所有 transition」的现成工具类；自定义工具类放这里才全局生效 |
| `README.md` / `README.zh-CN.md` | 文档三同步 | — |

不改：`src-tauri/**`、`src/lib/api.ts`、`src/stores/**`、`src/App.vue`（面板入口与互斥逻辑不变）、`capabilities/default.json`。

## Re-evaluated Constitution Check (post-design)

设计完成后复核：新增的 5 个纯函数均为**无副作用纯函数**（不读 DOM、不读全局、不写存储），符合 II；14 条 key 全部落地到 `dict.zh` 与 `dict.en`，符合 V；热力图不引入任何第三方实现，符合栈冻结；组件仍只有一次 `api.getStats`，符合 IV。**无新增违规项**。

## Complexity Tracking

无。本 feature 不引入新依赖、新命令、新表、新存储，也没有需要豁免的宪法条款。
