# Implementation Plan: 统计看板（复盘面板）

**Branch**: `002-stats-dashboard` | **Date**: 2026-11-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/002-stats-dashboard/spec.md`

## Summary

在「记录」旁边加一个**只读**的复盘面板：选一段时间（7/30/90 天预设或自定义起止日期），看到这段时间做掉了多少件、哪几天多哪几天少、连续做了几天、跟上一段等长时期比是涨还是落、哪些事被推后得最狠、现在还剩多少摊子。

技术做法一句话：**Rust 侧只跑 5 条只读 SELECT（明细 1 条 + 计数 4 条）把原始行和计数捞出来（`get_stats` 命令），所有聚合、分桶、连续天数、比较逻辑都放在前端一个纯函数模块 `src/lib/stats.ts` 里**，组件只负责渲染。这样"桶之和 = 小计 = 明细条数"是结构性成立的，并且当天/周/月的分桶规则只有一份实现。

## Technical Context

**Language/Version**: Rust（`src-tauri/Cargo.toml` 的 `rust-version`）+ TypeScript 5.x，Node 22（`.nvmrc`）

**Primary Dependencies**: Tauri 2、rusqlite（bundled）、chrono、serde；Vue 3 + Vite + Tailwind 4 + Pinia + dayjs + lucide-vue-next。**本 feature 不新增任何依赖**（不引入图表库，条形用 CSS 宽度实现）

**Storage**: 本地 SQLite `suoji.db`，3 张表 `tasks` / `meta` / `day_notes`。**本 feature 只读，零 DDL、零迁移、零写入**

**Testing**: 仓库当前无测试框架（测试体系的引入是独立 feature，见宪法「栈冻结」）；本 feature 的验证手段是 ① `src/lib/stats.ts` 纯函数按 quickstart 的手工矩阵逐条核对 ② `scripts/speckit/gate.ps1` + `check-i18n.ps1` ③ `vue-tsc --noEmit`、`cargo clippy -D warnings`、`cargo fmt --check`。若 F001 的 vitest 先落地，则给 `stats.ts` 补契约用例（spec Assumptions 已允许），但不作为本 feature 的完成条件

**Target Platform**: Windows 10/11 桌面（Tauri 2 WebView2），仅 NSIS 打包

**Project Type**: 单仓桌面应用（`src/` 前端 + `src-tauri/` 后端）

**Performance Goals**: 3 年区间（约 1095 天、每天 3 件 ≈ 3300 行）点开看板到渲染完成 ≤ 800ms；切换 7/30/90 预设 ≤ 300ms（spec SC-005 / SC-010）

**Constraints**: 离线；不写库；不新增 IPC 之外的通道；`done_at` 是本地时间字符串 `%Y-%m-%dT%H:%M:%S`（无时区后缀），`last_rolled_at` 是纯日期 `%Y-%m-%d`；前端不得自己算"今天"再传给后端做区间（由后端 clamp 到 app 本地日）

**Scale/Scope**: 单用户、单库；典型 1–3 年数据、≤ 1 万行 `tasks`；本 feature 触及 1 个新命令、1 个新纯函数模块、1 个新组件、5 处既有文件小改

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 条款 | 本 feature 的具体含义 | 结论 | 证据行 |
|---|---|---|---|
| **I 一件事**（NON-NEGOTIABLE，禁止"看板/甘特视图"） | 交付物是**只读静态聚合面板**：无拖拽、无分列、无批量操作、无编辑、无导出；关闭后不留任何状态 | PASS | spec `## Clarifications` D1 判据；`contracts/ipc-get-stats.md` 明列"只 SELECT"；`StatsSheet.vue` 不含任何 `write`/`edit` 类调用（只有 `api.getStats`） |
| **II 数据唯一副本**（不改表结构、不加列） | 零 DDL、零迁移、零 `ALTER TABLE`；旧库直接可开 | PASS | `data-model.md` §DDL 影响：无；`research.md` R6：不新增索引，复用 `idx_tasks_done`（`src-tauri/src/db.rs` 中 `ON tasks(done, done_at)`） |
| **III 本地优先、无网络** | 不发请求、不加远程依赖、不引入图表库/统计 SDK | PASS | `Technical Context` 依赖列表；`pnpm-lock.yaml` 无新增条目（实现阶段以 `git diff pnpm-lock.yaml` 为空自证） |
| **IV IPC 最小、camelCase、只走 api.ts** | 命令数 16 → 17，新增**只读** `get_stats`；三处同步注册 | PASS（在现有条款内，无需修宪） | `src-tauri/src/lib.rs:108` `generate_handler![]`；`src/lib/api.ts:39` `api` 网关；`src-tauri/src/model.rs` 用 `#[serde(rename_all = "camelCase")]`，不手写 rename |
| **V 双语成对** | `dict.zh` / `dict.en` 的同名 key 同提交；`content.zh` / `content.en` 同结构加 `stats: string[]` | PASS | `check-i18n.ps1` 现状 PASS（zh=119 / en=119）；新增 key 见 spec `## 双语影响` |
| **锁纪律**（`Db` 的 `Mutex<Connection>` 不得持锁调窗口/系统 API） | `get_stats` 的全部查询在 `let conn = db.0.lock()...` 作用域内完成，作用域结束即释放；`StatsSheet.vue` 只调 `api`，不碰窗口 API | PASS | 参照 `src-tauri/src/commands.rs:147` `list_done_history` 的既有写法（锁 → 查询 → 返回，无 await、无窗口调用） |
| **栈冻结** | 不加依赖、不加语言、不加测试框架 | PASS | 同上依赖列表；`research.md` R7（不引入图表库，用 Tailwind 宽度条） |
| **门禁** | C001–C010 全绿；`vue-tsc`、`clippy`、`fmt` 全绿 | PASS（计划期） | 本轮 `gate.ps1` 8 PASS / 0 FAIL / 2 SKIP（C007/C010 属实现期产物） |
| **文档三处同步** | README.md、README.zh-CN.md、应用内帮助（`HelpSheet` 的 `content.*.stats`）同提交更新 | PASS（计划覆盖） | spec `## 双语影响`；`tasks.md` 必须有 `[双语]` 任务覆盖三处 |

