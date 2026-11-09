/**
 * 005 的纯规则自检（T018）。
 *
 * 跑法（与 003/004 的 verify 脚本同一套）：
 *   pnpm exec tsc -p tsconfig.classverify.json          # 生成 .pi/tmp/classbuild/classes.js
 *   $env:CLASS_BUNDLE = ".pi\tmp\classbuild\classes.js"
 *   node specs\005-project-tags\verify\class_check.mjs
 *
 * 断言的是 spec 里「按类计数」的口径：
 *   1. 项目维度：每一行 count 之和 === 明细条数（未分类行恒存在）
 *   2. 标签维度：多标签任务在每个标签下各记一次，行计数之和 ≥ 明细条数
 *   3. 占比之和 ≈ 1（项目维度恒为 1），且没有 NaN
 *   4. 下钻（entriesOfClass）拿到的条数 === 该行 count
 *   5. 排序：count 降序 → 未分类垫底
 */
import assert from "node:assert/strict";

const bundle = process.env.CLASS_BUNDLE;
if (!bundle) {
  console.error("CLASS_BUNDLE 未设置：先 tsc 编译 src/lib/classes.ts");
  process.exit(2);
}

const mod = await import(new URL(bundle, `file://${process.cwd().replace(/\\/g, "/")}/`).href);
const { classRowsOf, entriesOfClass, classShareOf, NO_CLASS } = mod;

const projects = [
  { id: "p1", name: "重点项目", archived: false },
  { id: "p2", name: "部门内务", archived: false },
  { id: "p3", name: "老项目", archived: true },
];
const tags = [
  { id: "t1", name: "写稿" },
  { id: "t2", name: "约稿" },
];
const entries = [
  { id: "a", projectId: "p1", tagIds: ["t1"], doneAt: "2026-11-01T09:00:00" },
  { id: "b", projectId: "p1", tagIds: ["t1", "t2"], doneAt: "2026-11-02T09:00:00" },
  { id: "c", projectId: "p1", tagIds: [], doneAt: "2026-11-03T09:00:00" },
  { id: "d", projectId: "p2", tagIds: ["t1"], doneAt: "2026-11-04T09:00:00" },
  { id: "e", projectId: null, tagIds: ["t2"], doneAt: "2026-11-05T09:00:00" },
  { id: "f", projectId: "p3", tagIds: [], doneAt: "2026-11-06T09:00:00" },
];

let pass = 0;
const ok = (name, fn) => {
  try {
    fn();
    pass += 1;
  } catch (e) {
    console.error(`FAIL ${name}\n  ${e.message}`);
    process.exitCode = 1;
  }
};

const pRows = classRowsOf(entries, "project", projects, tags);
const tRows = classRowsOf(entries, "tag", projects, tags);

ok("项目维度行数 = 项目数 + 未分类", () => assert.equal(pRows.length, projects.length + 1));
ok("项目维度计数和 = 明细条数", () => assert.equal(pRows.reduce((s, r) => s + r.count, 0), entries.length));
ok("项目维度每组下钻条数 = count", () => {
  for (const r of pRows) assert.equal(entriesOfClass(entries, "project", r.key).length, r.count, r.name);
});
ok("未分类行恒存在且垫底", () => {
  assert.equal(pRows[pRows.length - 1].key, NO_CLASS);
  assert.equal(pRows[pRows.length - 1].count, 1);
});
ok("项目维度占比和 ≈ 1", () => {
  const sum = pRows.reduce((s, r) => s + r.share, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9, `sum=${sum}`);
});
ok("标签维度多标签各记一次", () => {
  assert.equal(tRows.reduce((s, r) => s + r.count, 0), 5); // t1×3 + t2×2
  const noTag = tRows.find((r) => r.key === NO_CLASS);
  assert.equal(noTag, undefined, "标签维度不应出现「无标签」行");
});
ok("标签维度下钻条数 = count", () => {
  for (const r of tRows) assert.equal(entriesOfClass(entries, "tag", r.key).length, r.count, r.name);
});
ok("归档项目仍然计入（只是归档）", () => {
  assert.equal(pRows.find((r) => r.key === "p3").count, 1);
});
ok("排序：count 降序", () => {
  const counts = pRows.slice(0, -1).map((r) => r.count);
  for (let i = 1; i < counts.length; i += 1) assert.ok(counts[i - 1] >= counts[i], counts.join(","));
});
ok("占比没有 NaN / Infinity", () => {
  for (const r of [...pRows, ...tRows]) assert.ok(Number.isFinite(r.share), r.name);
});
ok("classShareOf 单值自洽", () => {
  assert.equal(classShareOf(3, 6), 0.5);
  assert.equal(classShareOf(0, 0), 0);
});

// 未知项目 id（老数据/手改库）不能凭空消失：并入未分类，且下钻条数仍然对得上。
const orphaned = [
  ...entries,
  { id: "g", projectId: "ghost", tagIds: ["t9"], doneAt: "2026-11-07T09:00:00" },
];
ok("未知项目 id 并入未分类且占比仍为 1", () => {
  const rows = classRowsOf(orphaned, "project", projects, tags);
  assert.equal(rows.reduce((s, r) => s + r.count, 0), orphaned.length);
  assert.equal(rows.find((r) => r.key === NO_CLASS).count, 2);
  const sum = rows.reduce((s, r) => s + r.share, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9, `sum=${sum}`);
});
ok("未分类下钻包含幽灵项目", () => {
  assert.equal(entriesOfClass(orphaned, "project", NO_CLASS, projects, tags).length, 2);
});
ok("未知标签 id 不参与计数", () => {
  const rows = classRowsOf(orphaned, "tag", projects, tags);
  assert.equal(rows.reduce((s, r) => s + r.count, 0), 5);
});

if (!process.exitCode) {
  console.log(`OK (0 failure(s), ${pass} assertion(s))`);
}
