# Feature Specification: 录入解析契约（Capture Parsing Contract）

**Feature Branch**: `001-parse-contract`

**Created**: 2026-11-06

**Status**: Draft

**Input**: User description: "把一句话录入的解析规则固化成契约测试"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 改 parse.ts 时立刻知道破了哪条既有语义 (Priority: P1)

维护者要改 `src/lib/parse.ts`（修 bug、加词表、为「快速捕获」铺路）。
改完后执行一条命令，测试用**当前**的语义给出红/绿：绿 = 没有破坏任何既有行为；红 = 报错信息直接指出破了哪一组语义。

**Why this priority**: 这是整个测试工作的全部价值来源。今天 `parse.ts` 的规则全靠人眼，
`delta === 0 → 7`、`@25:70 → 23:59`、跨年 `+1 year` 这类隐式决策没有任何守卫；一旦被"顺手优化"掉，
用户看到的是「输入 @周三 结果今天到期」这种静默错误，而不是崩溃。P1 因为它零数据风险、纯函数、一次成型。

**Independent Test**: 在不修改 `src/lib/parse.ts` 的前提下运行 `pnpm test` → 全绿；
把 `parse.ts` 里 `if (delta === 0) delta = 7;` 删掉后重跑 → 失败，且失败用例名里出现「周几」，
恢复后再次全绿。

**Acceptance Scenarios**:

1. **Given** 源码未改动，**When** 维护者执行 `pnpm test`，**Then** 全部用例通过，退出码 0。
2. **Given** 源码未改动，**When** 有人把 `@周三` 的「永远指下一个周三」改成「当天则取今天」，**Then** 至少一个用例失败，且失败输出包含该用例所属语义组的名字。
3. **Given** 有人新增了词表但漏了英文同义词，**When** 运行测试，**Then** 该组语义的中英对照用例报出缺失的一侧。

---

### User Story 2 - 把七组隐式语义写成可读的规格 (Priority: P2)

读者（接手的人、评审者、pi）不需要读实现就能回答「输入 `@明天` 会怎样」。
测试文件本身即规格：每个 `describe` 是一组语义，每个用例名是一句人话（当前行为，不是愿望）。

**Why this priority**: 宪法 I（一件事）和 V（双语是结构）都依赖"边界可陈述"。测试是唯一不会随 README 腐烂的说法。
P2 因为它不改行为、可独立合入，但价值依附于 P1 的红/绿能力。

**Independent Test**: 只读 `src/lib/parse.contract.test.ts`，不看 `parse.ts`，能正确回答下列七问：
1. 周四输入 `@周三` 得到哪一天？2. 输入 `@25:70` 得到几点的 `dueAt`？
3. 12 月 31 日输入 `@1-1` 得到哪一年？4. 输入 `@2-30` 的 `target` 是什么？
5. 输入 `买牛奶！` 的 `target` 是什么？6. 输入 `a  b   @明天` 的 `title` 有几个空格？
7. 输入 `@明天 @15:30` 的 `target` 是日期还是 `today`？

**Acceptance Scenarios**:

1. **Given** 测试文件，**When** 按七问逐条查找对应用例，**Then** 每问都能在一个用例名或断言中找到确定答案，无需读 `parse.ts`。
2. **Given** 任一用例，**When** 读断言，**Then** 断言对象是 `Parsed` 的公开字段（`title` / `target` / `dueAt`），不涉及函数内部变量。

---

### User Story 3 - 后续 feature 先改测试再改实现 (Priority: P3)

F005「快速捕获窗口」或中英词表扩展开工时，第一步是往这份契约里加/改用例（红），第二步才是改 `parse.ts`（绿）。

**Why this priority**: 它把这份测试从"一次性补作业"变成长期资产。P3 因为它没有独立的验收物，是流程收益。

**Independent Test**: 在 `001` 合入后，新建任一 `parse.ts` 相关 feature 的 `tasks.md`，其中必须存在类型为 `[契约]` 的任务且排在类型为 `[门禁]` 的实现任务之前。

**Acceptance Scenarios**:

1. **Given** 已合入的契约测试，**When** 开一个新 feature 要改 `parse.ts`，**Then** `tasks.md` 第一条 `[契约]` 任务描述是"新增期望行为的失败用例"，而非"改 parse.ts"。

---

### Edge Cases

