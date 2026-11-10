# 008 验收记录

日期：2026-11-10　构建：`pnpm tauri dev`（debug）+ `pnpm build`

## 自动化

| 项 | 结果 |
|---|---|
| `cargo test`（原生 `#[cfg(test)]`，未引入测试框架） | **9 passed** |
| ├ `fires_on`：daily / weekly（周一三五）/ monthly（31 号夹月末、30 号也夹） | 4 条 |
| ├ `last_day_of_month`：2 月 28/29、12 月 31、4 月 30 | 1 条 |
| └ `materialize`：同日不重复生成、周规则只在自己那天命中、暂停不生成、昨天没做的那班被过期且 `roll_count` 不变 | 4 条 |
| `pnpm exec vue-tsc --noEmit` | 0 error |
| `pnpm build` | 1618 模块 / JS 300.30 kB / CSS 38.51 kB |
| `cargo fmt --check` / `cargo clippy --all-targets -D warnings` | 无差异 / 0 warning |
| `gate.ps1` | PASS 10 / FAIL 0 / SKIP 0（C007 24/24） |
| `check-i18n.ps1` | PASS `zh=314 en=314` |

## 数据库（真库迁移后实测）

- `meta.schema_version` 3 → **4**。
- 新表 `recurrences` 创建成功；`tasks` 19 列，`recurrence_id`、`occurrence_date` 就位。
- 唯一索引 `ux_tasks_occurrence` 存在（`recurrence_id` 非空的部分索引）。
- 迁移改成**每次启动幂等重跑**：本次曾因版本号比较写错导致只写了 `schema_version` 而没建表，
  改成「所有语句本身幂等 → 每次启动都重放一遍」后，坏状态自动修复。备份文件 `suoji.db.pre-005` 机制不变。

## 待人工确认

1. 录入框左侧「周期」→ 新建一条「每天」→ 今天列表立刻出现该条，行上带「每天」小标。
2. 打勾完成 → 撤销勾选 → 仍然只有一条（不会重复生成）。
3. 把系统日期改到明天（或等明天）：旧的那班消失、新的那班出现；复盘总数里两天的完成各算一件。

## 已知限制

- 规则只支持三档周期，没有「每两周」「工作日」这类组合；需要时用「每周」勾一至五。
- 修改规则不会重写已经生成的历史行（过去的班保持原样）。
- 过期（`bucket='expired'`）的班不进任何列表；目前不提供「翻看错过记录」的界面。
