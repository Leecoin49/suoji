/**
 * 003-stats-clarity / T009 断言脚本
 *
 * 断言 contracts/stats-clarity.md 的不变量：C-1 / C-3 / C-4 / B-2 / B-5 / G-1 / F-1 / S-1，
 * 外加 axisTicksOf(1) 与 30/90/365/1096 天四档的桶数与 Σ count（SC-003 不回归 002）。
 *
 * 跑法（仓库根目录，PowerShell）：
 *   @'
 *   { "extends": "./tsconfig.json", "compilerOptions": { "noEmit": false, "outDir": ".pi/tmp/claritybuild", "types": [] },
 *     "include": ["src/lib/stats.ts"] }
 *   '@ | Set-Content tsconfig.clarity.json -Encoding UTF8
 *   pnpm exec tsc -p tsconfig.clarity.json
 *   Remove-Item tsconfig.clarity.json
 *   $env:STATS_BUNDLE = (Resolve-Path .pi/tmp/claritybuild/stats.js).Path
 *   node specs\003-stats-clarity\verify\clarity_check.mjs
 */

import { pathToFileURL } from "node:url";

const bundle = process.env.STATS_BUNDLE;
if (!bundle) {
  console.error("STATS_BUNDLE 未设置：先编译 src/lib/stats.ts");
  process.exit(2);
}

const mod = await import(pathToFileURL(bundle).href);
const {
  toView,
  conclusionOf,
  axisBucketsOf,
  axisTicksOf,
  sparsityOf,
  groupDoneByDay,
  filterEntries,
} = mod;

