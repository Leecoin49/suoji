// T032 / SC-005 —— 前端聚合段计时（10 000 条已完成后经 bucketize/streak/compare/toView）
//
// 先按 lib_check.mjs 头部注释的方法把 src/lib/stats.ts 编出 JS：
//   tsconfig.statsverify.json  ->  .pi/tmp/statsbuild/stats.js
// 然后：
//   $env:STATS_BUNDLE = ".pi/tmp/statsbuild/stats.js"
//   node specs/002-stats-dashboard/verify/perf_agg.mjs

import { pathToFileURL } from "node:url";

const bundle = process.env.STATS_BUNDLE ?? ".pi/tmp/statsbuild/stats.js";
const s = await import(pathToFileURL(bundle).href);

const N = 10000;
const today = "2025-10-31";

// 10 000 条：跨 3 年（2023-01-01 .. 2025-12-31），越界的那天成不了几件
const done = [];
for (let i = 0; i < N; i++) {
  const day = new Date(Date.UTC(2023, 0, 1) + ((i * 1093) / N) * 86400000)
    .toISOString()
    .slice(0, 10);
  const hh = String(8 + (i % 12)).padStart(2, "0");
  const mm = String(i % 60).padStart(2, "0");
  done.push({ id: `p${i}`, title: `task ${i}`, note: i % 25 === 0 ? `note ${i}` : null, doneAt: `${day}T${hh}:${mm}:00` });
}

const rolled = Array.from({ length: 5 }, (_, i) => ({
  id: `r${i}`,
  title: `rolled ${i}`,
  rollCount: 7 - i,
  lastRolledAt: "2025-10-20",
}));

function spanOf(start, end) {
  const days = Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1;
  const pe = new Date(Date.parse(end) - 0); // placeholder, replaced below
  void pe;
  const prevEndDate = new Date(Date.parse(start) - 86400000);
  const prevEnd = prevEndDate.toISOString().slice(0, 10);
  const prevStart = new Date(prevEndDate.getTime() - (days - 1) * 86400000).toISOString().slice(0, 10);
  return { start, end, days, prevStart, prevEnd };
}

function run(name, start, end) {
  const span = spanOf(start, end);
  // IPC 只返回区间内的行，所以这里也先按区间过滤（否则 Σ 断言不成立）
  const inWin = done.filter((d) => d.doneAt.slice(0, 10) >= start && d.doneAt.slice(0, 10) <= end);
  const raw = {
    span,
    prev: span,
    done: inWin,
    prevDone: 4231,
    rolled,
    backlog: 3000,
    undated: 0,
    clamped: false,
  };
  const samples = [];
  let view = null;
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now();
    view = s.toView(raw, today);
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  const med = samples[2];
  const sum = view.buckets.reduce((a, b) => a + b.count, 0);
  console.log(
    `${name.padEnd(24)} span=${String(span.days).padStart(4)} 天  median=${med.toFixed(1).padStart(6)} ms  ` +
      `buckets=${String(view.buckets.length).padStart(4)}  Σ=${sum}  doneTotal=${view.doneTotal}  ` +
      `avg=${view.average}  streak=${view.streak}`
  );
  if (sum !== view.doneTotal) throw new Error(`Σ buckets !== doneTotal for ${name}`);
  return med;
}

const a = run("365 天（按周）", "2024-11-01", "2025-10-31");
const b = run("3 年（按月）", "2023-01-01", "2025-12-31");
const c = run("30 天（按天）", "2025-10-02", "2025-10-31");
const worst = Math.max(a, b, c);
console.log(`\nworst median = ${worst.toFixed(1)} ms  (SC-005: 365 天内 ≤500ms，>365 天 ≤800ms)`);
console.log("RESULT: " + (worst <= 500 ? "OK" : "SLOW"));
