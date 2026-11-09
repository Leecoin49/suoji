import dayjs from "dayjs";
import type { DoneEntry, RollEntry, StatsRaw, StatsSpan } from "@/lib/api";

/**
 * Pure aggregation for the review panel.
 *
 * Contract: `specs/002-stats-dashboard/contracts/stats-lib.md`.
 * Nothing here reads the clock, storage, the store or the network — `today` is
 * always passed in, so the same input always yields the same output.
 */

export type Granularity = "day" | "week" | "month";
export type CompareState = "up" | "down" | "flat" | "none";

export interface Bucket {
  /** day: "YYYY-MM-DD"; week: the Monday's "YYYY-MM-DD"; month: "YYYY-MM"
   */
  key: string;
  /** Derived from the key only — never from the active locale. */
  label: string;
  count: number;
  /** Real start of this bucket inside the range (clipped for the first/last one). */
  start: string;
  end: string;
  clipped: boolean;
}

export interface Compare {
  state: CompareState;
  delta: number;
  prevTotal: number;
}

export interface StatsView {
  span: StatsSpan;
  prev: StatsSpan;
  doneTotal: number;
  undated: number;
  total: number;
  average: number;
  streak: number;
  granularity: Granularity;
  buckets: Bucket[];
  maxCount: number;
  compare: Compare;
  rolled: RollEntry[];
  backlog: number;
  clamped: boolean;
  empty: boolean;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function isoOf(d: dayjs.Dayjs): string {
  return d.format("YYYY-MM-DD");
}

/** Monday-based week start: `(day + 6) % 7` days back, independent of the locale. */
function mondayOf(d: dayjs.Dayjs): dayjs.Dayjs {
  return d.subtract((d.day() + 6) % 7, "day");
}

/** Strict `YYYY-MM-DD`, leap years included ("2026-02-29" is not a day). */
export function isIsoDay(value: string): boolean {
  if (!ISO_DAY.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (month < 1 || month > 12 || day < 1) return false;
  const limit = month === 2 && isLeapYear(year) ? 29 : MONTH_DAYS[month - 1];
  return day <= limit;
}

export function validateRange(
  start: string,
  end: string,
  today: string,
): { ok: true; start: string; end: string; clamped: boolean } | { ok: false; reason: "format" | "order" } {
  if (!isIsoDay(start) || !isIsoDay(end)) return { ok: false, reason: "format" };
  if (start > end) return { ok: false, reason: "order" };
  // The panel never looks into the future; a range that starts there is empty by definition.
  const clamped = end > today;
  const stop = clamped ? today : end;
  if (start > stop) return { ok: false, reason: "order" };
  return { ok: true, start, end: stop, clamped };
}

export function granularityOf(days: number): Granularity {
  const n = Math.max(1, Math.trunc(days));
  if (n <= 90) return "day";
  if (n <= 365) return "week";
  return "month";
}

/** Every bucket of the range, empty ones included, first and last clipped. */
export function bucketize(entries: DoneEntry[], span: StatsSpan): Bucket[] {
  const start = dayjs(span.start);
  const end = dayjs(span.end);
  const granularity = granularityOf(span.days);
  const buckets: Bucket[] = [];

  if (granularity === "day") {
    for (let d = start; !d.isAfter(end); d = d.add(1, "day")) {
      const key = isoOf(d);
      buckets.push({ key, label: d.format("MM/DD"), count: 0, start: key, end: key, clipped: false });
    }
  } else if (granularity === "week") {
    for (let cursor = mondayOf(start); !cursor.isAfter(end); cursor = cursor.add(7, "day")) {
      const weekEnd = cursor.add(6, "day");
      buckets.push({
        key: isoOf(cursor),
        label: `${cursor.format("MM/DD")}–${weekEnd.format("MM/DD")}`,
        count: 0,
        start: cursor.isBefore(start) ? span.start : isoOf(cursor),
        end: weekEnd.isAfter(end) ? span.end : isoOf(weekEnd),
        clipped: cursor.isBefore(start) || weekEnd.isAfter(end),
      });
    }
  } else {
    for (let cursor = start.startOf("month"); !cursor.isAfter(end); cursor = cursor.add(1, "month").startOf("month")) {
      const monthEnd = cursor.endOf("month").startOf("day");
      buckets.push({
        key: cursor.format("YYYY-MM"),
        label: cursor.format("YYYY-MM"),
        count: 0,
        start: cursor.isBefore(start) ? span.start : isoOf(cursor),
        end: monthEnd.isAfter(end) ? span.end : isoOf(monthEnd),
        clipped: cursor.isBefore(start) || monthEnd.isAfter(end),
      });
    }
  }

  if (!buckets.length) {
    // Defensive: an inverted range still renders one bucket instead of a blank panel.
    const key = isoOf(start);
    return [{ key, label: start.format("MM/DD"), count: entries.length, start: span.start, end: span.end, clipped: false }];
  }

  const perDay = new Map<string, number>();
  for (const entry of entries) {
    const day = entry.doneAt.slice(0, 10);
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
  }
  for (const bucket of buckets) {
    const stop = dayjs(bucket.end);
    let count = 0;
    for (let d = dayjs(bucket.start); !d.isAfter(stop); d = d.add(1, "day")) {
      count += perDay.get(isoOf(d)) ?? 0;
    }
    bucket.count = count;
  }

  return buckets;
}

export function maxCountOf(buckets: Bucket[]): number {
  return buckets.reduce((max, b) => (b.count > max ? b.count : max), 1);
}

/**
 * Consecutive days with at least one completion, counted backwards from
 * `min(today, span.end)` and never past `span.start`.
 */
export function streakOf(entries: DoneEntry[], span: StatsSpan, today: string): number {
  const days = new Set(entries.map((e) => e.doneAt.slice(0, 10)));
  const anchor = today < span.end ? today : span.end;
  if (anchor < span.start) return 0;
  let streak = 0;
  for (let i = 0; i < span.days; i += 1) {
    const day = isoOf(dayjs(anchor).subtract(i, "day"));
    if (day < span.start || !days.has(day)) break;
    streak += 1;
  }
  return Math.min(streak, span.days);
}

/** Against the previous equal-length stretch; no baseline means "nothing to compare". */
export function compareOf(current: number, previous: number): Compare {
  if (previous <= 0) return { state: "none", delta: 0, prevTotal: Math.max(0, previous) };
  const delta = current - previous;
  const state: CompareState = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  return { state, delta, prevTotal: previous };
}

/* ------------------------------------------------------------------ *
 * 003-stats-clarity：结论、可读图形、明细分组（契约见
 * `specs/003-stats-clarity/contracts/stats-clarity.md` §2）
 * 以上 8 个导出与 4 个类型属于 002 的冻结面，不得修改。
 * ------------------------------------------------------------------ */

/** 结论句与图形是否值得渲染：五档互斥穷尽（data-model S-1）。 */
export type Sparsity = "none" | "undatedOnly" | "one" | "few" | "ok";

export interface Conclusion {
  done: number;
  compare: { state: CompareState; delta: number };
  /** 最忙的一天；并列取日期最早；0 件时为 null（C-3）。 */
  peak: { date: string; count: number } | null;
  /** 0 件完成的天数，不含今天（C-4）。 */
  gapDays: number;
}

export interface AxisBucket extends Bucket {
  isPeak: boolean;
  isZero: boolean;
  isPartial: boolean;
  share: number;
  heightPct: number;
}

export interface DayGroup {
  /** "YYYY-MM-DD"，或未标注组的固定值 "__undated__"。 */
  date: string;
  isUndated: boolean;
  count: number;
  entries: DoneEntry[];
}

export interface DrillFilter {
  key: string;
  start: string;
  end: string;
}

export const UNDATED_KEY = "__undated__";

/**
 * 结论句的三个事实：件数、环比、节奏（最忙一天 + 断档天数）。
 *
 * 节奏必须按**天**计算，所以除了 view 还要 entries：周/月桶答不了「最忙的一天」。
 * 这三者与 `toView` 同源（C-1），不读时钟——`today` 由调用方传入。
 */
export function conclusionOf(view: StatsView, today: string, entries: DoneEntry[]): Conclusion {
  const done = view.doneTotal;
  const compare = { state: view.compare.state, delta: view.compare.delta };

  if (done === 0) {
    return { done, compare, peak: null, gapDays: 0 };
  }

  const perDay = new Map<string, number>();
  for (const entry of entries) {
    const day = entry.doneAt.slice(0, 10);
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
  }

  let peak: { date: string; count: number } | null = null;
  for (const [date, count] of perDay) {
    // 并列取最早：只有 count 更大，或 count 相等但日期更早才替换。
    if (!peak || count > peak.count || (count === peak.count && date < peak.date)) {
      peak = { date, count };
    }
  }

  const stop = view.span.end < today ? view.span.end : today;
  let gapDays = 0;
  for (let d = dayjs(view.span.start); !d.isAfter(dayjs(stop)); d = d.add(1, "day")) {
    const day = isoOf(d);
    if (day === today) continue; // 今天还没过完，0 件不算断档（C-4）
    if (!perDay.has(day)) gapDays += 1;
  }

  return { done, compare, peak, gapDays };
}

/** 在既有桶上补齐「是不是最高点 / 是不是 0 / 是不是今天 / 占比 / 柱高」。 */
export function axisBucketsOf(view: StatsView, today: string): AxisBucket[] {
  const max = view.maxCount > 0 ? view.maxCount : 1;
  return view.buckets.map((bucket) => {
    const share = view.doneTotal > 0 ? bucket.count / view.doneTotal : 0;
    return {
      ...bucket,
      isPeak: bucket.count > 0 && bucket.count === view.maxCount,
      isZero: bucket.count === 0,
      isPartial:
        view.span.end >= today && bucket.start <= today && today <= bucket.end,
      share,
      // 非零柱至少 4% 高，否则「1 件」在 1000 件的量级里会看不见；max() 保序，B-5 仍成立。
      heightPct: bucket.count === 0 ? 0 : Math.max(4, Math.round((bucket.count / max) * 100)),
    };
  });
}

/** 刻度：0 / 中 / 最大，三个整数（柱高指针对得上）。 */
export function axisTicksOf(maxCount: number): [number, number, number] {
  const max = Math.max(0, Math.round(maxCount));
  if (max <= 0) return [0, 0, 0];
  if (max === 1) return [0, 1, 1];
  return [0, Math.max(1, Math.round(max / 2)), max];
}

/** 数据够不够画：这样面板才不至于「一根孤零零的柱子」。 */
export function sparsityOf(view: StatsView): Sparsity {
  if (view.doneTotal === 0) return view.undated > 0 ? "undatedOnly" : "none";
  if (view.doneTotal === 1) return "one";
  // 天桶时这是「有数据的天数」；周/月桶时是「有数据的段数」，判据同样是「少于 3」。
  const filled = view.buckets.filter((b) => b.count > 0).length;
  if (filled < 3) return "few";
  return "ok";
}

/** 明细按天分组：日期倒序，组内完成时刻倒序（同时刻按 id 升序，保证稳定）。 */
export function groupDoneByDay(entries: DoneEntry[]): DayGroup[] {
  const groups = new Map<string, DoneEntry[]>();
  for (const entry of entries) {
    const date = entry.doneAt.slice(0, 10);
    const bucket = groups.get(date);
    if (bucket) bucket.push(entry);
    else groups.set(date, [entry]);
  }
  return [...groups.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
    .map(([date, list]) => ({
      date,
      isUndated: false,
      count: list.length,
      entries: [...list].sort((a, b) => {
        if (a.doneAt !== b.doneAt) return a.doneAt < b.doneAt ? 1 : -1;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      }),
    }));
}

/** 下钻：闭区间，按 `doneAt` 前 10 个字符比较（与 `bucketize` 同一口径）。 */
export function filterEntries(entries: DoneEntry[], filter: DrillFilter | null): DoneEntry[] {
  if (!filter) return entries;
  return entries.filter((entry) => {
    const day = entry.doneAt.slice(0, 10);
    return day >= filter.start && day <= filter.end;
  });
}

export function toView(raw: StatsRaw, today: string): StatsView {
  const days = Math.max(1, raw.span.days);
  const doneTotal = raw.done.length;
  const buckets = bucketize(raw.done, raw.span);
  return {
    span: raw.span,
    prev: raw.prev,
    doneTotal,
    undated: raw.undated,
    total: doneTotal + raw.undated,
    average: Math.round((doneTotal / days) * 10) / 10,
    streak: streakOf(raw.done, raw.span, today),
    granularity: granularityOf(days),
    buckets,
    maxCount: maxCountOf(buckets),
    compare: compareOf(doneTotal, raw.prevDone),
    rolled: raw.rolled,
    backlog: raw.backlog,
    clamped: raw.clamped,
    empty:
      doneTotal === 0 && raw.undated === 0 && raw.rolled.length === 0,
  };
}

/* ------------------------------------------------------------------ *
 * 004-stats-visual：日历热力图（契约见
 * `specs/004-stats-visual/contracts/heat-grid.md` §2）
 * 全是无副作用纯函数：不读 DOM、不读时钟、不写存储。
 * 以上 002/003 的导出属于冻结面，不得修改。
 * ------------------------------------------------------------------ */

export type HeatLevel = 0 | 1 | 2 | 3 | 4;

/** 件数 → 档位：0→0；1→1；2–3→2；4–6→3；≥7→4；负数/NaN→0。 */
export function levelOf(count: number): HeatLevel {
  if (!Number.isFinite(count) || count <= 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  if (count <= 6) return 3;
  return 4;
}

export interface HeatCell {
  /** YYYY-MM-DD */
  date: string;
  /** 区间外为 0。 */
  count: number;
  /** 区间外为 0。 */
  level: HeatLevel;
  isToday: boolean;
  /** count > 0 && count === maxCount。 */
  isPeak: boolean;
  isOutside: boolean;
  /** === date */
  key: string;
}

export interface MonthTick {
  /** 起始列索引（0-based）。 */
  weekIndex: number;
  /** 覆盖的列数。 */
  span: number;
  /** "YYYY-MM" */
  monthKey: string;
}

export interface HeatGrid {
  /** 列优先；每列恒 7 格（周一…周日）。 */
  weeks: HeatCell[][];
  weekCount: number;
  firstMonday: string;
  lastSunday: string;
  /** weekCount ≤5 → 22；≤8 → 18；其余 14。 */
  cellSize: 22 | 18 | 14;
  /** 区间内日期，网格顺序升序。 */
  dates: string[];
  ticks: MonthTick[];
}

/** 列头月标签：每列按周一的年月归属，相邻同月合并。 */
export function monthTicksOf(weeks: HeatCell[][]): MonthTick[] {
  const ticks: MonthTick[] = [];
  weeks.forEach((week, index) => {
    const monday = week[0];
    if (!monday) return;
    const monthKey = monday.date.slice(0, 7);
    const last = ticks[ticks.length - 1];
    if (last && last.monthKey === monthKey && last.weekIndex + last.span === index) {
      last.span += 1;
      return;
    }
    ticks.push({ weekIndex: index, span: 1, monthKey });
  });
  return ticks;
}

/**
 * 天档桶 → 7×N 网格。
 *
 * @param axis 天档桶（`granularityOf(days) === "day"` 时与日期一一对应）
 * @param span 已钳制过的区间（`StatsSpan` 的 start/end）
 * @param today 本地今天（YYYY-MM-DD）
 */
export function heatGridOf(
  axis: AxisBucket[],
  span: { start: string; end: string },
  today: string,
): HeatGrid {
  const perDay = new Map<string, number>();
  for (const bucket of axis) {
    if (bucket.count > 0) perDay.set(bucket.key, bucket.count);
  }
  const maxCount = axis.reduce((max, bucket) => Math.max(max, bucket.count), 0);

  const firstMonday = mondayOf(dayjs(span.start));
  const lastSunday = mondayOf(dayjs(span.end)).add(6, "day");
  const dayCount = Math.max(1, lastSunday.diff(firstMonday, "day") + 1);
  const weekCount = Math.ceil(dayCount / 7);

  const weeks: HeatCell[][] = [];
  for (let w = 0; w < weekCount; w += 1) {
    const column: HeatCell[] = [];
    for (let r = 0; r < 7; r += 1) {
      const date = isoOf(firstMonday.add(w * 7 + r, "day"));
      const isOutside = date < span.start || date > span.end;
      const count = isOutside ? 0 : (perDay.get(date) ?? 0);
      column.push({
        date,
        count,
        level: isOutside ? 0 : levelOf(count),
        isToday: !isOutside && date === today,
        isPeak: !isOutside && count > 0 && count === maxCount,
        isOutside,
        key: date,
      });
    }
    weeks.push(column);
  }

  const dates: string[] = [];
  for (let d = dayjs(span.start); !d.isAfter(dayjs(span.end)); d = d.add(1, "day")) {
    dates.push(isoOf(d));
  }

  const cellSize: 22 | 18 | 14 = weekCount <= 5 ? 22 : weekCount <= 8 ? 18 : 14;

  return {
    weeks,
    weekCount,
    firstMonday: isoOf(firstMonday),
    lastSunday: isoOf(lastSunday),
    cellSize,
    dates,
    ticks: monthTicksOf(weeks),
  };
}

/** 键盘可漫游的日期序列（= 区间内日期，网格顺序）。 */
export function heatDatesOf(grid: HeatGrid): string[] {
  return [...grid.dates];
}

/**
 * 焦点移动：ArrowRight/ArrowLeft ±1 天，ArrowUp/ArrowDown ±7 天，
 * Home/End 跳到首末；越界停在边界，不循环。未知键原样返回 current。
 */
export function heatMove(
  dates: string[],
  current: string,
  key: "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown" | "Home" | "End" | string,
): string {
  if (dates.length === 0) return current;
  const index = dates.indexOf(current);
  const from = index < 0 ? 0 : index;
  const last = dates.length - 1;
  let next = from;
  switch (key) {
    case "ArrowLeft":
      next = from - 1;
      break;
    case "ArrowRight":
      next = from + 1;
      break;
    case "ArrowUp":
      next = from - 7;
      break;
    case "ArrowDown":
      next = from + 7;
      break;
    case "Home":
      next = 0;
      break;
    case "End":
      next = last;
      break;
    default:
      return current;
  }
  return dates[Math.min(last, Math.max(0, next))];
}
