# Tasks — 011-flow-polish

**SPEC**: `specs/011-flow-polish/spec.md` · **状态**：7/12 已勾

任务行：复选框 + `T001`（三位序号）+ 可选 `[US1]` + 必填类型标签 + 描述（含文件路径）

## US4 — 归类内联新建（已完成）

- [x] T001 [双语] `src/lib/i18n.ts` 补 `home.openProject` 与 `nodes.overview*` 六键（zh/en 成对）
- [x] T002 [门禁] `src/components/ClassSheet.vue` 项目/标签列表末尾各加虚线 `+`，点击展开内联输入框（回车建、Esc 取消），去掉原固定输入行
- [x] T003 [门禁] `pnpm exec vue-tsc --noEmit` 0 error；`check-i18n.ps1` PASS

## US3 — 标签顶掉浮层、关闭可读（已完成）

- [x] T004 `src/App.vue` 新增 `closeAllSheets()`，`switchTab()` 先调用它
- [x] T005 [双语] `StatsSheet.vue` / `ProjectSheet.vue` / `HistorySheet.vue` / `RecurringSheet.vue` 右上角关闭控件改为「图标 + 关闭」文字

## US1 — 首页分组头进项目（已完成）

- [x] T006 `src/App.vue`：`HomeSection` 增加 `projectId`，分组头末尾加箭头按钮调用 `openProjects(id)`
- [x] T007 `src/components/ProjectSheet.vue`：新增 `focus` prop，`onMounted` 优先选中它

## US2 — 项目里的任务与首页同一行（已完成）

- [x] T008 [契约] `ProjectSheet.vue` 两处任务列表改用 `TaskRow`，删除自绘行与任务级右击菜单（`MenuKind` 收窄为 `project | node`）
- [x] T009 `ProjectSheet.vue` 监听 `store.view` 自动重读 `api.listProjectTasks`

## US5 — 总览可钻取、三种视图（已完成）

- [x] T010 `ProjectSheet.vue` 新增 `overviewMode`、`stepRows`、`detailStep`、`toggleDetail`，鱼骨可点、新增进度条与清单视图、明细区复用 `TaskRow`

## 待人工验收

- [x] T013 [双语] 分组头去掉跳转箭头，保留名字跳转 + 悬停下划线；新增 `home.expand`/`home.collapse`，删除 `home.toProject`
- [x] T014 [契约] 新增 `PanelShell.vue`，复盘/记录/项目/周期四个面板统一标题区与关闭按钮
- [x] T015 [门禁] 总览去除重复明细（清单视图不再叠加明细区），截图 `verify/screens/panel-*.png`
- [ ] T011 [门禁] 真机核对：分组头箭头跳转、项目面板右击菜单可用、标签切页、归类 `+`、总览三视图与明细
- [ ] T012 [门禁] 截图存档到 `specs/011-flow-polish/verify/screens/`
