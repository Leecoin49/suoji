# 007 验收记录

日期：2026-11-10　构建：`pnpm tauri dev`（debug）+ `pnpm build`

## 自动化

| 项 | 结果 |
|---|---|
| `pnpm exec vue-tsc --noEmit` | 0 error |
| `pnpm build` | 1618 模块 / JS 288.03 kB / CSS 37.93 kB |
| `cargo fmt --check` | 无差异 |
| `cargo clippy --all-targets -- -D warnings` | 0 warning |
| `scripts/speckit/gate.ps1` | PASS 10 / FAIL 0 / SKIP 0 |
| `scripts/speckit/check-i18n.ps1` | PASS `zh=286 en=286` |
| 依赖 | `git diff -- package.json pnpm-lock.yaml src-tauri/Cargo.lock` 空 |

数据库：`meta.schema_version` 2 → 3；`tasks` 新增可空列 `node_id`；`indexes: idx_tasks_node`；
行数不变（迁移脚本 `db.rs::migrate`，备份 `suoji.db.pre-005` 机制沿用）。

## 界面（真机截图）

- `screens/home-grouped.png`：首页按「项目 · 步骤」分组，组头显示件数，可折叠。
- `screens/tree.png`：项目面板打开、空库时的引导态。

## 待人工确认（本轮未能干净截图）

用户正在同一台机器上操作（截图工具与聊天窗口在前台），以下两项请自行点一遍：

1. 项目面板「树形」视图：项目 → 步骤 → 任务三层是否能改名（点文字）、唤出右键菜单（右击）。
2. 切到「总览」：鱼骨图脊背 + 交替上下刺 + 头部 `3/5` 完成度是否清晰。

## 已知限制

- 首页分组只在「今天」页生效；收件箱仍是扁平列表。
- 折叠状态只存内存，切换日期后回到默认展开。
- 任务只能挂一个步骤；挂步骤时若项目不同，会顺手改项目（保持三层一致）。