### 证据行（逐条对应上表，C010 的机器可读形式）

- [x] **I 一件事** → 证据：spec `## Clarifications` D1 的越界判据（拖拽/分列/批量=越界）；`contracts/ipc-get-stats.md` §5.1 零写入断言；`StatsSheet.vue` 只调 `api.getStats`
- [x] **II 数据唯一副本** → 证据：`data-model.md` §0 零 DDL/零索引/零写入；`src-tauri/src/db.rs` 不改；复用 `idx_tasks_done`
- [x] **III 本地优先** → 证据：`research.md` R7 无图表库；验收时 `git diff --stat pnpm-lock.yaml` 必须为空；`quickstart.md` SC-008 断网可用
- [x] **IV IPC 最小** → 证据：`src-tauri/src/lib.rs:108` 末尾追加 1 条；`src/lib/api.ts:39` 单一网关；`model.rs` 用 `#[serde(rename_all = "camelCase")]`
- [x] **V 双语成对** → 证据：`check-i18n.ps1` 现状 PASS（zh=119 / en=119）；新增 key 清单见 spec `## 双语影响`；`content.*.stats` 同结构
- [x] **锁纪律 + 栈冻结** → 证据：`src-tauri/src/commands.rs:147` 的 `list_done_history` 为锁作用域范本；`technical context` 依赖列表零新增

**Phase 0 后复检**：无新增违反。`get_stats` 的返回值刻意**只做搬运不做判断**（聚合全在前端），是为了让"宪法 I 的只读语义"和"桶=小计=明细"的可验证性都落在可审计的一处；`research.md` R4 记录了为此放弃"后端预聚合"和"后端 COUNT 全部分桶"的备选方案及理由。