- **空输入**：`""`、`"   "`、`"\n"` → `title` 为 `""`，`target` 为 `"inbox"`，`dueAt` 为 `null`，不得抛异常。
- **孤立 @**：`"@ "`、`"@"`、`"@明天@"` → 不匹配任何令牌时 `title` 原样保留该字符（`@` 不被吞掉）。
- **非日期 `@`**：`"@张三 的电话"`、`"mail me @foo"` → 不误判为日期，`target` 为 `"inbox"`。
- **非法日期**：`@2-30`、`@4-31`、`@13-1`、`@0-5` → `resolveDay` 返回 `null`，于是 `target` 为 `"inbox"`，**且令牌文字留在 `title` 里**（当前行为，不是理想行为）。
- **多个时间**：`@9:00 开会 @18:00` → 只取**第一个** `@9:00`，第二个留在 `title` 中。
- **多个日期**：`@明天 交给 @周三` → 只取第一个 `@明天`。
- **时间先于日期被剥离**：`@15:30 @明天` 与 `@明天 @15:30` 必须得到相同的 `title` / `target` / `dueAt`。
- **跨年**：今天 12 月 31 日时 `@1-1` → 明年 1 月 1 日（`picked.isBefore(today)` 触发 `add(1,"year")`）。
- **当天同月日**：今天 `@6-1` 而今天是 11 月 → 明年 6 月 1 日；今天正好 6 月 1 日 → `isBefore` 为 false，取当年（与"周几"规则相反，必须显式断言）。
- **感叹号**：`"买牛奶!"`、`"买牛奶！"`、`"买牛奶!!"` → `forceToday`，且 `title` 不含感叹号；句中感叹号 `"同意! 明天做"` 不被剥离（只匹配行尾）。
- **感叹号 + 日期**：`"@明天 交!"` → 日期优先，`target` 为该日期而非 `today`。
- **周几同日**：周三输入 `@周三` / `@wed` / `@星期三` → 下一个周三（+7 天），三者结果一致。
- **大小写与空格**：`@Wed`、`@WED`、`@day after`、`@dayafter` 都成立（正则带 `i` 且 `resolveDay` 会去空格）。
- **空白压缩**：`"发邮件   给  Anna"` → `title` 为 `"发邮件 给 Anna"`（`\s{2,}` → 单空格 + `trim`）。
- **时钟依赖**：所有涉及"今天"的断言必须由伪造系统时间产生，不得依赖真实当前时刻。

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 仓库 MUST 含自动化测试文件 `src/lib/parse.contract.test.ts`，导入并测试 `src/lib/parse.ts` 导出的 `parseCapture(raw: string): Parsed`。
- **FR-002**: 测试 MUST 覆盖 `Parsed` 的全部三个字段：`title`、`target`（`"today" | "inbox" | "YYYY-MM-DD"`）、`dueAt`（`"HH:MM" | null`）。
- **FR-003**: 测试 MUST 按**七组语义**分 `describe`：① 相对日（今天/明天/后天/大后天）② 周几（周X/星期X 与英文缩写）③ 显式月日与跨年 ④ 时钟时间与钳制 ⑤ 行尾感叹号 ⑥ 令牌剥离与空白压缩 ⑦ `target` 优先级。
- **FR-004**: 每条断言 MUST 表达可观察行为；MUST NOT 断言内部函数（`resolveDay`、`weekdayIndex`）或私有变量。
- **FR-005**: 时间 MUST 可注入：测试 MUST 用伪造系统时间（`vi.setSystemTime` / `vi.useFakeTimers`）固定"今天"，覆盖至少两个不同星期几与两个不同年份边界。
- **FR-006**: 单条命令 `pnpm test` MUST 运行全部契约用例并以非零退出码反映失败；MUST NOT 需要额外参数或环境变量。
- **FR-007**: 本 feature MUST NOT 修改 `src/lib/parse.ts` 的任何一行（characterization：记录现状，不修正期望）。发现的缺陷 MUST 记入 `specs/001-parse-contract/notes.md` 并在后续 feature 处理。
- **FR-008**: 每条用例名 MUST 可追溯到上面的七组语义或 Edge Cases 条目，以便失败时能直接说出"破的是哪条"。
- **FR-009**: 测试文件 MUST NOT 进入生产构建产物（不得被打包进 `dist/`），MUST NOT 影响 `pnpm build` 与 Tauri 体积。
- **FR-010**: 引入测试框架 MUST 至多新增 1 个 `devDependency`，且 MUST 在 `plan.md` 记录选择理由与备选方案。

