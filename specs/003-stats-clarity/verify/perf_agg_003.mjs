// 003-stats-clarity / T028 —— 前端聚合段计时（10 000 条，365 天档）
//
// 测的是「002 的 toView」加上 003 新增的 axisBucketsOf / conclusionOf / groupDoneByDay，
// 与 002 基线（SQL 6.0 ms / 聚合 8.3 ms，见 specs/002-stats-dashboard/verify/perf-report.txt）
// 对比，判定 SC-008：≤ 500 ms 且相对 002 的聚合增量 ≤ 100 ms。
//
// 前置：把 src/lib/stats.ts 编出 JS（同 clarity_check.mjs 头部注释的做法），然后
//   $env:STATS_BUNDLE = (Resolve-Path .pi/tmp/claritybuild/stats.js).Path
//   node specs\003-stats-clarity\verify\perf_agg_003.mjs

import { pathToFileURL } from "node:url";

const bundle = process.env.STATS_BUNDLE;
if (!bundle) {
  console.error("STATS_BUNDLE 未设置：先编译 src/lib/stats.ts");
  process.exit(2);
}

const s = await import(pathToFileURL(bundle).href);
const { toView, axisBucketsOf, conclusionOf, groupDoneByDay, filterEntries, sparsityOf } = s;

const N = 10000;
const today = "2026-11-09";
const REPEATS = 5;

// 10 000 条完成记录，跨 3 年（2023-11-10 .. 2026-11-08），与 002 的分布口径一致
const done = [];
for (let i = 0; i < N; i += 1) {
  const day = new Date(Date.UTC(2023, 10, 10) + ((i * 1095) / N) * 86400000)
    .toISOString()
    .slice(0, 10);
  const hh = String(8 + (i % 12)).padStart(2, "0");
  const mm = String(i % 60).padStart(2, "0");
  done.push({
    id: `p${String(i).padStart(5, "0")}`,
    title: `task ${i}`,
    note: i % 25 === 0 ? `note ${i}` : null,
    doneAt: `${day}T${hh}:${mm}:00`,
  });
}

const rolled = Array.from({ length: 5 }, (_, i) => ({
  id: `r${i}`,
  title: `rolled ${i}`,
  rollCount: 7 - i,
  lastRolledAt: "2026-11-01",
}));

const day = 86400000;

function window305days() {
  const end = new Date(Date.parse(today));
  const start = new Date(end.getTime() - 364 * day);
  const days = 365;
  const prevEnd = new Date(start.getTime() - day);
  const prevStart = new Date(prevEnd.getTime() - (days - 1) * day);
  const iso = (d) => d.toISOString().slice(0, 10);
  return {
    span: { start: iso(start), end: iso(end), days },
    prev: { start: iso(prevStart), end: iso(prevEnd), days },
  };
}

const { span, prev } = window305days();
const entries = done.filter((e) => e.doneAt.slice(0, 10) >= span.start && e.doneAt.slice(0, 10) <= span.end);
const raw = {
  span,
  prev,
  done: entries,
  prevDone: 3000,
  rolled,
  backlog: 12,
  undated: 3,
  clamped: false,
};

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function measure(fn) {
  const times = [];
  for (let r = 0; r < REPEATS; r += 1) {
    const t0 = process.hrtime.bigint();
    fn();
    const t1 = process.hrtime.bigint();
    times.push(Number(t1 - t0) / 1e6);
  }
  return { median: median(times), min: Math.min(...times), max: Math.max(...times) };
}

const view = toView(raw, today);
const axis = axisBucketsOf(view, today);

const tView = measure(() => toView(raw, today));
const tAxis = measure(() => axisBucketsOf(view, today));
const tConclusion = measure(() => conclusionOf(view, today, entries));
const tGroups = measure(() => groupDoneByDay(entries));
const tSparsity = measure(() => sparsityOf(view));
const tJoin = measure(() => {
  // 用户点一个桶到明细就绪：筛 + 分组
  const f = { key: axis[0].key, start: axis[0].start, end: axis[0].end };
  groupDoneByDay(filterEntries(raw.done, f));
});

const total = tView.median + tAxis.median + tConclusion.median + tGroups.median + tSparsity.median;

const rows = [];
rows.push("003-stats-clarity / T028 性能复测");
rows.push(`时间：${new Date().toISOString()}`);
rows.push(`数据：${N} 条完成记录，区间 ${span.start} .. ${span.end}（${span.days} 天，${view.granularity} 桶 ${axis.length} 个），重复 ${REPEATS} 次取中位`);
rows.push("");
rows.push("## 分段中位耗时（ms）");
rows.push(`toView            ${tView.median.toFixed(2)}  (min ${tView.min.toFixed(2)} / max ${tView.max.toFixed(2)})`);
rows.push(`axisBucketsOf     ${tAxis.median.toFixed(2)}  (min ${tAxis.min.toFixed(2)} / max ${tAxis.max.toFixed(2)})`);
rows.push(`conclusionOf      ${tConclusion.median.toFixed(2)}  (min ${tConclusion.min.toFixed(2)} / max ${tConclusion.max.toFixed(2)})`);
rows.push(`groupDoneByDay    ${tGroups.median.toFixed(2)}  (min ${tGroups.min.toFixed(2)} / max ${tGroups.max.toFixed(2)})`);
rows.push(`sparsityOf        ${tSparsity.median.toFixed(2)}`);
rows.push(`采纳① 下钻(筛+分组) ${tJoin.median.toFixed(2)}`);
rows.push("");
rows.push("## 与 002 基线对比");
rows.push(`002 基线：SQL 6.00 ms + 聚合 8.30 ms = 14.30 ms`);
rows.push(`003 现在：SQL 6.00 ms（同一批语句，未改） + 聚合 ${total.toFixed(2)} ms = ${(6 + total).toFixed(2)} ms`);
rows.push(`聚合增量：${(total - 8.3).toFixed(2)} ms（SC-008 要求 ≤ 100 ms）`);
rows.push("");
rows.push("## 断言");
const finite = [tView.median, tAxis.median, tConclusion.median, tGroups.median, total].every(Number.isFinite);
rows.push(`${finite ? "ok  " : "FAIL"} 全部耗时为有限数`);
const withinBudget = 6 + total <= 500;
rows.push(`${withinBudget ? "ok  " : "FAIL"} 总耗时 ${(6 + total).toFixed(2)} ms ≤ 500 ms（SC-008）`);
const incrementOk = total - 8.3 <= 100;
rows.push(`${incrementOk ? "ok  " : "FAIL"} 聚合增量 ${(total - 8.3).toFixed(2)} ms ≤ 100 ms`);
const sumOk = axis.reduce((s2, b) => s2 + b.count, 0) === entries.length;
rows.push(`${sumOk ? "ok  " : "FAIL"} 365 天档 Σ 桶 = 明细数（${axis.reduce((s2, b) => s2 + b.count, 0)}）`);
rows.push("");
rows.push("## 未计入的部分（已知限制）");
rows.push("- Vue 渲染与 DOM 合成；");
rows.push("- IPC（JSON 序列化 + 跨进程复制）；");
rows.push("- 冷启动与首帧。");
rows.push("");
rows.push(finite && withinBudget && incrementOk && sumOk ? "OK (0 failure(s))" : "FAILED");

console.log(rows.join("\n"));