**Phase 1 后复检**：`contracts/` 两份契约把"只读"和"单一聚合点"写成了可检查的断言（无 `INSERT/UPDATE/DELETE`；`stats.ts` 导出清单固定 6 个函数），与组件实现无冲突。仍 PASS。

## Project Structure

### Documentation (this feature)

```text
specs/002-stats-dashboard/
├── plan.md                      # 本文件
├── research.md                  # Phase 0：R1–R8 决策与备选
├── data-model.md                # Phase 1：实体/字段/校验/派生规则/SQL
├── quickstart.md                # Phase 1：可执行验收矩阵
├── contracts/
│   ├── ipc-get-stats.md         # IPC 契约（请求/响应/错误/不变量）
│   └── stats-lib.md             # 前端纯函数契约（导出签名与不变量）
└── tasks.md                     # Phase 2（/speckit.tasks 产出，非本轮）
```

### Source Code (repository root)

```text
src-tauri/src/
├── model.rs          # 改：新增 StatsSpan / DoneEntry / RollEntry / StatsRaw（camelCase）
├── commands.rs       # 改：新增 pub fn get_stats（+ 日期边界私有 helper）
├── lib.rs            # 改：generate_handler![] 追加 get_stats（16 → 17）
└── db.rs             # 不改（零 DDL）

src/
├── lib/
│   ├── api.ts        # 改：新增类型 + api.getStats(start, end)
│   ├── stats.ts      # 新：纯函数聚合（分桶/小计/连续/比较/粒度/校验）
│   └── i18n.ts       # 改：dict.zh + dict.en 加 stats.* 与 nav.stats；content.zh + content.en 加 stats: string[]
├── components/
│   ├── StatsSheet.vue   # 新：整屏 sheet，只读渲染
│   ├── TitleBar.vue     # 改：新增图表按钮 + emit("stats")
│   └── HelpSheet.vue    # 改：渲染 content.*.stats 段落
└── App.vue              # 改：statsOpen 状态、互斥打开、Esc 关闭、挂载 StatsSheet

README.md / README.zh-CN.md  # 改：功能一览里补一句统计看板
```

**Structure Decision**: 沿用单仓桌面结构（`src/` + `src-tauri/`），不新建目录层级、不引入 `stores/stats.ts`（面板状态是打开期间的局部状态，进 Pinia 只会增加"跨窗口残留"的风险）。

## Existing Code Impact

