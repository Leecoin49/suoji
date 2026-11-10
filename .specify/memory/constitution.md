# 琐记 Constitution

琐记是一个本地优先的桌面应用：一句话录入，今天的事自动排好，没做完的自动顺延。
本文件由既有代码与文档「考古」得出（见末节），写的是**已经为真的规则**，不是愿望清单。
任何与代码冲突的条款，只有两种处理：改代码，或改宪法并在 PR 里说明。不允许两边长期不一致。

## Core Principles

### I. 一件事原则（NON-NEGOTIABLE）

一次交互只推进一件事；功能的价值必须能用一句话说完。

- 录入口径唯一：一行文本 + Enter，唯一入口是 `src/lib/parse.ts:97 parseCapture`。
- 不引入批量操作、拖拽排序、看板/甘特视图、任意深度的子任务树、多选。
- 层级只有固定三层：**项目 → 步骤 → 任务**（v1.1.0 起）。任务至多挂在一个步骤上，任务不能挂任务，步骤不能挂步骤。这是「一条线」的展开，不是无限嵌套。
- 首页允许按「项目 / 步骤」分组折叠；折叠是纯视图状态，不落盘、不改数据。
- 想做「多选/批量」，必须先改本条，而不是在功能 PR 里顺手加。
- 产品定位的原文表达是 `README.zh-CN.md:3`：「记小事要快，一天自己会顺」。

### II. 用户数据是唯一副本（NON-NEGOTIABLE）

`%APPDATA%\com.tool.suoji\suoji.db` 是用户全部数据的唯一副本（`README.zh-CN.md:85,190`），没有任何服务端兜底。

- 表结构只增不改：`src-tauri/src/db.rs:8,29,34` 一律 `CREATE TABLE IF NOT EXISTS`；加列必须带存在性判断。
- 迁移绝不删除或改写用户行；破坏性操作只能由用户显式确认后执行。
- 目前没有导入导出（`CONTRIBUTING.zh-CN.md:92-96` 已把它写成约束），因此任何丢数据的缺陷都是最高优先级。
- 禁止静默「整理/去重/清理/归档」；用户没点过的删除不算删除。
- 备份、导出、schema 版本化这类工作，优先级高于任何新功能。

### III. 天生本地，最小外联

- 运行时零账号、零遥测、零同步，默认不联网。
- 唯一的网络行为是检查更新（`src-tauri/src/lib.rs:19` 的 updater）。
- 插件白名单就是系统与网络边界：single-instance（`lib.rs:14`）、autostart（:17）、notification（:18）、updater（:19）、process（:20）、global-shortcut（:21）。新增插件必须写清用途与替代方案。
- 数据不出机器：不上传、不做「匿名统计」、不接第三方 SDK 或字体/CDN。

### IV. IPC 是最小攻击面

- 命令集固定在 `src-tauri/src/lib.rs:108` 的 `generate_handler![...]`（16 条）。新增命令必须同时在 `src/lib/api.ts:39` 与 `src-tauri/src/model.rs` 落地，前后端契约一处都不能少。
- 序列化统一 `#[serde(rename_all = "camelCase")]`（`model.rs:5,49,67`）；改字段名等同于改契约。
- 权限只经 `src-tauri/capabilities/default.json`（当前 15 项）：只增不减，每次新增都要在 PR 里写明用途；不得用 `core:default` 兜底掩盖真实需求。
- 前端只允许经 `src/lib/api.ts` 调用后端，组件内禁止直接 `invoke`。
- 不新增本地 HTTP 服务、不开端口、不 eval 远端脚本。

### V. 双语是结构，不是附加

- 文案表 `src/lib/i18n.ts:10`（`zh` 在 :11，`en` 在 :149），类型 `MessageKey = keyof (typeof dict)["zh"]`（:290），取值 `t()`（:366）。
  `t()` 内部是 `table[key] ?? key`，**缺 en 键不会报错，会直接把 key 名显示给用户**。
- Rust 侧同样成对：`src-tauri/src/i18n.rs:4 Labels` + `:43 labels(locale)` + `:52 fill()`，覆盖托盘与通知。
- 应用内帮助 `helpContent`（`src/lib/i18n.ts:294`，`zh` 在 :295、`en` 在 :322）三块内容必须同步。
- 只存在于一种语言的字符串就是缺陷（`CONTRIBUTING.zh-CN.md:86-91`）。
- 中文是主语，英文是同等公民，不是机翻占位。

## 技术边界与不变量

**栈冻结**（改动需单独立 feature 并说明理由）：Vue 3 + TS + Vite 7 + Tailwind 4 + Pinia 3 + dayjs；Tauri 2 + rusqlite(bundled) + chrono + uuid。`package.json` 与 `src-tauri/Cargo.toml` 是唯一事实源。

**锁纪律**：`Db(Mutex<Connection>)` 必须在做 IO 前释放。读状态在 Phase 1 持锁（`src-tauri/src/schedule.rs:48`），弹窗与通知在锁外（:120）。持锁期间不得触碰窗口或系统 API。

