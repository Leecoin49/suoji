/**
 * 004-stats-visual / T008 断言脚本
 *
 * 断言 contracts/heat-grid.md 与 data-model.md 的不变量：
 * H-1 格数 = 7×列数 / H-2 档位单调 / H-3 今天至多一个 / H-4 峰值并列全标 /
 * H-5 首末对齐区间 / H-6 dates 升序 / H-8 cellSize 三档 / T-1 月标签连续覆盖，
 * 外加 levelOf 全边界与 heatMove 六键 + 越界 + 未知键。
 *
 * 跑法（仓库根目录，PowerShell）：
 *   @'
 *   { "extends": "./tsconfig.json", "compilerOptions": { "noEmit": false, "outDir": ".pi/tmp/visualbuild", "types": [] },
 *     "include": ["src/lib/stats.ts"] }
 *   '@ | Set-Content tsconfig.visual-verify.json -Encoding UTF8
 *   pnpm exec tsc -p tsconfig.visual-verify.json
 *   Remove-Item tsconfig.visual-verify.json
 *   $env:STATS_BUNDLE = (Resolve-Path .pi/tmp/visualbuild/stats.js).Path
 *   node specs\004-stats-visual\verify\visual_check.mjs
 */

import { pathToFileURL } from "node:url";

const bundle = process.env.STATS_BUNDLE;
if (!bundle) {
  console.error("STATS_BUNDLE 未设置：先编译 src/lib/stats.ts");
  process.exit(2);
}

const { levelOf, heatGridOf, monthTicksOf, heatDatesOf, heatMove } = await import(
  pathToFileURL(bundle).href
);

