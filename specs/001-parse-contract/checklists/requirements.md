# Requirements Quality Checklist: 001-parse-contract

**Purpose**: 这份清单审的是 **spec 的质量**，不是测试跑没跑过。`[x]` 表示评审者已确认该项成立。
**Feature**: `specs/001-parse-contract/spec.md`
**Reviewed**: 2026-11-06

## 完整性

- [x] CHK001 四段（兼容边界 / 数据影响 / 双语影响 / 不可破坏的不变量）齐备且写的是本 feature 的具体含义，不是模板原话
- [x] CHK002 三个用户故事各带 P1/P2/P3 优先级、"Why this priority" 与 "Independent Test"
- [x] CHK003 Edge Cases 覆盖空输入、非法令牌、多令牌、跨年、同日、行尾标记、大小写、空白压缩、时钟依赖
- [x] CHK004 FR 覆盖产出物（测试文件）、覆盖范围（七组语义）、时钟注入方式、命令入口、依赖上限
- [x] CHK005 范围外内容显式声明：Rust 侧语义测试属 F002、`now` 参数注入属后续 feature

## 可验证性

- [x] CHK006 每条 FR 都能用"看文件 / 跑命令 / 数用例"判定，而不是"感觉清楚"
- [x] CHK007 每条 SC 带可测阈值（≥24 用例、≥90% 覆盖率、≤1 个依赖、0 字节产物体积变化、≤10s/≤3s 耗时）
- [x] CHK008 SC-003 给出了具体的故障注入手法（删 `parse.ts:71` 的 `if (delta === 0) delta = 7;`），可被人复现
- [x] CHK009 兼容边界写成可核对的事实（导出签名、`target` 三值域、`dueAt` 字符串、`CaptureBar.vue`/`App.vue` 的依赖点）

## 无歧义

- [x] CHK010 "七组语义"逐条命名，与 Edge Cases 一一对应，不存在"其他情况"
- [x] CHK011 术语一致：`target` 只有 `"today" | "inbox" | "YYYY-MM-DD"` 三种取值，全文无第四种叫法
- [x] CHK012 "不改 parse.ts" 在 FR-007、兼容边界、不变量 I 三处一致出现，不存在互相削弱
- [x] CHK013 明确区分 "记录现状（characterization）" 与 "修正缺陷"，并规定缺陷去哪（`notes.md` + 后续 feature）

## 可实施性

- [x] CHK014 未把某框架的 API 写成需求（FR-004 只禁止断言内部实现，未强绑 `expect` 语法）
- [x] CHK015 依赖约束与宪法 IV/技术边界一致（≤1 个 devDependency、无 `postinstall`、无网络/遥测）
- [x] CHK016 回滚路径可执行（删测试文件 + 撤 package.json 改动 + `pnpm install`）

## 待人工决策（未勾选 = 尚未评审通过）

- [ ] CHK017 是否批准新增 1 个测试框架 `devDependency`（vitest）；若否决，FR-010 与 SC-005 需改
- [ ] CHK018 是否接受把 `@2-30` / `@4-31` 的"令牌残留标题"行为**原样固化**到契约里（现状如此，修它属于另一个 feature）
- [ ] CHK019 是否需要把 `pnpm test` 并入 `make check` / CI（当前 spec 刻意不并入，以免改 CI 契约）

## 已知空白

- [x] CHK020 跨时区、DST、非 CST 环境不在本 feature 覆盖范围，且已在 Assumptions 写明
- [x] CHK021 覆盖率工具本身未选型（`@vitest/coverage-v8` 是否算第二个依赖），留到 plan 阶段决定