let failures = 0;
const rows = [];
function check(name, ok, detail = "") {
  rows.push(`${ok ? "ok  " : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures += 1;
}
function eq(name, actual, expected) {
  check(name, JSON.stringify(actual) === JSON.stringify(expected), `got ${JSON.stringify(actual)}`);
}

/* ---------------- fixtures ---------------- */

function span(start, end, days) {
  return { start, end, days };
}

function mkRaw(sp, entries, opts = {}) {
  return {
    span: sp,
    prev: opts.prev ?? { start: "2000-01-01", end: "2000-01-01", days: 1 },
    done: entries,
    prevDone: opts.prevDone ?? 0,
    rolled: opts.rolled ?? [],
    backlog: opts.backlog ?? 0,
    undated: opts.undated ?? 0,
    clamped: false,
  };
}

let seq = 0;
function entry(day, time = "10:00:00", title = "t") {
  seq += 1;
  return { id: `id-${String(seq).padStart(4, "0")}`, title: `${title}${seq}`, note: null, doneAt: `${day}T${time}` };
}

const TODAY = "2026-11-09";

// 30 天：10-11 … 11-09，其中 11-02 为 0 件（断档 1 天），今天 11-09 也是 0 件但不算断档
const sp30 = span("2026-10-11", "2026-11-09", 30);
const e30 = [
  entry("2026-10-11", "09:00:00"),
  entry("2026-10-12", "09:00:00"),
  entry("2026-10-13", "09:00:00"),
  entry("2026-10-14", "09:00:00"),
  entry("2026-10-15", "09:00:00"),
  entry("2026-10-16", "09:00:00"),
  entry("2026-10-17", "09:00:00"),
  entry("2026-10-18", "09:00:00"),
  entry("2026-10-19", "09:00:00"),
  entry("2026-10-20", "09:00:00"),
  entry("2026-10-21", "09:00:00"),
  entry("2026-10-21", "11:00:00"),
  entry("2026-10-21", "15:00:00"),
  entry("2026-10-22", "09:00:00"),
  entry("2026-10-23", "09:00:00"),
  entry("2026-10-24", "09:00:00"),
  entry("2026-10-25", "09:00:00"),
  entry("2026-10-26", "09:00:00"),
  entry("2026-10-27", "09:00:00"),
  entry("2026-10-28", "09:00:00"),
  entry("2026-10-29", "09:00:00"),
  entry("2026-10-30", "09:00:00"),
  entry("2026-10-31", "09:00:00"),
  entry("2026-11-01", "09:00:00"),
  // 11-02 空
  entry("2026-11-03", "09:00:00"),
  entry("2026-11-04", "09:00:00"),
  entry("2026-11-05", "09:00:00"),
  entry("2026-11-06", "09:00:00"),
  entry("2026-11-07", "09:00:00"),
  entry("2026-11-08", "09:00:00"),
  // 11-09（今天）空
];
const view30 = toView(mkRaw(sp30, e30, { prevDone: 23 }), TODAY);
const buckets30 = axisBucketsOf(view30, TODAY);
const concl30 = conclusionOf(view30, TODAY, e30);

/* ---------------- C-1 / C-3 / C-4 ---------------- */

check("C-1 conclusion.done === view.doneTotal", concl30.done === view30.doneTotal, `${concl30.done} vs ${view30.doneTotal}`);
check("C-1 同日 明细数 === doneTotal", view30.doneTotal === e30.length, `${view30.doneTotal} vs ${e30.length}`);

eq("C-3 最忙一天（并列取最早）", concl30.peak, { date: "2026-10-21", count: 3 });

const emptyView = toView(mkRaw(sp30, []), TODAY);
const emptyConcl = conclusionOf(emptyView, TODAY, []);
check("C-3 peak === null ⟺ done === 0", emptyConcl.peak === null && emptyConcl.done === 0);

check("C-4 断档 = 1（11-02；今天 11-09 的 0 件不算）", concl30.gapDays === 1, `got ${concl30.gapDays}`);

const gapConcl = conclusionOf(view30, "2026-11-10", e30);
check("C-4 过了今天之后 11-09 才计入断档", gapConcl.gapDays === 2, `got ${gapConcl.gapDays}`);

const pastView = toView(mkRaw(span("2026-10-01", "2026-10-05", 5), [entry("2026-10-01"), entry("2026-10-04")]), TODAY);
const pastConcl = conclusionOf(pastView, TODAY, [entry("2026-10-01"), entry("2026-10-04")]);
check("C-4 过去的区间没有「今天」例外", pastConcl.gapDays === 3, `got ${pastConcl.gapDays}`);

/* ---------------- B-2 / B-5 ---------------- */

const shareSum = buckets30.reduce((s, b) => s + b.share, 0);
check("B-2 Σ share ≈ 1", Math.abs(shareSum - 1) < 1e-6, `got ${shareSum}`);
const zeroShares = axisBucketsOf(emptyView, TODAY);
check("B-2 doneTotal === 0 时 share 全 0 且无 NaN", zeroShares.every((b) => b.share === 0 && Number.isFinite(b.share)));

const sortedByCount = [...buckets30].sort((a, b) => a.count - b.count);
let monotone = true;
for (let i = 1; i < sortedByCount.length; i += 1) {
  if (sortedByCount[i].heightPct < sortedByCount[i - 1].heightPct) monotone = false;
}
check("B-5 heightPct 随 count 单调不减", monotone);
check("B-5 非零柱至少 4%", buckets30.filter((b) => b.count > 0).every((b) => b.heightPct >= 4));
check("B-5 0 件柱高为 0", buckets30.filter((b) => b.count === 0).every((b) => b.heightPct === 0));
check("isPeak 覆盖全部并列最大值", buckets30.filter((b) => b.isPeak).length === buckets30.filter((b) => b.count === view30.maxCount).length);
check("isPartial 只标今天所在桶", buckets30.filter((b) => b.isPartial).map((b) => b.key).join() === "2026-11-09");
check("axisTicksOf(1) === [0,1,1]", JSON.stringify(axisTicksOf(1)) === "[0,1,1]");
eq("axisTicksOf(9)", axisTicksOf(9), [0, 5, 9]);
eq("axisTicksOf(0)", axisTicksOf(0), [0, 0, 0]);

/* ---------------- G-1 ---------------- */

const groups = groupDoneByDay(e30);
check("G-1 组按日期严格倒序", groups.every((g, i) => i === 0 || groups[i - 1].date > g.date), groups.map((g) => g.date).join(">"));
check("G-1 date 恒为 YYYY-MM-DD", groups.every((g) => /^\d{4}-\d{2}-\d{2}$/.test(g.date)));
check("G-1 Σ count === 明细数", groups.reduce((s, g) => s + g.count, 0) === e30.length);
const peakGroup = groups.find((g) => g.date === "2026-10-21");
check("G-1 组内完成时刻倒序", peakGroup.entries.map((e) => e.doneAt.slice(11, 13)).join() === "15,11,09");
check("G-1 同日同时刻按 id 升序稳定", (() => {
  const same = [entry("2026-01-01", "08:00:00"), entry("2026-01-01", "08:00:00")];
  const g = groupDoneByDay(same)[0];
  return g.entries[0].id < g.entries[1].id;
})());

/* ---------------- F-1 ---------------- */

const target = buckets30.find((b) => b.count === 3);
const filter = { key: target.key, start: target.start, end: target.end };
const filtered = filterEntries(e30, filter);
check("F-1 筛选条数 === 桶 count", filtered.length === target.count, `${filtered.length} vs ${target.count}`);
check("F-1 null 时原样返回", filterEntries(e30, null).length === e30.length);
const emptySlice = filterEntries(e30, { key: "x", start: "2026-11-09", end: "2026-11-09" });
check("F-1 空桶筛选出 0 条", emptySlice.length === 0);

/* ---------------- S-1 ---------------- */

const sparsityCases = {
  none: toView(mkRaw(sp30, []), TODAY),
  undatedOnly: toView(mkRaw(sp30, [], { undated: 2 }), TODAY),
  one: toView(mkRaw(sp30, [entry("2026-11-09")]), TODAY),
  few: toView(mkRaw(sp30, [entry("2026-11-01"), entry("2026-11-03")]), TODAY),
  ok: view30,
};
const seen = {};
for (const [want, v] of Object.entries(sparsityCases)) {
  const got = sparsityOf(v);
  seen[got] = true;
  check(`S-1 sparsityOf → ${want}`, got === want, `got ${got}`);
}
check("S-1 五档全部可达且互斥", Object.keys(seen).length === 5, Object.keys(seen).join(","));

/* ---------------- 四档桶数与 Σ count ---------------- */

const big = [];
for (let i = 0; i < 400; i += 1) {
  const d = new Date(Date.UTC(2025, 10, 1) + i * 86400000);
  big.push(entry(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`));
}
const cases = [
  ["30 天", span("2026-10-11", "2026-11-09", 30), 30, "day"],
  ["90 天", span("2026-08-12", "2026-11-09", 90), 90, "day"],
  ["365 天", span("2025-11-10", "2026-11-09", 365), 53, "week"],
  ["1096 天", span("2023-11-10", "2026-11-09", 1096), 37, "month"],
];
for (const [label, sp, expectedBuckets, expectedGranularity] of cases) {
  const entries = big.filter((e) => e.doneAt.slice(0, 10) >= sp.start && e.doneAt.slice(0, 10) <= sp.end);
  const v = toView(mkRaw(sp, entries, { undated: 3, prevDone: 10, backlog: 4 }), TODAY);
  const bs = axisBucketsOf(v, TODAY);
  const sum = bs.reduce((s, b) => s + b.count, 0);
  check(`${label}: gran ${v.granularity}`, v.granularity === expectedGranularity, `got ${v.granularity}`);
  check(`${label}: 桶数 ${expectedBuckets}`, bs.length === expectedBuckets, `got ${bs.length}`);
  check(`${label}: Σ count === 明细数`, sum === entries.length, `${sum} vs ${entries.length}`);
  check(`${label}: 首末桶裁剪落在区间内`, bs[0].start >= sp.start && bs[bs.length - 1].end <= sp.end);
  const c = conclusionOf(v, TODAY, entries);
  check(`${label}: 全部数值有限`, [c.done, c.gapDays, c.peak?.count ?? 0, v.average, v.streak].every((n) => Number.isFinite(n)));
  check(`${label}: 总桶 Σ 不含 NaN`, bs.every((b) => Number.isFinite(b.share) && Number.isFinite(b.heightPct)));
}

/* ---------------- 输出 ---------------- */

rows.push("");
rows.push(failures === 0 ? "OK (0 failure(s))" : `FAILED (${failures} failure(s))`);
console.log(rows.join("\n"));
