# Data Model: 005 项目与标签

## 1. 存储（SQLite）

```sql
-- meta 里新增一个键，值形如 '1'
-- key = 'schema_version'

CREATE TABLE IF NOT EXISTS projects (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  archived   INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_projects_name ON projects(lower(trim(name)));

CREATE TABLE IF NOT EXISTS tags (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_tags_name ON tags(lower(trim(name)));

CREATE TABLE IF NOT EXISTS task_tags (
  task_id TEXT NOT NULL,
  tag_id  TEXT NOT NULL,
  PRIMARY KEY (task_id, tag_id)
);

-- tasks 追加一列（先 PRAGMA table_info 判断，再 ALTER）
ALTER TABLE tasks ADD COLUMN project_id TEXT;
```

**不改的东西**：既有的 `tasks` 15 列、`meta`、`day_notes` 的行与列类型；`idx_tasks_day` / `idx_tasks_done` 不动。

**迁移规则**：`schema_version` 缺失视为 `0`；`0 → 1` 在一个事务里执行「建表 → 补列（若缺） → 写版本号」。已是 `1` 时不做任何事（幂等）。

## 2. 领域对象

| 对象 | 字段 | 不变量 |
|---|---|---|
| Project | `id`、`name`（1–20，裁首尾空格）、`archived`、`createdAt`、`updatedAt` | P-1 名称忽略大小写唯一；P-2 单层，无 `parentId`；P-3 归档不删除 |
| Tag | `id`、`name`（1–16，裁首尾空格）、`createdAt` | T-1 名称忽略大小写唯一；T-2 无层级；T-3 可删除 |
| Task 扩展 | `projectId: string \| null`、`tagIds: string[]` | A-1 最多一个项目；A-2 最多 10 个标签；A-3 失效引用（项目/标签被删）读出来按 `null`/丢弃处理 |
| DoneEntry 扩展 | `projectId: string \| null`、`tagIds: string[]` | D-1 与 `tasks` 现势一致（统计按当前归属，不存历史快照）；D-2 缺省为空，不伪造 |
| ClassRow（派生） | `key`（项目 id / 标签 id / `__none__`）、`name`、`count`、`undated`、`share` | C-1 `count` 只含有完成时刻的件；C-2 「未分类」恒存在；C-3 多标签各计一次；C-4 `share = count / 区间有完成时刻的件数`，分母为 0 时 `share = 0`（不产生 NaN） |

## 3. 派生规则（全部在前端 `src/lib/classes.ts`）

```ts
classRowsOf(entries: DoneEntry[], classKind: "project" | "tag", dict): ClassRow[]
```

- 输入是 `get_stats` 返回的区间明细；不做额外查询。
- 只有 `classKind === "project"` 时产出 `__none__`（未分类）行；标签维度不产出「无标签」行。
- 排序：`count` 降序 → `name` 本地化比较升序 → `key` 升序（完全确定）。
- `undated` 不参与排序权重，只作为行上的小字。
- 归档项目：`count > 0` 时保留；`count === 0` 时不出行。

## 4. 迁移状态机

```
version 0 --迁移成功--> version 1
   |                        |
   |--迁移失败--> 回滚，version 保持 0，库内容与迁移前逐行一致
                            |
                    已有 projects/tags/task_tags 与 tasks.project_id
```

## 5. 与 spec 的 FR 对应

| FR | 落点 |
|---|---|
| FR-001…FR-003 项目增改归档 | `save_project` + `ClassSheet` 的项目区 |
| FR-004 任务归属 | `set_task_project` + `TaskRow` 筹码 |
| FR-005 未分类恒显 | `classRowsOf` 的 `__none__` 行 |
| FR-006…FR-008 标签增删与复用 | `save_tag` / `set_task_tags` / `delete_tag` |
| FR-009 行内显示 | `TaskRow.vue` 筹码（>3 折叠） |
| FR-010…FR-011 分类卡与下钻 | `StatsSheet.vue` 分类卡 + `classFilter` |
| FR-012 月/季/年预设 | `StatsSheet.vue` 的 `pickPreset` 扩展 |
| FR-013/FR-014 计数口径 | `classRowsOf` + 行内 `undated` 小字 |
| FR-015 归档项目在统计里保留 | `classRowsOf` 的归档规则 |
| FR-016 空态出口 | 分类卡空态按钮（去建项目 / 去归类） |
| FR-017 变更即时生效 | `load()` 每次重算，不缓存 |
| FR-018 只读 | 分类卡只读 `raw.done` 与 `list_classes`（后者只读） |