**单实例与生命周期**：单实例由 `tauri_plugin_single_instance`（`lib.rs:14`）保证；关窗不退出、收进托盘（`lib.rs:104` `api.prevent_close()`）。

**提醒语义**：`NOTICE_WINDOW_MIN = 120`（`schedule.rs:36`）。过了窗口不补发；零点顺延每天只执行一次，由 `meta.last_rollover` 兜住（`schedule.rs:53-56`）。

**版本号三处同步**：`package.json`、`src-tauri/Cargo.toml:3`、`src-tauri/tauri.conf.json:4`。缺一处，发布产物就是错的。

**发布形态**：Windows 只出 NSIS（MSI 编码不了中文产品名「琐记」，`tauri.conf.json:3`）；签名私钥只经 `TAURI_SIGNING_PRIVATE_KEY` 环境变量，绝不入库（`.gitignore` 已挡 `.keys/`、`*.key`）。release profile 为 `panic="abort" + lto + codegen-units=1 + opt-level="s"`（`Cargo.toml:31-34`）。

## 开发、评审与发布

**门禁**：`make check` = `vue-tsc --noEmit` + `cargo fmt --check` + `cargo clippy -D warnings`（`Makefile:41-48`）。CI 分两作业：web 在 `ubuntu-latest`（`ci.yml:18-19`），rust 在 `windows-latest`（:40-41）——**本地必须以 Windows 通过为准**。

**测试现状**：仓库里没有测试框架（`src-tauri/src/*.rs` 无 `#[test]`，`package.json` 无测试依赖）。引入测试属独立 feature：先 spec 再实现，不允许在功能 PR 里顺手加。测试落地前，每个 PR 必须写明验证方式与 UI 截图（`CONTRIBUTING.zh-CN.md:98-101`）。

**文档三处同步**：`README.md`、`README.zh-CN.md`、应用内帮助（`src/lib/i18n.ts:294`）。

**提交信息**：英文祈使句，短标题 ≤ 72 字符；PR 描述必须回答「怎么验证的」。

**规格驱动**：规格 → 方案 → 任务 → 实现 → 收口，五道闸与命令见 `AGENTS.md`；机器校验用 `make gate`（等价 `scripts/speckit/gate.ps1`）。

## Governance

- 本宪法高于其他实践与约定；冲突时以本文件为准，并同步修订被冲突的文件。
- 修订必须：升语义化版本号、写清理由、给出迁移说明；`Version / Ratified / Last Amended` 三个字段同步更新。
- 每个 feature 的 `plan.md` 必须有 `Constitution Check`，逐条给证据行，而不是打勾了事；确实违反某条的，在 `Complexity Tracking` 里写清为什么无法避免。
- 严重违反（改数据结构、破坏双语成对、无理由放宽权限）直接拒收，不进入 review 讨论。
- 优先级排序固定：数据安全 > 可验证性 > 新功能 > 打磨。

**Version**: 1.1.0 | **Ratified**: 2026-11-06 | **Last Amended**: 2026-11-10

## 修订记录

- **1.1.0**（2026-11-10）：原则 I 由「禁止子任务树」放宽为「允许固定三层：项目 → 步骤 → 任务」。理由：006 的步骤链与 005 的项目各自成立，但用户需要在一个项目里看见「哪个步骤下有哪些事」，退化成两套并列视图反而增加心智负担；三层固定、不可再嵌套，仍守住「一件事原则」。迁移：表结构只加 `tasks.node_id` 一列（可空，带存在性判断），旧数据的任务 `node_id` 为空，表现为「项目下未挂步骤」，无行被改写或删除。
- **1.0.0**（2026-11-06）：首版，由既有代码考古得出。

## 考古来源

| 条款 | 证据位置 |
| --- | --- |
| I 一件事 | `src/lib/parse.ts:97`、`README.zh-CN.md:3` |
| II 数据唯一副本 | `src-tauri/src/db.rs:8,29,34`、`README.zh-CN.md:85,190`、`CONTRIBUTING.zh-CN.md:92-96` |
| III 本地最小外联 | `src-tauri/src/lib.rs:14-21`、`src-tauri/tauri.conf.json` |
| IV IPC 最小面 | `src-tauri/src/lib.rs:108`、`src/lib/api.ts:39`、`src-tauri/src/model.rs:5,49,67`、`src-tauri/capabilities/default.json` |
| V 双语成对 | `src/lib/i18n.ts:10,149,290,294,366`、`src-tauri/src/i18n.rs:4,43,52`、`CONTRIBUTING.zh-CN.md:86-91` |
| 技术边界 | `src-tauri/src/schedule.rs:36,48,120`、`src-tauri/Cargo.toml:3,31-34`、`src-tauri/tauri.conf.json:3,4` |
| 门禁 | `Makefile:41-48`、`.github/workflows/ci.yml:18-19,40-41`、`CONTRIBUTING.zh-CN.md:40-47` |