let failures = 0;
const rows = [];
function check(name, ok, detail = "") {
  rows.push(`${ok ? "ok  " : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

/* ---------------------------------------------------------------- 夹具 */

function dayList(start, end) {
  const out = [];
  let t = Date.parse(`${start}T00:00:00Z`);
  const stop = Date.parse(`${end}T00:00:00Z`);
  while (t <= stop) {
    out.push(new Date(t).toISOString().slice(0, 10));
    t += 86400000;
  }
  return out;
}

/** 由 {date: count} 造出天档桶（AxisBucket 只用到 key/count/start/end）。 */
function axisOf(start, end, counts = {}) {
  return dayList(start, end).map((date) => ({
    key: date,
    label: date,
    count: counts[date] ?? 0,
    start: date,
    end: date,
    clipped: false,
    isPeak: false,
    isZero: (counts[date] ?? 0) === 0,
    isPartial: false,
    share: 0,
    heightPct: 0,
  }));
}

function cells(grid) {
  return grid.weeks.flat();
}

/* ------------------------------------------------------- levelOf 边界 */

const levelCases = [
  [-1, 0],
  [0, 0],
  [1, 1],
  [2, 2],
  [3, 2],
  [4, 3],
  [6, 3],
  [7, 4],
  [100, 4],
  [Number.NaN, 0],
];
for (const [input, expected] of levelCases) {
  check(`levelOf(${input}) === ${expected}`, levelOf(input) === expected, `got ${levelOf(input)}`);
}

/* -------------------------------------------- 30 天（5 列）主夹具 */
const SPAN = { start: "2026-10-01", end: "2026-10-30" };
const TODAY = "2026-10-30";
const counts = {
  "2026-10-01": 1,
  "2026-10-02": 2,
  "2026-10-05": 7, // 峰值
  "2026-10-13": 7, // 并列峰值
  "2026-10-20": 3,
  "2026-10-21": 4,
  "2026-10-30": 1, // 今天
};
const axis = axisOf(SPAN.start, SPAN.end, counts);
const grid = heatGridOf(axis, SPAN, TODAY);
const flat = cells(grid);

check("H-1 每列恒 7 格", grid.weeks.every((w) => w.length === 7), `列数 ${grid.weekCount}`);
check("H-1 总格数 = 7×列数", flat.length === 7 * grid.weekCount, `${flat.length} vs ${7 * grid.weekCount}`);
check(
  "H-1 首列为区间起始所在周的周一",
  grid.firstMonday === "2026-09-28",
  grid.firstMonday,
);
check("H-1 末列为区间结束所在周的周日", grid.lastSunday === "2026-11-01", grid.lastSunday);
check(
  "H-1 列数 = 5（09-28…11-01）",
  grid.weekCount === 5,
  String(grid.weekCount),
);

const ordered = [...flat].sort((a, b) => a.count - b.count);
check(
  "H-2 档位随件数单调",
  ordered.every((cell) => cell.level === levelOf(cell.count)),
);
check(
  "H-2 相邻档位不逆转",
  ordered.every((cell, i) => i === 0 || ordered[i - 1].level <= cell.level),
);

const todays = flat.filter((c) => c.isToday);
check("H-3 今天至多一个", todays.length <= 1, `${todays.length} 个`);
check("H-3 今天就是区间末日", todays.length === 1 && todays[0].date === TODAY, todays[0]?.date ?? "无");

const maxCount = Math.max(...Object.values(counts));
const peaks = flat.filter((c) => c.isPeak);
check(
  "H-4 峰值并列全标",
  peaks.length === 2 && peaks.every((c) => c.count === maxCount),
  `${peaks.length} 个峰值 / max=${maxCount}`,
);
check(
  "H-4 非峰值不标",
  flat.filter((c) => c.count === maxCount).every((c) => c.isPeak),
);

check("H-5 firstMonday ≤ span.start", grid.firstMonday <= SPAN.start);
check("H-5 lastSunday ≥ span.end", grid.lastSunday >= SPAN.end);

check("H-6 dates 升序", grid.dates.every((d, i) => i === 0 || grid.dates[i - 1] < d));
check("H-6 dates 首末 = 区间首末", grid.dates[0] === SPAN.start && grid.dates.at(-1) === SPAN.end);
check("H-6 dates 长度 = 区间天数", grid.dates.length === 30, String(grid.dates.length));

const outside = flat.filter((c) => c.isOutside);
check("区间外格 count/level 归零", outside.every((c) => c.count === 0 && c.level === 0));
check("区间外格不标今天/峰值", outside.every((c) => !c.isToday && !c.isPeak));
check(
  "区间内格全部非 outside",
  flat.filter((c) => c.date >= SPAN.start && c.date <= SPAN.end).every((c) => !c.isOutside),
);
check(
  "区间内 30 格 + 区间外 5 格 = 35",
  flat.filter((c) => !c.isOutside).length === 30 && outside.length === 5,
  `${flat.filter((c) => !c.isOutside).length} / ${outside.length}`,
);
check(
  "count 与桶一一对应（抽查 10-05）",
  flat.find((c) => c.date === "2026-10-05")?.count === 7,
);

/* ------------------------------------------------------------ H-8 cellSize */

const sizeCases = [
  ["2026-10-05", "2026-10-11", 22, 1], // 周一→周日，1 列
  ["2026-10-01", "2026-10-30", 22, 5], // 5 列
  ["2026-09-07", "2026-11-01", 18, 8], // 周一→第 8 个周日，8 列
  ["2026-09-07", "2026-11-08", 14, 9], // 9 列
  ["2026-08-10", "2026-11-08", 14, 13], // 13 列
];
for (const [start, end, size, weeks] of sizeCases) {
  const g = heatGridOf(axisOf(start, end), { start, end }, "2026-10-30");
  check(
    `H-8 cellSize ${weeks} 列 → ${size}`,
    g.cellSize === size && g.weekCount === weeks,
    `${g.weekCount} 列 / ${g.cellSize}px`,
  );
}

/* ------------------------------------------------------------- T-1 月标签 */

check("T-1 ticks 非空", grid.ticks.length > 0);
check(
  "T-1 span 之和 = 列数",
  grid.ticks.reduce((sum, t) => sum + t.span, 0) === grid.weekCount,
  `${grid.ticks.reduce((s, t) => s + t.span, 0)} vs ${grid.weekCount}`,
);
check(
  "T-1 weekIndex 连续覆盖",
  grid.ticks.every((t, i) => (i === 0 ? t.weekIndex === 0 : grid.ticks[i - 1].weekIndex + grid.ticks[i - 1].span === t.weekIndex)),
);
check(
  "T-1 monthKey 升序",
  grid.ticks.every((t, i) => i === 0 || grid.ticks[i - 1].monthKey < t.monthKey),
  grid.ticks.map((t) => t.monthKey).join(","),
);
const longGrid = heatGridOf(axisOf("2025-12-01", "2026-03-01"), { start: "2025-12-01", end: "2026-03-01" }, "2026-03-01");
check(
  "T-1 跨年 3 个月标签（03-01 是周日，当月无列）",
  longGrid.ticks.map((t) => t.monthKey).join(",") === "2025-12,2026-01,2026-02",
  longGrid.ticks.map((t) => t.monthKey).join(","),
);
check(
  "T-1 相邻同月已合并（无重复 monthKey）",
  new Set(longGrid.ticks.map((t) => t.monthKey)).size === longGrid.ticks.length,
);
check("T-1 对空 weeks 返回空", monthTicksOf([]).length === 0);

/* --------------------------------------------------------- heatDatesOf */

const dates = heatDatesOf(grid);
check("heatDatesOf 与 dates 等长", dates.length === grid.dates.length);
check("heatDatesOf 返回副本", dates !== grid.dates);

/* ------------------------------------------------------------ heatMove */

const seq = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10"];
check("heatMove 右移一天", heatMove(seq, "2026-10-05", "ArrowRight") === "2026-10-06");
check("heatMove 左移一天", heatMove(seq, "2026-10-05", "ArrowLeft") === "2026-10-04");
check("heatMove 下移一周", heatMove(seq, "2026-10-02", "ArrowDown") === "2026-10-09");
check("heatMove 上移一周", heatMove(seq, "2026-10-09", "ArrowUp") === "2026-10-02");
check("heatMove Home 到首", heatMove(seq, "2026-10-05", "Home") === "2026-10-01");
check("heatMove End 到末", heatMove(seq, "2026-10-05", "End") === "2026-10-10");
check("heatMove 左越界停在边界", heatMove(seq, "2026-10-01", "ArrowLeft") === "2026-10-01");
check("heatMove 右越界停在边界", heatMove(seq, "2026-10-10", "ArrowRight") === "2026-10-10");
check("heatMove 上越界停在首格", heatMove(seq, "2026-10-03", "ArrowUp") === "2026-10-01");
check("heatMove 下越界停在边界", heatMove(seq, "2026-10-08", "ArrowDown") === "2026-10-10");
check("heatMove 未知键原样返回", heatMove(seq, "2026-10-05", "PageDown") === "2026-10-05");
check("heatMove 空序列原样返回", heatMove([], "2026-10-05", "ArrowRight") === "2026-10-05");
check("heatMove current 不在序列里 → 首", heatMove(seq, "2030-01-01", "Home") === "2026-10-01");

/* ------------------------------------------------- disk 打印与汇总 */

console.log(rows.join("\n"));
console.log("");
console.log(
  failures === 0
    ? `OK (0 failure(s)) — ${rows.length} 条断言`
    : `FAILED (${failures} of ${rows.length})`,
);
process.exit(failures === 0 ? 0 : 1);
