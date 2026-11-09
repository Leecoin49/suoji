# AGENTS.md — 琐记 / SuoJi

给 AI 代理与人的操作手册。**规则以 `.specify/memory/constitution.md` 为准**，本文件只讲"怎么走流程、文件在哪、命令是什么"。

- 产品：Windows 桌面记事/日程应用，中文名「琐记」。本地优先、无账号、无云同步。
- 技术栈：Tauri 2 + Vue 3 + TypeScript + Vite + Tailwind 4 + Pinia + rusqlite(bundled)。
- 包管理：`pnpm@8.15.9`（唯一）；Node `.nvmrc` = 22；Rust 见 `src-tauri/Cargo.toml` 的 `rust-version`。
- 构建：仅 Windows NSIS（MSI 无法编码中文产品名「琐记」）。

## 开工前必读（按顺序）

1. `.specify/memory/constitution.md` — 五条原则，违反即不合入
2. 当前 feature 的 `specs/<NNN>-<slug>/spec.md` — 要做什么、不许变什么
3. `CONTRIBUTING.zh-CN.md` — 提交与发布约定

## 文件地图

| 路径 | 作用 | 可改？ |
|---|---|---|
| `src/lib/parse.ts` | 一句话录入的解析规则（纯函数，唯一的解析实现） | 可改，但先加测试 |
| `src/lib/i18n.ts` | `dict.zh`/`dict.en`（119 键）+ `content.zh`/`content.en`（应用内帮助）+ `t()` | 可改，必须成对 |
| `src-tauri/src/db.rs` | 建表 + 打开连接（3 张表：`tasks` / `meta` / `day_notes`） | 谨慎，见"数据" |
| `src-tauri/src/lib.rs` | `generate_handler![]` 16 条 IPC 命令注册、单实例、关窗行为 | 谨慎 |
| `src-tauri/src/schedule.rs` | 顺延（rollover）、回到收件箱、结账 | 谨慎 |
| `src-tauri/capabilities/default.json` | 15 项权限 | 只加不减，需理由 |
| `.specify/memory/constitution.md` | 唯一事实源 | 见 Amendment |
| `.specify/scripts/powershell/*` | spec-kit 官方脚本（5 个） | **禁止手改** |
| `.pi/prompts/speckit.*.md` | spec-kit 命令（9 个），供 pi 读取 | **禁止手改** |
| `scripts/speckit/*.ps1` | 本项目自建的闸门（gate / check-i18n / new-feature） | 可改，改完跑一遍 |
| `specs/<NNN>-<slug>/` | 每个 feature 的产物 | 只追加，不改历史 |

## 开发一个新功能：七步

先判断该不该走流程。**走**：会改 DB 结构、改 IPC 契约、改用户可见行为、跨 3 个以上文件、或耗时超过半天。
**不走**：改 typo、改文案、单文件 bugfix、依赖升级 —— 直接改、直接提。

### 第 1 步：选一个有界变更，并写清"不许变什么"

一个 feature 只做一件事（宪法 I）。先在纸上写三行：

```
要改的：<一句话>
不许变的：<IPC 名 / 字段 / i18n key / 顺延规则 / 表列语义 中受影响的那些>
出错的代价：<数据丢失？静默错日期？只是难看？>
```

第三行决定要不要做测试与迁移。

### 第 2 步：建 feature 目录

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/speckit/new-feature.ps1 -ShortName parse-contract "把一句话录入的解析规则固化成契约测试"
```

产物：`specs/NNN-<slug>/spec.md`（模板 + 四段骨架）+ `.specify/feature.json`（指向当前 feature）。
命令也可在 pi 里用 `/speckit.specify <描述>`；两者等价，`new-feature.ps1` 额外保证四段存在。

### 第 3 步：写 spec（只写"什么/为什么"，不写"怎么"）

必须填满：

- 用户故事：P1 一个即可，`Why this priority` 要写**为什么它能单独交付价值**
- `FR-NNN`：可验证的"系统必须…"，一条一个判断
- `SC-NNN`：可测量的成功标准，带阈值（数字、秒、百分比、用例数）
- **四段**（闸门强制）：
  - `## 兼容边界` —— 冻结的契约：IPC 名、serde 字段、i18n key、表列语义、`NOTICE_WINDOW_MIN`、顺延规则
  - `## 数据影响` —— 有无 DDL、是否迁移、回滚方式、旧库能否直接打开、行数是否变化
  - `## 双语影响` —— 新增/改动的 key 清单（zh、en 成对；Rust 侧 `Labels` 同）
  - `## 不可破坏的不变量` —— 引用宪法条款号 + 本 feature 的具体含义
- `NEEDS CLARIFICATION:` **最多 3 个**，每个都能独立决策，不许留着不处理就往下走
- spec 里**禁止**出现技术选型（不写 vitest/axios/SQL 语句），技术决策属于 plan

