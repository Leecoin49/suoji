// Rule check for `src/lib/stats.ts` (spec 002, SC-003/004/005/007/008 + Edge Cases).
//
// stats.ts must run outside the app, so compile that one file to ESM with a throwaway
// tsconfig at the repo root (the `@/` alias needs baseUrl `.`), then point STATS_BUNDLE
// at the emitted file:
//
//   { "extends": "./tsconfig.json",
//     "compilerOptions": { "noEmit": false, "outDir": ".pi/tmp/statsbuild",
//                          "declaration": false, "sourceMap": false, "types": [] },
//     "include": ["src/lib/stats.ts"] }
//
//   pnpm exec tsc -p tsconfig.statsverify.json
//   set STATS_BUNDLE=.pi\tmp\statsbuild\stats.js
//   node specs/002-stats-dashboard/verify/lib_check.mjs
//
// One-off verification harness, not a test framework added to the project.

import { pathToFileURL } from "node:url";

const bundle = process.env.STATS_BUNDLE;
if (!bundle) {
  console.error("STATS_BUNDLE is not set");
  process.exit(2);
}

const lib = await import(pathToFileURL(bundle).href);
const { isIsoDay, validateRange, granularityOf, bucketize, maxCountOf, streakOf, compareOf, toView } = lib;

let failures = 0;
function check(name, ok, detail) {
  console.log((ok ? "PASS " : "FAIL ") + name + (ok || detail === undefined ? "" : "  → " + detail));
  if (!ok) failures += 1;
}

// ---------- isIsoDay / validateRange ----------
check("isIsoDay 2026-10-30", isIsoDay("2026-10-30") === true);
check("isIsoDay 2026-2-3 rejected", isIsoDay("2026-2-3") === false);
check("isIsoDay 2026-02-29 rejected (not a leap year)", isIsoDay("2026-02-29") === false);
check("isIsoDay 2024-02-29 accepted", isIsoDay("2024-02-29") === true);
check("isIsoDay 2026-13-01 rejected", isIsoDay("2026-13-01") === false);

const today = "2026-11-06";
check(
  "validateRange ok",
  validateRange("2026-10-01", "2026-10-30", today).ok === true,
);
check(
  "validateRange start > end rejected",
  validateRange("2026-10-30", "2026-10-01", today).ok === false,
);
const clamped = validateRange("2026-10-01", "2027-01-01", today);
check(
  "validateRange clamps future end",
  clamped.ok === true && clamped.end === today && clamped.clamped === true,
  JSON.stringify(clamped),
);
check(
  "validateRange rejects a start that is still future after clamping",
  validateRange("2026-12-01", "2027-01-01", today).ok === false,
);
check(
  "validateRange rejects bad format",
  validateRange("2026-1-1", "2026-10-01", today).ok === false,
);

// ---------- granularityOf ----------
check("granularity 1 → day", granularityOf(1) === "day");
check("granularity 90 → day", granularityOf(90) === "day");
check("granularity 91 → week", granularityOf(91) === "week");
check("granularity 365 → week", granularityOf(365) === "week");
check("granularity 366 → month", granularityOf(366) === "month");

// ---------- bucketize ----------
const raw = {
  span: { start: "2026-10-01", end: "2026-10-30", days: 30 },
  prev: { start: "2026-09-01", end: "2026-09-30", days: 30 },
  done: [
    { id: "a1", title: "write spec", note: null, doneAt: "2026-10-01T09:12:00" },
    { id: "a2", title: "review pr", note: "two rounds", doneAt: "2026-10-01T18:40:00" },
    { id: "a3", title: "call bank", note: null, doneAt: "2026-10-05T10:00:00" },
    { id: "a5", title: "midnight", note: null, doneAt: "2026-10-21T00:10:00" },
    { id: "a10", title: "last second", note: null, doneAt: "2026-10-30T23:59:59" },
  ],
  prevDone: 4,
  rolled: [{ id: "b4", title: "pushed seven", rollCount: 7, lastRolledAt: "2026-10-03" }],
  backlog: 5,
  undated: 2,
  clamped: false,
};

const days = bucketize(raw.done, raw.span, "day");
check("day buckets count = 30 (empty days kept)", days.length === 30, String(days.length));
check(
  "day bucket order ascending and unique",
  days.every((b, i) => (i === 0 ? b.start === raw.span.start : true) && b.start <= b.end),
);
check("Σ day counts = 5", days.reduce((s, b) => s + b.count, 0) === 5);
check("10-01 bucket holds 2", days.find((b) => b.key === "2026-10-01")?.count === 2);
check("empty day label is numeric", days[1].label === "10/02", days[1].label);

