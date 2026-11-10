# Feature 010 — 看得清：对比度、字号与字体

**Feature**: 010-appearance
**Status**: implemented
**Created**: 2026-11-10

User said (verbatim): 「UI的字体颜色太接近了，看起来比较费劲，同时也无法调整字体大小，以及选择字体。」

## 用户故事（P1）

**As a** 一天要盯着这个窗口好几个小时的人
**I want** 一眼能分出哪行是标题、哪行是注释，并且能按自己的眼睛调大字号、换一种看着舒服的字体
**So that** 不用凑近屏幕，也不用为了看清而放弃这套排版

**Why this priority**: 颜色层次只有三档且彼此太近（`ink-faint` 在纸色上对比度约 2.4:1），字号又全是写死的 px，用户没有任何调节手段。

## 功能需求

- **FR-001** 三级文字色必须拉开对比：正文 `ink`、次要 `ink-soft`、辅助 `ink-faint` 在同底色上的对比度分别不低于 12:1、6:1、3.5:1。
- **FR-002** 分隔线 `line` 加深到在纸色上可辨认（不再与底色糊在一起）。
- **FR-003** 设置里有「外观」一节，含字号与字体两项。
- **FR-004** 字号四档：小 / 标准 / 大 / 特大（0.9 / 1.0 / 1.1 / 1.25）。
- **FR-005** 字体三档：黑体（默认无衬线）/ 宋体（衬线）/ 楷体。
- **FR-006** 选择后**立刻**看到效果；点「保存」才记住；不保存关掉则回到已保存的值。
- **FR-007** 选择写入数据库，重启后仍是上次的选择。
- **FR-008** 缩放必须是整体缩放（含排布），不能只放大字而让文字互相压住。

## 兼容边界

- 既有 38 条 IPC 不变；`Settings` 只新增两个带默认值的字段（`fontScale`、`fontFamily`），旧库/旧 JSON 缺这两个键时回落 `1` 与 `sans`。
- `capabilities/default.json` 15 项不变（用文档根节点的 `zoom` 与 CSS 变量实现，不申请新权限）。
- 颜色 token 名称不变，只调数值。

## 数据影响

- 无 DDL、无 `schema_version` 变更。两个新键存进既有的 `meta` 表（`font_scale`、`font_family`），缺省即默认值。

## 双语影响

新增 key（zh/en 成对）：`settings.appearance`、`settings.fontSize`、`settings.fontFamily`、`settings.scaleSmall/Default/Large/Huge`、`settings.fontSans/Serif/Kai`、`settings.fontHint`。

## 不可破坏的不变量

- 宪法 II：只在 `meta` 增键，不动任何表结构。
- 宪法 IV：不新增 IPC、不新增权限。
- 宪法 V：两份 dict 成对，`check-i18n` 必须 PASS。
- 宪法 I：外观设置不引入新的分类/层级。