自检：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/speckit/gate.ps1
```

### 第 4 步：评审 spec（闸 G1）

人看三件事：① 四段是否写了真实约束而不是"保持兼容" ② SC 是否可测 ③ 有没有偷偷扩大范围。
通过后在 `specs/NNN-<slug>/checklists/requirements.md` 把待决项勾掉，然后提交：

```
spec(001): capture parsing contract
```

### 第 5 步：写 plan + tasks，然后实现

```powershell
# pi 里依次：
/speckit.plan
/speckit.tasks
/speckit.analyze
/speckit.implement
```

- `plan.md` 必须含 `Constitution Check`，逐条写"证据行"（文件路径或命令），而不是打勾
- `plan.md` 必须含 `## Existing Code Impact`：要改哪些既有文件、为什么不能新增文件、是否复用现有实现
- `tasks.md` 每条任务前加**类型标签**之一：`[契约]` `[门禁]` `[双语]` `[数据]`；`[契约]` 任务永远排在实现任务之前
- 数据类 feature：先写迁移与回滚任务，再写功能任务

改代码时的硬规则：

- **双语**：任何新文案同时加 `dict.zh` 与 `dict.en`（同一提交）；`t()` 是 `table[key] ?? key`，漏了 en 不报错、直接把 key 名显示给用户
- **数据**：不写 `ALTER TABLE` 直到 F003 的 `schema_version` 落地；迁移必须单事务 + 可回滚
- **IPC**：新增命令要同步改 `lib.rs` 的 `generate_handler![]`；字段名靠 `serde(rename_all = "camelCase")`，**不要手写 rename**
- **权限**：加 `capabilities/default.json` 条目要写明"不给会怎样"
- **阈值**：不把 `3 天`、`18 点` 这类数字写死在 `.vue` 里，提到 `src/lib/` 常量并写进 spec

### 第 6 步：过闸（G3/G4）

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/speckit/gate.ps1   # C001-C010
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/speckit/check-i18n.ps1  # C008 单独跑
pnpm exec vue-tsc --noEmit                                                     # make check-web
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

（有 make 的环境用 `make check` / `make speckit-gate` / `make speckit-i18n`。）

`tasks.md` 全部 `[x]` + 上述全绿，才算可合入。**不许为了让闸门过而改闸门或删检查项。**

### 第 7 步：converge 与提交

```powershell
/speckit.converge     # 只追加缺口任务到 tasks.md，不改代码
```

结局二选一：`✅ Converged` 或缺口表（`F1 | missing | HIGH | FR-008`）。有缺口就回第 5 步。

提交粒度：一步一提交，前缀 `spec(NNN):` / `plan(NNN):` / `tasks(NNN):` / `feat(NNN):` / `converge(NNN):` / `fix(NNN):`。

## 闸门 C001–C010

| 代号 | 检查 | 不通过的典型原因 |
|---|---|---|
| C001 | 宪法已填写 | 还是模板占位符 `[PRINCIPLE_1_NAME]` |
| C002 | `spec.md` 存在 | 没跑 `new-feature.ps1` |
| C003 | 四段齐全 | 少了 `## 数据影响` 之类 |
| C004 | 无模板占位符 | 还留着 `[FEATURE NAME]`、`[DATE]` |
| C005 | FR/SC 各 ≥1 | 只写了用户故事 |
| C006 | 待澄清 ≤3 | `NEEDS CLARIFICATION:` 太多 |
| C007 | tasks 四类任务 | 没有 `[契约]`/`[门禁]`/`[双语]`/`[数据]` 标签 |
| C008 | 双语键成对 | zh 有 en 没有，或 `{placeholder}` 不一致 |
| C009 | 需求清单已评审 | `checklists/requirements.md` 还有 `[ ]` |
| C010 | plan 有宪法检查 | `plan.md` 里没有 `Constitution Check` |

退出码非 0 = 有 FAIL。SKIP 表示该阶段尚未开始，不阻塞。

## 反模式（本项目高发）

1. 重排 `src/lib/i18n.ts` 的键顺序 —— 制造巨大 diff，评审无法看
2. 改 `src-tauri` 结构体的 serde 字段名 —— 前端 `invoke` 静默拿到 `undefined`
3. 往 `capabilities/default.json` 加权限"顺手用得上" —— 违反宪法 IV
4. 把 `parse.ts` 的规则复制到 Rust 侧 —— 两份实现必然漂移
5. `schema_version` 落地前写 `ALTER TABLE` —— 无法判断旧库是否已加列
6. 顺手 `cargo fmt` / 重排整个文件 —— 掩盖真实改动
7. 把阈值（3 天、18 点、120 分钟）写死在组件里
8. 为了过闸门而注释掉某一侧 i18n，或删掉检查项

## 当前状态

- 分支 `adopt/spec-kit`；宪法 v1.0.0 已就绪
- `specs/001-parse-contract/`：spec + 需求清单已写，代码未动（等待是否引入 vitest 的决定）
- 待决策：① 是否引入 vitest ② F004 导出格式 ③ 首个 feature 是否按 F001 走