| 既有文件 | 改动性质 | 为什么不能只新不旧 | 复用的既有实现 |
|---|---|---|---|
| `src-tauri/src/commands.rs` | 追加 1 个 `#[tauri::command] pub fn get_stats(db: State<Db>, start: String, end: String) -> Result<StatsRaw, String>` + 2 个私有 helper（`date_bounds`、`parse_day`） | IPC 命令必须写在既有 commands 模块里，否则 `lib.rs` 要改模块结构 | 复用 `today()`（本地日）、`now_iso()` 风格、`load` 式的 `map_err(|e| e.to_string())` 错误约定；SQL 与 `list_done_history`（`commands.rs:147`）同构 |
| `src-tauri/src/model.rs` | 追加 4 个 struct（只 `Serialize`） | serde 边界就在这一处，散落会破坏 camelCase 一致性 | 复用 `#[serde(rename_all = "camelCase")]` 既有约定；不复制 `Task::from_row`（统计只取 4 列，直接 `row.get`） |
| `src-tauri/src/lib.rs` | `generate_handler![]` 追加 1 行 | 注册表是唯一入口 | 无 |
| `src/lib/api.ts` | 追加类型 + `getStats` 方法 | 前端唯一 invoke 网关（宪法 IV） | 复用 `invoke` 与既有"参数单数名"风格；**不**改成 `get_stats` 的 snake_case 参数名 |
| `src/lib/i18n.ts` | `dict.zh`/`dict.en` 各加 `stats.*` ~27 key + 1 个 `nav.stats`；`content.zh`/`content.en` 各加 `stats: string[]` | 键必须成对放在同一对象里（宪法 V），且 `MessageKey` 由 `dict.zh` 推导 | 复用 `t()` 的 `{n}` 占位替换；`MessageKey` 类型自动覆盖新 key |
| `src/components/TitleBar.vue` | 追加一个 lucide 图标按钮（`BarChart3`，新增到 `TitleBar.vue:3` 的 import）+ `emit("stats")`（在 `TitleBar.vue:9` 的 `defineEmits` 里加一行） | 入口按 D4 唯一，不能另起浮层 | 复用 `btn` 常量与 `:title="t('nav.stats')"` 的写法（参照 `TitleBar.vue:28-29` 的「记录」按钮） |
| `src/App.vue` | 加 `statsOpen` ref、`openStats()`、Esc 分支、模板挂载 | sheet 互斥与 Esc 只在 App 一处统一处理 | 复用 `onKeydown`（`App.vue:100-112`）与 float/sheet 布局；**注意**：底部提示区（`App.vue:364`）与 `CaptureBar`（`App.vue:378`）的 `v-if` 里还列了 `!historyOpen` 等条件，`!statsOpen` 必须同步加进去，否则面板背后会露出输入框 |
| `src/components/HelpSheet.vue` | 加一个 `<section>` 渲染 `helpContent.stats` | 帮助是文档三处同步之一，字段已加在 i18n | 复用 `why` 段落的 bullet 样式 |
| `src/lib/parse.ts` / `schedule.rs` / `db.rs` / `capabilities/default.json` | **不动** | 解析规则、顺延规则、表结构、权限集都与本 feature 无关 | — |

## Complexity Tracking

无宪法违反项，故无豁免。以下三点是"看起来像复杂度"但被明确拒绝或收敛的设计选择：

| 被考虑的复杂度 | 处理 | 理由 |
|---|---|---|
| 后端预聚合（Rust 直接返回按日/周/月分好桶的数组） | 拒绝 | 分桶规则会变成两份（Rust 判边界 + 前端判标签），CP 会漂移；且"桶之和 = 小计"从结构性变成约定性 |
| 新增 `stores/stats.ts`（Pinia） | 拒绝 | 面板是即开即算的只读视图，持久化状态只会带来陈旧数据与"上次区间"记忆（spec FR-002 明确不记忆） |
| 新增图表库（ECharts/Chart.js/unovis 等） | 拒绝 | 违反宪法 III/栈冻结；条形图用 `div` 宽度百分比即可，且中文字体、深浅色可直接继承现有 Tailwind token |

## Phase 0 / Phase 1 产出

- `research.md`：R1 分桶粒度与周首日、R2 `last_rolled_at` 是日期而非时间戳、R3 未标注完成时间的处理、R4 单一聚合点、R5 只读事务、R6 索引与查询形态、R7 无图表库的条形渲染、R8 错误态文案。
- `data-model.md`：`StatsSpan` / `DoneEntry` / `RollEntry` / `StatsRaw`（IPC 层）与 `StatsView` / `Bucket` / `Compare`（视图层）、校验规则、5 条 SQL、无 DDL 说明、FR↔字段映射。
- `contracts/ipc-get-stats.md`、`contracts/stats-lib.md`。
- `quickstart.md`：起服务、造数据、11 条 SC 的逐条验收步骤、门禁命令。

## Next Steps

1. `/speckit.tasks` 生成任务清单（`[契约]` 任务排在实现任务之前，数据类零任务但需一条"确认零 DDL"的 `[数据]` 任务）。
2. `/speckit.analyze` → `/speckit.implement`。
3. 实现后过闸：`gate.ps1`、`check-i18n.ps1`、`vue-tsc --noEmit`、`cargo clippy -D warnings`、`cargo fmt --check`。