*待澄清（最多 3 个，见下方 NEEDS CLARIFICATION）*

### Key Entities

- **`Parsed`**：`parseCapture` 的唯一返回值。`title`（已剥离令牌的正文）、`target`（三值语义：`inbox` 收件箱 / `today` 今天 / 具体日期）、`dueAt`（可选时刻）。
- **日期令牌**：`DAY_TOKENS` 正则覆盖的输入片段 —— 中文相对词、中文周几、英文相对词、英文星期缩写、`M-D`/`M.D`/`M/D`。
- **时钟令牌**：`@H:MM` 形式的片段，先于日期令牌被匹配与剥离。
- **强制今天标记**：行尾 `!` / `！`（一个或多个），只影响 `target`，不影响 `title` 的其他内容。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 在未修改 `src/lib/parse.ts` 的仓库上执行 `pnpm test` → 用例 100% 通过，退出码 0。
- **SC-002**: 用例总数 ≥ 24，且七组语义每组 ≥ 2 条，Edge Cases 中列出的 16 条边界各至少 1 条断言。
- **SC-003**: 故障注入有效：删除 `parse.ts:71` 的 `if (delta === 0) delta = 7;` 后重跑，测试 MUST 失败，且失败输出中包含"周几"字样。
- **SC-004**: `src/lib/parse.ts` 的语句覆盖率 ≥ 90%（含 `resolveDay` 的 `null` 分支与 `isBefore` 的 `add(1,"year")` 分支）。
- **SC-005**: 新增 `devDependency` 数量 ≤ 1；`pnpm build` 产物体积变化为 0 字节（测试文件不参与打包）。
- **SC-006**: 首次运行 `pnpm test` 的耗时（本地 Windows、冷启动）≤ 10 秒，后续运行 ≤ 3 秒。
- **SC-007**: 从"读到一条失败输出"到"定位到 `parse.ts` 的具体行"，人工耗时 ≤ 1 分钟（失败信息需含语义组名 + 输入 + 期望/实际）。

## Assumptions

- `src/lib/parse.ts` 是纯函数模块，只依赖 `dayjs`，不触碰 Tauri、DOM、`localStorage`（已核实：文件仅 `import dayjs from "dayjs"`）。
- `resolveDay` 内部调用的是**全局** `dayjs()`，因此伪造系统时间即可控制"今天"；本 feature 不修改该签名（若日后要注入 `now` 参数，属于新 feature）。
- 只测前端 TS 解析层；Rust 侧 `schedule.rs` 的语义测试属 F002，不在本 feature 范围。
- 不引入组件测试、e2e、快照测试。
- 测试时区为运行机器的本地时区（当前 CST/UTC+8）；跨时区行为不在本 feature 范围，用例必须避免把"时区"写进断言。
- `pnpm` 是唯一包管理器（`package.json` 的 `packageManager: pnpm@8.15.9`），不得生成 `package-lock.json`。

## 兼容边界

**本 feature 一行 `parse.ts` 都不改**，因此对外契约全部冻结（这是本 feature 能零风险合入的前提）：

- `src/lib/parse.ts` MUST 继续导出 `interface Parsed { title: string; target: string; dueAt: string | null }` 与 `function parseCapture(raw: string): Parsed`；签名、导出名、字段名、字段顺序均不变。
- `target` 的三个取值域 MUST 保持 `"today" | "inbox" | "YYYY-MM-DD"`；MUST NOT 新增第四种取值（如 `"tomorrow"`、`"someday"`）。
- `dueAt` MUST 继续是 `"HH:MM"` 字符串或 `null`；MUST NOT 变成 `Date`、时间戳或 `{h,m}` 对象。
- `CaptureBar.vue` 依赖的实时预览行为 MUST 不变（它每次输入调用一次 `parseCapture`，读 `target` 渲染目标提示）。
- `src/App.vue` 的 `add()` 依赖 `target` 直接落库（`"today"` / `"inbox"` / 日期字符串），MUST 保持三值语义，否则 3 个 `target` 分支会静默落到 else。
- IPC 命令名、`serde(rename_all = "camelCase")` 字段、DB 表列语义、`NOTICE_WINDOW_MIN = 120`、顺延规则 MUST NOT 被本 feature 触碰。
- 既有 i18n key MUST NOT 被重命名或删除；本 feature 不新增 key。
- 新增文件仅限 `src/lib/parse.contract.test.ts`、`specs/001-parse-contract/*`、`package.json` 的 `scripts.test` 与 `devDependencies`、`pnpm-lock.yaml`。

