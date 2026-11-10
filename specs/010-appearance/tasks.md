# Tasks — 010-appearance

任务行：复选框 + `T001`（三位序号，按执行顺序递增）+ 可选 `[P]` + 可选 `[US1]` + 类型标签 + 描述（含文件路径）

- [x] T001 [US1] [契约] `src/style.css`：`ink-soft` `#6e655a → #5c5348`、`ink-faint` `#a69c8f → #8a7f71`、`line` `#e8e1d5 → #e0d7c7`
- [x] T002 [US1] [数据] `src-tauri/src/model.rs`：`Settings.font_scale` / `Settings.font_family`（`serde(default)` + 默认 `1` / `sans`）
- [x] T003 [US1] [数据] `src-tauri/src/db.rs`：`settings()` 读 `meta.font_scale` / `meta.font_family`
- [x] T004 [US1] [契约] `src-tauri/src/commands.rs`：`save_settings` 写入两个新键
- [x] T005 [US1] [契约] `src/lib/api.ts`：`FontScale` / `FontFamily` 类型与 `Settings` 两字段
- [x] T006 [US1] `src/lib/appearance.ts`：`FONT_STACKS` / `FONT_SCALES` / `fontScaleOf` / `fontFamilyOf` / `applyAppearance`（根节点 `--font-sans` + `zoom`）
- [x] T007 [US1] `src/stores/day.ts`：`loadSettings` / `saveSettings` 后应用外观；默认值补齐
- [x] T008 [双语] `src/lib/i18n.ts`：`settings.appearance` 等 11 个键，zh/en 成对
- [x] T009 [US1] `src/components/SettingsSheet.vue`：「外观」一节（字号四档、字体三档、即时预览、保存才记住）
- [x] T010 [门禁] `pnpm exec vue-tsc --noEmit` + `cargo check` + `cargo fmt` + `cargo clippy -D warnings`
- [x] T011 [门禁] `scripts/speckit/check-i18n.ps1` 与 `gate.ps1`
- [x] T012 [双语] `README.md` / `README.zh-CN.md` 同步外观一节
- [x] T013 [US1] `src/App.vue`：日期下方进度线（`progress` computed + `home.progress`）
- [x] T014 [US1] `src/App.vue`：分组内任务缩进 + 竖线；“一直没动”加图标与条数徽标
- [x] T015 [US1] `src/components/TaskRow.vue`：行距 `py-2 → py-2.5`、胶囊 `10.5px → 11px`、完成行 `opacity-45`
