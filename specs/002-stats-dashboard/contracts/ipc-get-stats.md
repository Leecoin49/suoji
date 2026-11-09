# Contract: IPC `get_stats`

**Feature**: `specs/002-stats-dashboard/spec.md` | **Plan**: [../plan.md](../plan.md) | **Data model**: [../data-model.md](../data-model.md)

只读统计查询。这是本 feature **唯一**新增的 IPC 命令（总数 16 → 17）。

## 1. 注册三处（缺一处即静默失效）

| 位置 | 内容 |
|---|---|
| `src-tauri/src/commands.rs` | `#[tauri::command] pub fn get_stats(db: State<Db>, start: String, end: String) -> Result<StatsRaw, String>` |
| `src-tauri/src/lib.rs:108` | `generate_handler![ ... , get_stats]`（追加到既有 16 条之后，不重排） |
| `src/lib/api.ts:39` | `getStats: (start: string, end: string) => invoke<StatsRaw>("get_stats", { start, end })` |

前端**只**通过 `api.getStats` 调用（宪法 IV）；不允许组件里直接 `invoke`。

## 2. 请求

| 参数 | 类型 | 说明 |
|---|---|---|
| `start` | `string` | `YYYY-MM-DD`，区间首日（含） |
| `end` | `string` | `YYYY-MM-DD`，区间末日（含）；大于 app 本地今天时被裁到今天 |

JS 侧键名：`{ start, end }`（单词，无 camelCase 转换风险）。

## 3. 响应（`StatsRaw`，全字段 camelCase）

```json
{
  "span":     { "start": "2026-10-08", "end": "2026-11-06", "days": 30 },
  "prev":     { "start": "2026-09-08", "end": "2026-10-07", "days": 30 },
  "done": [
    { "id": "3f2a…", "title": "交周报", "note": null, "doneAt": "2026-11-06T09:41:07" },
    { "id": "9b1c…", "title": "补报销单", "note": "发票在抽屉", "doneAt": "2026-11-05T18:02:55" }
  ],
  "prevDone": 17,
  "rolled": [
    { "id": "aa01…", "title": "写季度总结", "rollCount": 7, "lastRolledAt": "2026-11-05" }
  ],
  "backlog": 23,
  "undated": 0,
  "clamped": false
}
```

字段级约束：

| 字段 | 约束 |
|---|---|
| `span.days` | `= end − start + 1`，恒 ≥ 1 |
| `span.end` | `≤` app 本地今天（`Local::now()` 的日期） |
| `prev` | `= [start − days, start − 1]`，`prev.days === span.days` |
| `done[]` | 只含区间内 `done=1 && deleted=0 && done_at IS NOT NULL`；按 `doneAt DESC, id ASC` 排序；`doneAt` 保持库内原样（无时区后缀） |
| `done[].note` | 可为 `null` |
| `prevDone` | 上一段条数，只回计数 |
| `rolled[]` | 长度 ≤ 5；`done=0 && deleted=0 && roll_count>0 && last_rolled_at ∈ [start, end]`；排序 `rollCount DESC, lastRolledAt DESC, createdAt ASC, id ASC` |
| `rolled[].rollCount` | **累计**值（可能含区间外历史），UI 必须显示「累计」字样 |
| `rolled[].lastRolledAt` | 纯日期 `YYYY-MM-DD`（不是时刻） |
| `backlog` | `done=0 && deleted=0` 的当前条数（实时，非历史快照） |
| `undated` | `done=1 && deleted=0 && done_at IS NULL`，**全库全时段**，不受区间影响 |
| `clamped` | 请求 `end > 今天` 时为 `true` |

## 4. 错误

| 情形 | 返回 |
|---|---|
| `start`/`end` 不是合法 `YYYY-MM-DD` | `Err("stats: invalid range")` |
| `start > end` | `Err("stats: invalid range")` |
| 锁毒化 / SQLite 错误 | `Err(e.to_string())`（与既有命令一致的透传风格） |

前端收到 `Err` 时**不弹窗**，面板内显示 `stats.error`（研究 R8）。

## 5. 不变量（评审时按此逐条核 diff）

1. **零写入**：`get_stats` 的函数体里只允许 `SELECT`。出现 `INSERT` / `UPDATE` / `DELETE` / `ALTER` / `CREATE` 即违反。
2. **只用 5 条语句**：明细 1 条、上一段计数 1 条、推后榜 1 条、摊子计数 1 条、未标注计数 1 条。多于 5 条说明把聚合塞进了后端（研究 R4）。
3. **不开事务**（研究 R5）：不得出现 `transaction(` / `commit(`。
4. **锁作用域**：`db.0.lock()` 之后不再调用任何 `tauri::` 窗口/系统 API（宪法锁纪律）；函数在锁作用域结束时返回。
5. **不重排既有命令**：`generate_handler![]` 只在末尾追加。
6. **不加权限**：`src-tauri/capabilities/default.json` 不改（本命令不触达任何 plugin 权限）。
7. **不改既有命令行为**：`list_done_history`（`src-tauri/src/commands.rs:147`）的签名与 `since = today − days` 语义冻结（spec 兼容边界）。

## 6. 调用方契约（`StatsSheet.vue`）

- 只在面板可见且区间合法时调用；换区间才重新调用（同一区间内切粒度是纯前端计算）。
- 不持久化 `start`/`end`，不写入 `meta`、不写 `localStorage`（FR-002）。
- 快速连点预设时，只认最后一次请求的结果（用递增序号丢弃过期响应），不得让旧响应覆盖新区间。