const weeks = bucketize(raw.done, { start: "2026-09-02", end: "2026-12-01", days: 91 }, "week");
check("week Σ counts = 5", weeks.reduce((s, b) => s + b.count, 0) === 5);
check("first week bucket is clipped to span start", weeks[0].start === "2026-09-02" && weeks[0].clipped === true);
check(
  "second week bucket starts on Monday",
  new Date(weeks[1].start + "T00:00:00").getDay() === 1,
  weeks[1].start,
);
check("last week bucket is clipped to span end", weeks[weeks.length - 1].end === "2026-12-01");

const months = bucketize(raw.done, { start: "2025-10-15", end: "2026-10-30", days: 381 }, "month");
check("month Σ counts = 5", months.reduce((s, b) => s + b.count, 0) === 5);
check("first month bucket clipped", months[0].start === "2025-10-15" && months[0].clipped === true);
check("last month bucket clipped", months[months.length - 1].end === "2026-10-30");
check("13 month buckets for 2025-10-15..2026-10-30", months.length === 13, String(months.length));

check("maxCountOf ≥ 1", maxCountOf(days) >= 1);

// ---------- streakOf ----------
const streakRaw = {
  ...raw,
  span: { start: "2026-10-28", end: "2026-11-06", days: 10 },
  prev: { start: "2026-10-18", end: "2026-10-27", days: 10 },
  done: [
    { id: "s1", title: "a", note: null, doneAt: "2026-11-04T20:00:00" },
    { id: "s2", title: "b", note: null, doneAt: "2026-11-05T09:00:00" },
    { id: "s3", title: "c", note: null, doneAt: "2026-11-06T08:00:00" },
  ],
};
check("streak counts back from today", streakOf(streakRaw.done, streakRaw.span, today) === 3, String(streakOf(streakRaw.done, streakRaw.span, today)));
const gapRaw = {
  ...streakRaw,
  done: [
    { id: "s1", title: "a", note: null, doneAt: "2026-11-03T20:00:00" },
    { id: "s3", title: "c", note: null, doneAt: "2026-11-06T08:00:00" },
  ],
};
check("streak breaks on a gap", streakOf(gapRaw.done, gapRaw.span, today) === 1, String(streakOf(gapRaw.done, gapRaw.span, today)));
const idleRaw = { ...streakRaw, done: [] };
check("streak is 0 when nothing lands today", streakOf(idleRaw.done, idleRaw.span, today) === 0);
check(
  "streak never exceeds span.days",
  streakOf(streakRaw.done, { start: "2026-11-06", end: "2026-11-06", days: 1 }, today) === 1,
);

// ---------- compareOf ----------
check("compare none when previous is 0", compareOf(5, 0).state === "none");
check("compare flat", compareOf(4, 4).state === "flat");
check("compare up delta", compareOf(6, 4).delta === 2 && compareOf(6, 4).state === "up");
check("compare down delta", compareOf(3, 4).delta === -1 && compareOf(3, 4).state === "down");

// ---------- toView ----------
const view = toView(raw, today);
check("total = doneTotal + undated", view.total === view.doneTotal + view.undated && view.undated === 2);
check("average = round(done/30, 1)", view.average === 0.2, String(view.average));
check("maxCount ≥ 1", view.maxCount >= 1);
check("empty false with completions", view.empty === false);
check(
  "empty true when nothing done and nothing rolled and nothing undated",
  toView({ ...raw, done: [], rolled: [], undated: 0, prevDone: 0 }, today).empty === true,
);
check(
  "empty false when only undated completions exist (T037)",
  toView({ ...raw, done: [], rolled: [], undated: 3, prevDone: 0 }, today).empty === false,
);
check("prev window surfaced", view.prev.start === "2026-09-01");
check(
  "granularity of 381 days is month",
  toView({ ...raw, span: { start: "2025-10-15", end: "2026-10-30", days: 381 } }, today).granularity === "month",
);
check(
  "no NaN / negative / Infinity anywhere",
  [view.doneTotal, view.undated, view.total, view.average, view.streak, view.maxCount, view.backlog].every(
    (n) => Number.isFinite(n) && n >= 0,
  ),
);

console.log("\n" + (failures === 0 ? "OK" : "FAILED") + " (" + failures + " failure(s))");
process.exit(failures === 0 ? 0 : 1);