## 数据影响

- **DDL：无。** 不新增/修改/删除任何表或列；`tasks` / `meta` / `day_notes` 结构原样。
- **迁移：无。** 不读写 `user_version` / `schema_version`（当前仓库本就没有版本号，见 F003）。
- **回滚**：删除 `src/lib/parse.contract.test.ts` 并从 `package.json` 移除 `scripts.test` 与新增 `devDependency`，`pnpm install` 后即恢复原状；无遗留状态。
- **旧库兼容**：本 feature 不打开数据库，0.1.1 的 `suoji.db` 不受影响。
- **行数不变**：不产生任何写入；`meta` 表的 `last_rollover` 等键不被触碰。
- **测试隔离**：契约测试 MUST NOT 触碰 `%APPDATA%` 下的真实 `suoji.db`；本 feature 甚至不加载 Tauri 层。

## 双语影响

- **新增 i18n key：0 个。** 本 feature 不产生用户可见新文案，`src/lib/i18n.ts` 的 `dict.zh` / `dict.en` 与 `content.zh` / `content.en` MUST 一行不改（`scripts/speckit/check-i18n.ps1` 必须继续输出 `PASS dict zh=119 en=119`）。
- **Rust 侧 `src-tauri/src/i18n.rs` 的 `Labels` 结构：不改。**
- **测试内字面量**：契约测试里的输入字符串必然同时含中文词（今天/明天/周三/大后天）与英文词（today/tomorrow/wed/overmorrow），这是**输入对照**而非界面文案，无需翻译；但每组语义的用例 MUST 成对覆盖中英输入（见 FR-003 ① ②）。
- **唯一例外**：若失败信息需要中文，写在测试文件内联字符串里，不进 `dict`（不占用产品翻译资源）。

## 不可破坏的不变量

引用 `.specify/memory/constitution.md` v1.0.0：

- **I（一件事，NON-NEGOTIABLE）** → 本 feature 只加测试与一条 `pnpm test`，**不改 `parse.ts`**。任何"顺手把 `@2-30` 修成 null 且剥离令牌"的改动 MUST 拆到后续 feature（记入 `notes.md`）。
- **II（用户数据是唯一副本，NON-NEGOTIABLE）** → 契约测试 MUST NOT 打开或写入真实 `suoji.db`；`%APPDATA%\com.tool.suoji\suoji.db` 在测试前后 MUST 逐字节不变（本 feature 只跑纯函数，无 DB 访问路径）。
- **III（天生本地最小外联）** → 新增 `devDependency` MUST NOT 引入网络请求、遥测、安装期脚本（`postinstall`）；MUST 只用本地镜像可解析的公共包。
- **IV（IPC 最小攻击面）** → 本 feature MUST NOT 新增/放宽任何 `src-tauri/capabilities/default.json` 权限（当前 15 项 MUST 保持 15 项），MUST NOT 触碰 `"csp": null`。
- **V（双语是结构）** → 新增 key 必须 zh/en 成对；本 feature 新增 key 数为 0，`check-i18n.ps1` MUST 保持 PASS，不得为了让检查通过而注释掉某一侧。
- **技术边界：栈冻结** → 除 1 个测试框架 `devDependency` 外 MUST NOT 新增运行时依赖；MUST NOT 改 `pnpm@8.15.9`、Node 22、`rust-version`。
- **开发评审发布** → 合入前 `pnpm build` 与 `cargo clippy`/`fmt` 的现有结果 MUST 不变（本 feature 不碰 Rust）。

## NEEDS CLARIFICATION

- **NEEDS CLARIFICATION: 测试框架选 `vitest` 还是 Node 内置 `node:test` + 类型剥离？** 影响 FR-010 的唯一 `devDependency` 名额与 SC-005。倾向 `vitest`：与 Vite 同源、`vi.setSystemTime` 直接支持伪造时钟（FR-005），但会新增约 1 个依赖树；`node:test` 零新增依赖但需要额外 TS 转译手段。
