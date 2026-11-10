<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";
import dayjs from "dayjs";
import { ChartColumn } from "lucide-vue-next";
import { api, type StatsRaw } from "@/lib/api";
import { dayLabel, fullDayLabel, isEn, t } from "@/lib/i18n";
import { useDayStore } from "@/stores/day";
import PanelShell from "@/components/PanelShell.vue";
import {
  CLASS_ROWS_SHOWN,
  NO_CLASS,
  classRowsOf,
  entriesOfClass,
  type ClassKind,
} from "@/lib/classes";
import {
  axisBucketsOf,
  axisTicksOf,
  conclusionOf,
  filterEntries,
  groupDoneByDay,
  heatDatesOf,
  heatGridOf,
  heatMove,
  levelOf,
  sparsityOf,
  toView,
  validateRange,
  type AxisBucket,
  type DayGroup,
  type DrillFilter,
  type HeatCell,
  type HeatGrid,
  type StatsView,
} from "@/lib/stats";

/**
 * Read-only review panel. Every number comes from `src/lib/stats.ts`; this file
 * only formats. No writes, no store, no persisted range (contract §6).
 *
 * 003-stats-clarity：结论句 → 可下钻的竖柱图 → 按天分组的明细。
 */
const emit = defineEmits<{ (e: "close"): void }>();

const store = useDayStore();

const presets = [7, 30, 90] as const;
const today = dayjs().format("YYYY-MM-DD");
/** 组内一次最多展开多少条，其余收进「还有 n 条」。 */
const GROUP_ROWS = 10;
/** 打开时默认展开多少组（D4）。 */
const OPEN_GROUPS = 5;

const start = ref(dayjs(today).subtract(29, "day").format("YYYY-MM-DD"));
const end = ref(today);
const preset = ref<number | null>(30);
const custom = ref(false);

const loading = ref(false);
const failed = ref(false);
const raw = ref<StatsRaw | null>(null);
const applied = ref<{ start: string; end: string } | null>(null);

/** Only the last request may land on screen. */
let ticket = 0;

const check = computed(() => validateRange(start.value, end.value, today));

const view = computed<StatsView | null>(() => (raw.value ? toView(raw.value, today) : null));

/* ---------------- 结论句 ---------------- */

const sparsity = computed(() => (view.value ? sparsityOf(view.value) : "none"));

const conclusion = computed(() =>
  view.value ? conclusionOf(view.value, today, raw.value?.done ?? []) : null,
);

/** 结论句 = 件数 + 环比 + 节奏，用一句连接符串起来。 */
const conclusionText = computed(() => {
  const c = conclusion.value;
  const v = view.value;
  if (!c || !v) return "";
  const parts = [t("stats.conclusion", { n: c.done })];
  if (c.compare.state === "none") parts.push(t("stats.conclusionPrevNone"));
  else if (c.compare.state === "flat") parts.push(t("stats.conclusionPrevFlat"));
  else
    parts.push(
      t(c.compare.state === "up" ? "stats.conclusionPrevUp" : "stats.conclusionPrevDown", {
        n: Math.abs(c.compare.delta),
      }),
    );
  // 周/月桶答不出「最忙的一天」，这一句就省略，不编一个假的。
  if (v.granularity === "day" && c.peak) {
    const rhythm = [
      t("stats.conclusionPeak", { d: dayLabel(c.peak.date), n: c.peak.count }),
      c.gapDays > 0 ? t("stats.conclusionGap", { n: c.gapDays }) : t("stats.conclusionNoGap"),
    ];
    parts.push(rhythm.join(t("stats.conclusionJoin")));
  }
  return parts.join(t("stats.conclusionJoin"));
});

const rangeLabel = computed(() =>
  applied.value ? `${applied.value.start} → ${applied.value.end}` : `${start.value} → ${end.value}`,
);

const granularityLabel = computed(() => {
  const granularity = view.value?.granularity ?? "day";
  return t(granularity === "day" ? "stats.byDay" : granularity === "week" ? "stats.byWeek" : "stats.byMonth");
});

/* ---------------- 图形 ---------------- */

const axis = computed<AxisBucket[]>(() => (view.value ? axisBucketsOf(view.value, today) : []));
const ticks = computed(() => axisTicksOf(view.value?.maxCount ?? 0));

/* ---------------- 日历热力图（004 / FR-001…FR-009） ---------------- */

/** 天档才画热力图；周/月档继续用 003 的竖柱。 */
const isDay = computed(() => (view.value?.granularity ?? "day") === "day");

const heat = computed<HeatGrid | null>(() =>
  view.value && isDay.value && applied.value
    ? heatGridOf(axis.value, applied.value, today)
    : null,
);
const heatDates = computed(() => (heat.value ? heatDatesOf(heat.value) : []));
const heatCells = computed(() => (heat.value ? heat.value.weeks.flat() : []));
const monthTicks = computed(() => heat.value?.ticks ?? []);

const cellPx = computed(() => heat.value?.cellSize ?? 14);
const CELL_GAP = 3;
const gridWidth = computed(() => {
  const n = heat.value?.weekCount ?? 0;
  return n > 0 ? n * cellPx.value + (n - 1) * CELL_GAP : 0;
});
const gridStyle = computed(() => ({
  gridTemplateRows: `repeat(7, ${cellPx.value}px)`,
  gridAutoFlow: "column",
  gridAutoColumns: `${cellPx.value}px`,
  columnGap: `${CELL_GAP}px`,
  rowGap: `${CELL_GAP}px`,
}));

/** 五档：全部由 accent 的不透明度派生，换主色时不用改这里（R2）。 */
function levelClass(level: number): string {
  const safe = levelOf(level);
  return ["bg-line-soft", "bg-accent/20", "bg-accent/40", "bg-accent/65", "bg-accent"][safe];
}

function cellStyle() {
  return { width: `${cellPx.value}px`, height: `${cellPx.value}px` };
}

function monthLabel(monthKey: string): string {
  const month = Number(monthKey.slice(5, 7));
  return isEn.value ? dayjs(`${monthKey}-01`).format("MMM") : `${month}月`;
}

function tickWidth(span: number): string {
  return `${span * cellPx.value + (span - 1) * CELL_GAP}px`;
}

const activeDate = ref<string | null>(null);
const heatGridEl = ref<HTMLElement | null>(null);
const heatTooltipOpen = ref(false);

const activeHeatCell = computed(
  () => heatCells.value.find((cell) => cell.date === activeDate.value) ?? null,
);

/** 提示框跟着那一列走，左右各留 10% 躲开面板边缘（FR-008）。 */
const heatTooltipStyle = computed(() => {
  const n = heat.value?.weekCount ?? 0;
  const index = heatDates.value.indexOf(activeDate.value ?? "");
  const column = index >= 0 ? Math.floor(index / 7) : 0;
  const x = n > 0 ? ((column + 0.5) / n) * 100 : 50;
  return { left: `${Math.min(90, Math.max(10, x))}%` };
});

function heatAria(cell: HeatCell): string {
  const share = t("stats.hoverShare", {
    p: view.value && view.value.doneTotal > 0 ? Math.round((cell.count / view.value.doneTotal) * 100) : 0,
  });
  return [fullDayLabel(cell.date), t("stats.hoverCount", { n: cell.count }), share].join("　");
}

function focusHeat(date: string) {
  activeDate.value = date;
  heatTooltipOpen.value = true;
  void nextTick(() => {
    heatGridEl.value?.querySelector<HTMLElement>(`[data-heat-key="${date}"]`)?.focus();
  });
}

function onHeatKey(event: KeyboardEvent) {
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
    return;
  }
  event.preventDefault();
  focusHeat(heatMove(heatDates.value, activeDate.value ?? "", event.key));
  // Enter / Space 交给原生 button，不在这里再切一次（否则双触发）。
}

function toggleHeatDrill(cell: HeatCell) {
  filter.value =
    filter.value?.key === cell.date
      ? null
      : { key: cell.date, start: cell.date, end: cell.date };
  activeDate.value = cell.date;
  resetGroups();
}

/* ---------------- 指标卡（004 / FR-010…FR-012） ---------------- */

/** 不可用的值显示「—」，绝不出现 NaN / Infinity / 空串（FR-011）。 */
const streakValue = computed(() =>
  view.value && view.value.streak > 0 ? String(view.value.streak) : t("stats.metricUnavailable"),
);

const compareValue = computed(() => {
  const compare = view.value?.compare;
  if (!compare || compare.state === "none") return t("stats.metricUnavailable");
  if (compare.delta === 0) return "0";
  return `${compare.delta > 0 ? "+" : "−"}${Math.abs(compare.delta)}`;
});

/** 四张等宽指标卡：主数值 + 标签 + 一句补充（FR-010）。 */
const cards = computed(() => {
  const v = view.value;
  if (!v) return [];
  return [
    {
      key: "average",
      label: t("stats.cardAverage"),
      value: v.average.toFixed(1),
      sub: t("stats.total", { n: v.doneTotal }),
      live: false,
    },
    {
      key: "streak",
      label: t("stats.cardStreak"),
      value: streakValue.value,
      sub: v.streak > 0 ? t("stats.conclusionNoGap") : t("stats.streakNone"),
      live: false,
    },
    {
      key: "compare",
      label: t("stats.cardCompare"),
      value: compareValue.value,
      sub:
        v.compare.prevTotal > 0
          ? t("stats.compare", { n: v.compare.prevTotal })
          : t("stats.compareNoBase"),
      live: false,
    },
    {
      key: "backlog",
      label: t("stats.cardBacklog"),
      value: String(v.backlog),
      sub: t("stats.backlogHint"),
      live: true,
    },
  ];
});

/** 热力图行标签：只标周一/三/五（§4）。 */
const weekdayRows = computed(() => [
  t("stats.weekdayMon"),
  "",
  t("stats.weekdayWed"),
  "",
  t("stats.weekdayFri"),
  "",
  "",
]);

const activeBarKey = ref<string | null>(null);
const tooltipOpen = ref(false);
const barGroup = ref<HTMLElement | null>(null);

const activeIndex = computed(() => axis.value.findIndex((b) => b.key === activeBarKey.value));
const activeBar = computed(() => (activeIndex.value >= 0 ? axis.value[activeIndex.value] : null));

/** 筛选提示：单日桶不必写两次日期。 */
const filterText = computed(() => {
  const f = filter.value;
  if (!f) return "";
  return f.start === f.end
    ? t("stats.filterActiveDay", { from: fullDayLabel(f.start) })
    : t("stats.filterActive", { from: fullDayLabel(f.start), to: fullDayLabel(f.end) });
});

/** 提示框跟着当前桶走，靠左右各留 12% 躲开面板边缘。 */
const tooltipStyle = computed(() => {
  const n = axis.value.length;
  const x = n > 0 && activeIndex.value >= 0 ? ((activeIndex.value + 0.5) / n) * 100 : 50;
  return { left: `${Math.min(88, Math.max(12, x))}%` };
});

function barLabel(b: AxisBucket): string {
  const range = b.start === b.end ? fullDayLabel(b.start) : `${fullDayLabel(b.start)} → ${fullDayLabel(b.end)}`;
  const share = t("stats.hoverShare", { p: Math.round(b.share * 100) });
  return [range, t("stats.hoverCount", { n: b.count }), share].join("，");
}

function focusBar(key: string) {
  activeBarKey.value = key;
  tooltipOpen.value = true;
  void nextTick(() => {
    const el = barGroup.value?.querySelector<HTMLElement>(`[data-bar-key="${key}"]`);
    el?.focus();
  });
}

function onBarKey(event: KeyboardEvent, index: number) {
  const bars = axis.value;
  if (!bars.length) return;
  if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
    event.preventDefault();
    const step = event.key === "ArrowRight" ? 1 : -1;
    focusBar(bars[Math.min(bars.length - 1, Math.max(0, index + step))].key);
  } else if (event.key === "Home" || event.key === "End") {
    event.preventDefault();
    focusBar(bars[event.key === "Home" ? 0 : bars.length - 1].key);
  }
  // Enter / Space 交给原生 button 的 click，不在这里再切一次（否则双触发）。
}

/* ---------------- 下钻 ---------------- */

const filter = ref<DrillFilter | null>(null);

/** 分类维度（005）：项目 / 标签，与时间下钻可叠加。 */
const classKind = ref<ClassKind>("project");
const classFilter = ref<{ kind: ClassKind; key: string } | null>(null);
const showAllClasses = ref(false);

const classRows = computed(() => {
  const rows = classRowsOf(raw.value?.done ?? [], classKind.value, store.projects, store.tags);
  return showAllClasses.value ? rows : rows.slice(0, CLASS_ROWS_SHOWN);
});
const classRowTotal = computed(
  () => classRowsOf(raw.value?.done ?? [], classKind.value, store.projects, store.tags).length,
);
const className = computed(() => {
  const picked = classFilter.value;
  if (!picked) return "";
  if (picked.key === NO_CLASS) return t("stats.unclassified");
  const pool = picked.kind === "project" ? store.projects : store.tags;
  return pool.find((x) => x.id === picked.key)?.name ?? "";
});

function rowName(key: string, name: string) {
  return key === NO_CLASS ? t("stats.unclassified") : name;
}

function pickClass(key: string) {
  classFilter.value =
    classFilter.value?.kind === classKind.value && classFilter.value.key === key
      ? null
      : { kind: classKind.value, key };
  resetGroups();
}

function clearClassFilter() {
  classFilter.value = null;
  resetGroups();
}

function switchClassKind(kind: ClassKind) {
  classKind.value = kind;
  showAllClasses.value = false;
  if (classFilter.value && classFilter.value.kind !== kind) classFilter.value = null;
}

const filtered = computed(() => {
  let list = filterEntries(raw.value?.done ?? [], filter.value);
  const picked = classFilter.value;
  if (picked) list = entriesOfClass(list, picked.kind, picked.key, store.projects, store.tags);
  return list;
});

function toggleDrill(b: AxisBucket) {
  filter.value =
    filter.value?.key === b.key ? null : { key: b.key, start: b.start, end: b.end };
  activeBarKey.value = b.key;
  resetGroups();
}

function clearFilter() {
  filter.value = null;
  resetGroups();
}

/* ---------------- 明细分组 ---------------- */

const groups = computed(() => groupDoneByDay(filtered.value));
const expandedGroups = ref<Set<string>>(new Set());
const openRows = ref<Set<string>>(new Set());
const allGroupsOpen = ref(false);

const visibleGroups = computed(() =>
  allGroupsOpen.value ? groups.value : groups.value.filter((g) => expandedGroups.value.has(g.date)),
);
const hiddenGroups = computed(() => groups.value.length - visibleGroups.value.length);

function shownEntries(group: DayGroup) {
  return openRows.value.has(group.date) ? group.entries : group.entries.slice(0, GROUP_ROWS);
}

function resetGroups() {
  expandedGroups.value = new Set(groups.value.slice(0, OPEN_GROUPS).map((g) => g.date));
  openRows.value = new Set();
  allGroupsOpen.value = false;
}

function toggleGroup(date: string) {
  const next = new Set(expandedGroups.value);
  if (next.has(date)) next.delete(date);
  else next.add(date);
  expandedGroups.value = next;
}

function toggleRows(date: string) {
  const next = new Set(openRows.value);
  if (next.has(date)) next.delete(date);
  else next.add(date);
  openRows.value = next;
}

/* ---------------- 脚注 ---------------- */

const footnoteOpen = ref(false);

/* ---------------- 数据 ---------------- */

const presetButtons = ref<HTMLButtonElement[]>([]);

async function load() {
  const range = check.value;
  if (!range.ok) return;
  const mine = (ticket += 1);
  loading.value = true;
  failed.value = false;
  try {
    const data = await api.getStats(range.start, range.end);
    if (mine !== ticket) return; // a newer range is on its way
    raw.value = data;
    applied.value = { start: data.span.start, end: data.span.end };
    filter.value = null;
    classFilter.value = null;
    resetGroups();
    const firstPeak = axis.value.find((b) => b.isPeak) ?? axis.value[0];
    activeBarKey.value = firstPeak ? firstPeak.key : null;
    tooltipOpen.value = false;
    activeDate.value =
      heat.value?.weeks.flat().find((cell) => cell.isPeak)?.date ??
      heat.value?.dates.at(-1) ??
      null;
    heatTooltipOpen.value = false;
  } catch {
    if (mine !== ticket) return;
    // Quiet failure: keep the last result, never a dialog (contract §4).
    failed.value = true;
  } finally {
    if (mine === ticket) loading.value = false;
  }
}

function pickPreset(n: number) {
  preset.value = n;
  activeSpan.value = null;
  custom.value = false;
  end.value = today;
  start.value = dayjs(today).subtract(n - 1, "day").format("YYYY-MM-DD");
  filter.value = null;
  classFilter.value = null;
  void load();
}

/** 本季/本月/本年——季度手算，不引 dayjs 的插件（宪法：不增依赖）。 */
function quarterStart(todayStr: string): string {
  const d = dayjs(todayStr);
  const month = Math.floor(d.month() / 3) * 3;
  return d.month(month).startOf("month").format("YYYY-MM-DD");
}

const spans = computed(() => [
  { key: "month", label: t("stats.rangeMonth"), start: dayjs(today).startOf("month").format("YYYY-MM-DD") },
  { key: "quarter", label: t("stats.rangeQuarter"), start: quarterStart(today) },
  { key: "year", label: t("stats.rangeYear"), start: dayjs(today).startOf("year").format("YYYY-MM-DD") },
]);

const activeSpan = ref<string | null>(null);

function pickSpan(key: string, from: string) {
  activeSpan.value = key;
  preset.value = null;
  custom.value = false;
  end.value = today;
  start.value = from;
  filter.value = null;
  classFilter.value = null;
  void load();
}

function onEdit() {
  preset.value = null;
  activeSpan.value = null;
  filter.value = null;
  classFilter.value = null;
  void load();
}

onMounted(async () => {
  void store.loadClasses(true);
  await load();
  await nextTick();
  presetButtons.value[1]?.focus();
});

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-1 focus-visible:ring-offset-card";
</script>

<template>
  <PanelShell :title="t('stats.title')" :subtitle="t('stats.subtitle')" @close="emit('close')">
    <!-- Range -->
    <div class="flex items-center justify-between pb-2 pt-0">
      <div class="flex items-center gap-0.5 rounded-xl bg-paper-deep p-1">
        <button
          v-for="(r, i) in presets"
          :key="r"
          :ref="(el) => (presetButtons[i] = el as HTMLButtonElement)"
          class="rounded-lg px-2.5 py-1 text-[12px] transition-all"
          :class="[
            preset === r
              ? 'bg-card text-ink shadow-[0_1px_3px_rgba(34,30,25,0.08)]'
              : 'text-ink-soft hover:text-ink',
            focusRing,
          ]"
          @click="pickPreset(r)"
        >
          {{ t("stats.range", { n: r }) }}
        </button>
        <button
          class="rounded-lg px-2.5 py-1 text-[12px] transition-all"
          :class="[
            custom
              ? 'bg-card text-ink shadow-[0_1px_3px_rgba(34,30,25,0.08)]'
              : 'text-ink-soft hover:text-ink',
            focusRing,
          ]"
          @click="custom = !custom"
        >
          {{ t("stats.rangeCustom") }}
        </button>
        <button
          v-for="s in spans"
          :key="s.key"
          class="whitespace-nowrap rounded-lg px-2 py-1 text-[11.5px] transition-all"
          :class="[
            activeSpan === s.key
              ? 'bg-card text-ink shadow-[0_1px_3px_rgba(34,30,25,0.08)]'
              : 'text-ink-soft hover:text-ink',
            focusRing,
          ]"
          @click="pickSpan(s.key, s.start)"
        >
          {{ s.label }}
        </button>
      </div>
      <span class="text-[11px] tabular-nums text-ink-faint">{{ rangeLabel }}</span>
    </div>

    <div v-if="custom" class="flex flex-wrap items-center gap-2 px-8 pb-2">
      <label class="flex items-center gap-1.5 text-[11.5px] text-ink-faint">
        {{ t("stats.from") }}
        <input
          v-model="start"
          type="date"
          :max="today"
          class="rounded-lg border border-line bg-card px-2 py-1 text-[12px] tabular-nums text-ink"
          @change="onEdit"
        />
      </label>
      <label class="flex items-center gap-1.5 text-[11.5px] text-ink-faint">
        {{ t("stats.to") }}
        <input
          v-model="end"
          type="date"
          class="rounded-lg border border-line bg-card px-2 py-1 text-[12px] tabular-nums text-ink"
          @change="onEdit"
        />
      </label>
      <span v-if="!check.ok" class="text-[11.5px] text-warn">{{ t("stats.rangeInvalid") }}</span>
    </div>

    <div class="pb-1">
      <p v-if="failed" class="mb-2 rounded-xl bg-warn-soft/60 px-3 py-2 text-[11.5px] text-warn">
        {{ t("stats.error") }}
      </p>
      <p v-if="raw?.clamped" class="mb-2 px-3 text-[11.5px] text-ink-faint">
        {{ t("stats.rangeClamped") }}
      </p>

      <p v-if="loading && !view" class="px-2.5 py-10 text-center text-[12.5px] text-ink-faint">
        {{ t("history.loading") }}
      </p>

      <!-- 数据太少：分档说人话，不画一根孤零零的柱子 -->
      <div
        v-else-if="view && sparsity !== 'ok'"
        class="flex flex-col items-center justify-center py-16 text-center"
      >
        <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft">
          <ChartColumn :size="20" :stroke-width="1.6" class="text-accent" />
        </div>
        <p class="mt-4 max-w-[22rem] text-[13.5px] leading-6 text-ink-soft">
          <template v-if="sparsity === 'none'">{{ t("stats.emptyNone") }}</template>
          <template v-else-if="sparsity === 'undatedOnly'">
            {{ t("stats.groupUndated", { n: view.undated }) }}
          </template>
          <template v-else-if="sparsity === 'one'">{{ t("stats.emptyOne") }}</template>
          <template v-else>
            {{ t("stats.emptyFew", { n: axis.filter((b) => b.count > 0).length }) }}
          </template>
        </p>
        <p class="mt-1.5 text-[12px] text-ink-faint">{{ t("stats.emptyNextHint") }}</p>

        <!-- 完成记录太少，但「老被推后」仍然值得看 -->
        <div v-if="view.rolled.length" class="mt-8 w-full max-w-[30rem]">
          <h3 class="mb-1 px-2.5 text-left text-[11px] font-medium tracking-[0.1em] text-ink-faint">
            {{ t("stats.rolled") }}
          </h3>
          <div class="space-y-0.5 text-left">
            <div
              v-for="item in view.rolled"
              :key="item.id"
              class="flex items-baseline gap-3 rounded-xl px-2.5 py-1.5"
            >
              <span class="min-w-0 flex-1 truncate text-[13.5px] text-ink">{{ item.title }}</span>
              <span class="shrink-0 rounded-full bg-paper-deep px-1.5 py-0.5 text-[10.5px] tabular-nums text-ink-soft">
                {{ t("stats.rolledCount", { n: item.rollCount }) }}
              </span>
              <span class="shrink-0 text-[11px] tabular-nums text-ink-faint">
                {{ t("stats.rolledLast", { d: dayLabel(item.lastRolledAt) }) }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <template v-else-if="view && conclusion">
        <!-- 结论句：第一眼就知道这段时间怎么样 -->
        <section class="mb-5 rounded-2xl bg-card px-4 py-3.5">
          <p class="font-display text-[14px] leading-7 text-ink">{{ conclusionText }}</p>
          <p v-if="view.undated" class="mt-1 text-[11.5px] text-ink-faint">
            {{ t("stats.undated", { n: view.undated }) }}
          </p>
          <div class="mt-3 grid grid-cols-2 gap-2 min-[620px]:grid-cols-4">
            <div v-for="card in cards" :key="card.key" class="rounded-xl bg-paper-deep px-2.5 py-2">
              <p class="flex items-baseline gap-1 text-[10.5px] leading-4 text-ink-faint">
                <span>{{ card.label }}</span>
                <span v-if="card.live" class="rounded-full bg-warn-soft px-1 text-[9.5px] leading-4 text-warn">
                  {{ t("stats.realtime") }}
                </span>
              </p>
              <p class="font-display text-[19px] leading-7 tabular-nums text-ink">{{ card.value }}</p>
              <p class="text-[10.5px] leading-4 text-ink-faint">{{ card.sub }}</p>
            </div>
          </div>
        </section>

        <!-- 分类（005）：按项目 / 按标签，点一行只看这一类 -->
        <section class="mb-5">
          <h3 class="mb-2 flex items-center gap-2 px-2.5">
            <span class="text-[11px] font-medium tracking-[0.1em] text-ink-faint">
              {{ classKind === "project" ? t("stats.byProject") : t("stats.byTag") }}
            </span>
            <div class="flex items-center gap-0.5 rounded-lg bg-paper-deep p-0.5">
              <button
                class="rounded-md px-2 py-0.5 text-[11px] transition-colors"
                :class="[
                  classKind === 'project' ? 'bg-card text-ink shadow-[0_1px_3px_rgba(34,30,25,0.08)]' : 'text-ink-faint hover:text-ink',
                  focusRing,
                ]"
                @click="switchClassKind('project')"
              >
                {{ t("stats.byProject") }}
              </button>
              <button
                class="rounded-md px-2 py-0.5 text-[11px] transition-colors"
                :class="[
                  classKind === 'tag' ? 'bg-card text-ink shadow-[0_1px_3px_rgba(34,30,25,0.08)]' : 'text-ink-faint hover:text-ink',
                  focusRing,
                ]"
                @click="switchClassKind('tag')"
              >
                {{ t("stats.byTag") }}
              </button>
            </div>
          </h3>

          <div class="rounded-2xl bg-card px-3 py-2.5">
            <div v-if="!classRowTotal" class="px-1 py-3 text-center">
              <p class="text-[12.5px] text-ink-soft">{{ t("stats.classEmpty") }}</p>
              <p class="mt-1 text-[11px] text-ink-faint">{{ t("stats.classEmptyHint") }}</p>
            </div>
            <template v-else>
              <button
                v-for="row in classRows"
                :key="row.key"
                class="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-paper-deep"
                :class="[classFilter?.key === row.key ? 'bg-accent-soft' : '', focusRing]"
                :aria-pressed="classFilter?.key === row.key"
                @click="pickClass(row.key)"
              >
                <span
                  class="min-w-0 flex-1 truncate text-[12.5px]"
                  :class="row.key === NO_CLASS ? 'text-ink-faint' : 'text-ink'"
                >
                  {{ rowName(row.key, row.name) }}
                </span>
                <span class="h-1 w-14 shrink-0 overflow-hidden rounded-full bg-paper-deep">
                  <span
                    class="block h-full rounded-full bg-accent/60"
                    :style="{ width: `${Math.max(2, Math.round(row.share * 100))}%` }"
                  />
                </span>
                <span class="w-8 shrink-0 text-right text-[11.5px] tabular-nums text-ink-soft">
                  {{ row.count }}
                </span>
                <span class="w-8 shrink-0 text-right text-[10.5px] tabular-nums text-ink-faint">
                  {{ Math.round(row.share * 100) }}%
                </span>
              </button>

              <div class="mt-1 flex items-center justify-between px-1.5">
                <button
                  v-if="classRowTotal > classRows.length"
                  :class="['text-[11px] text-accent hover:underline', focusRing]"
                  @click="showAllClasses = true"
                >
                  {{ t("stats.classMore", { n: classRowTotal - classRows.length }) }}
                </button>
                <button
                  v-else-if="showAllClasses && classRowTotal > CLASS_ROWS_SHOWN"
                  :class="['text-[11px] text-ink-faint hover:text-ink', focusRing]"
                  @click="showAllClasses = false"
                >
                  {{ t("stats.classCollapse") }}
                </button>
                <span v-else />
                <span v-if="view.undated" class="text-[10.5px] text-ink-faint">
                  {{ t("stats.classUndated", { n: view.undated }) }}
                </span>
              </div>
            </template>
          </div>
        </section>
        <section class="mb-5">
          <h3 class="mb-2 flex items-baseline gap-2 px-2.5">
            <span class="text-[11px] font-medium tracking-[0.1em] text-ink-faint">{{ t("stats.perDay") }}</span>
            <span class="rounded-full bg-paper-deep px-1.5 py-0.5 text-[10.5px] text-ink-faint">
              {{ granularityLabel }}
            </span>
            <span class="ml-auto text-[10.5px] tabular-nums text-ink-faint">
              {{ fullDayLabel(view.prev.start) }} → {{ fullDayLabel(view.prev.end) }}
            </span>
          </h3>

          <p v-if="filter" class="mb-2 flex items-center gap-2 px-2.5 text-[11.5px] text-ink-soft">
            <span class="truncate">{{ filterText }}</span>
            <button :class="['rounded-md px-1.5 py-0.5 text-[11px] text-accent hover:bg-accent-soft', focusRing]" @click="clearFilter">
              {{ t("stats.filterClear") }}
            </button>
          </p>

          <p v-if="classFilter" class="mb-2 flex items-center gap-2 px-2.5 text-[11.5px] text-ink-soft">
            <span class="truncate">{{ className }}</span>
            <button
              :class="['rounded-md px-1.5 py-0.5 text-[11px] text-accent hover:bg-accent-soft', focusRing]"
              @click="clearClassFilter"
            >
              {{ t("stats.filterClassClear") }}
            </button>
          </p>

          <div
            :key="`${applied?.start ?? ''}-${applied?.end ?? ''}`"
            class="fade-swap relative min-h-[168px] rounded-2xl bg-card px-4 pb-3 pt-8"
          >
            <!-- 天档：日历热力图（004 / FR-001…FR-009） -->
            <template v-if="isDay && heat">
              <div
                v-if="activeHeatCell && heatTooltipOpen"
                class="pointer-events-none absolute top-1 z-10 -translate-x-1/2 rounded-lg bg-ink px-2 py-1 text-[10.5px] leading-4 text-paper shadow-[0_2px_8px_rgba(34,30,25,0.18)]"
                :style="heatTooltipStyle"
              >
                <p class="tabular-nums">{{ fullDayLabel(activeHeatCell.date) }}</p>
                <p class="tabular-nums opacity-80">
                  {{ t("stats.hoverCount", { n: activeHeatCell.count }) }} ·
                  {{ t("stats.hoverShare", { p: view.doneTotal > 0 ? Math.round((activeHeatCell.count / view.doneTotal) * 100) : 0 }) }}
                </p>
              </div>

              <div class="flex justify-center">
                <div>
                  <!-- 月标签：宽度按列宽算，和网格同一套几何 -->
                  <div
                    class="mb-1 flex h-4 items-end"
                    :style="{ width: `${gridWidth}px`, marginLeft: '18px' }"
                    aria-hidden="true"
                  >
                    <div
                      v-for="tick in monthTicks"
                      :key="tick.monthKey"
                      class="overflow-hidden pl-0.5 text-[10.5px] leading-none text-ink-faint"
                      :style="{ width: tickWidth(tick.span) }"
                    >
                      {{ monthLabel(tick.monthKey) }}
                    </div>
                  </div>

                  <div class="flex items-start gap-[4px]">
                    <div
                      class="flex flex-col"
                      :style="{ gap: `${CELL_GAP}px` }"
                      aria-hidden="true"
                    >
                      <span
                        v-for="(label, row) in weekdayRows"
                        :key="row"
                        class="flex w-[14px] items-center justify-end pr-1 text-[9.5px] leading-none text-ink-faint"
                        :style="{ height: `${cellPx}px` }"
                      >
                        {{ label }}
                      </span>
                    </div>

                    <div
                      ref="heatGridEl"
                      role="group"
                      :aria-label="`${granularityLabel} · ${rangeLabel}`"
                      class="grid"
                      :style="[gridStyle, { width: `${gridWidth}px` }]"
                    >
                      <template v-for="cell in heatCells" :key="cell.key">
                        <button
                          v-if="!cell.isOutside"
                          :data-heat-key="cell.date"
                          :tabindex="activeDate === cell.date ? 0 : -1"
                          :aria-label="heatAria(cell)"
                          :aria-pressed="filter?.key === cell.date"
                          :aria-current="cell.isToday ? 'date' : undefined"
                          class="relative rounded-[3px] transition-colors hover:opacity-80"
                          :class="[
                            levelClass(cell.level),
                            cell.isToday ? 'ring-1 ring-ink/55 ring-offset-1 ring-offset-card' : '',
                            focusRing,
                          ]"
                          :style="cellStyle()"
                          @click="toggleHeatDrill(cell)"
                          @mouseenter="activeDate = cell.date; heatTooltipOpen = true"
                          @mouseleave="heatTooltipOpen = false"
                          @focus="activeDate = cell.date; heatTooltipOpen = true"
                          @blur="heatTooltipOpen = false"
                          @keydown="onHeatKey"
                        >
                          <span
                            v-if="cell.isPeak"
                            class="absolute right-[2px] top-[2px] h-[4px] w-[4px] rounded-full"
                            :class="cell.level >= 3 ? 'bg-card/90' : 'bg-ink/60'"
                          ></span>
                        </button>
                        <div
                          v-else
                          class="rounded-[3px]"
                          :style="cellStyle()"
                          aria-hidden="true"
                        ></div>
                      </template>
                    </div>
                  </div>

                  <!-- 图例：颜色含义靠形状重复一遍，不单靠色深（FR-004 / SC-006） -->
                  <div class="mt-2.5 flex items-center gap-1 text-[10.5px] text-ink-faint">
                    <span>{{ t("stats.heatLegendLess") }}</span>
                    <span
                      v-for="level in [0, 1, 2, 3, 4]"
                      :key="level"
                      class="h-[10px] w-[10px] rounded-[2px]"
                      :class="levelClass(level)"
                    ></span>
                    <span>{{ t("stats.heatLegendMore") }}</span>
                    <span class="ml-auto tabular-nums">
                      {{ t("stats.heatToday") }} · {{ t("stats.heatPeak") }} · ≥7
                    </span>
                  </div>
                </div>
              </div>
            </template>

            <!-- 周/月档：保持 003 的竖柱 -->
            <template v-else>
              <!-- 提示框 -->
            <div
              v-if="activeBar && tooltipOpen"
              class="pointer-events-none absolute top-1 z-10 -translate-x-1/2 rounded-lg bg-ink px-2 py-1 text-[10.5px] leading-4 text-paper shadow-[0_2px_8px_rgba(34,30,25,0.18)]"
              :style="tooltipStyle"
            >
              <p class="tabular-nums">
                {{ activeBar.start === activeBar.end ? fullDayLabel(activeBar.start) : `${fullDayLabel(activeBar.start)} → ${fullDayLabel(activeBar.end)}` }}
              </p>
              <p class="tabular-nums opacity-80">
                {{ t("stats.hoverCount", { n: activeBar.count }) }} ·
                {{ t("stats.hoverShare", { p: Math.round(activeBar.share * 100) }) }}
              </p>
            </div>

            <div class="relative">
              <!-- 刻度线：0 / 中 / 最大 -->
              <div class="pointer-events-none absolute inset-0 flex flex-col justify-between">
                <div class="flex items-center gap-2">
                  <div class="h-px flex-1 bg-line-soft"></div>
                  <span class="w-7 text-right text-[10.5px] tabular-nums text-ink-faint">{{ ticks[2] }}</span>
                </div>
                <div class="flex items-center gap-2">
                  <div class="h-px flex-1 border-t border-dashed border-line-soft"></div>
                  <span class="w-7 text-right text-[10.5px] tabular-nums text-ink-faint">{{ ticks[1] }}</span>
                </div>
                <div class="flex items-center gap-2">
                  <div class="h-px flex-1 bg-line"></div>
                  <span class="w-7 text-right text-[10.5px] tabular-nums text-ink-faint">{{ ticks[0] }}</span>
                </div>
              </div>

              <div
                ref="barGroup"
                role="group"
                :aria-label="granularityLabel"
                class="relative flex h-24 items-end gap-px pr-9"
              >
                <button
                  v-for="(b, i) in axis"
                  :key="b.key"
                  :data-bar-key="b.key"
                  :tabindex="activeBarKey === b.key ? 0 : -1"
                  :aria-label="barLabel(b)"
                  :aria-pressed="filter?.key === b.key"
                  :class="['group relative flex h-full min-w-0 flex-1 items-end justify-center rounded-sm', focusRing]"
                  @mouseenter="activeBarKey = b.key; tooltipOpen = true"
                  @mouseleave="tooltipOpen = false"
                  @focus="activeBarKey = b.key; tooltipOpen = true"
                  @blur="tooltipOpen = false"
                  @keydown="onBarKey($event, i)"
                  @click="toggleDrill(b)"
                >
                  <span
                    v-if="b.isPeak"
                    class="absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-accent-soft px-1 text-[10.5px] leading-4 text-accent"
                    :style="{ bottom: `calc(${b.heightPct}% + 3px)` }"
                  >
                    {{ t("stats.peakBadge") }}
                  </span>
                  <span
                    class="w-full rounded-t-[3px] transition-colors"
                    :class="[
                      b.isZero ? 'bg-line' : 'bg-accent/70 group-hover:bg-accent',
                      filter?.key === b.key ? 'bg-accent' : '',
                    ]"
                    :style="{ height: b.isZero ? '2px' : `${b.heightPct}%` }"
                  ></span>
                  <span
                    v-if="b.isPartial"
                    class="absolute left-1/2 -bottom-2 h-[3px] w-[3px] -translate-x-1/2 rounded-full bg-warn"
                    :title="t('stats.partialDay')"
                  ></span>
                </button>
              </div>
            </div>

            <div class="mt-2 flex items-baseline justify-between pr-9 text-[10.5px] tabular-nums text-ink-faint">
              <span>{{ axis[0]?.label ?? "" }}</span>
              <span v-if="axis.length > 2">{{ axis[Math.floor(axis.length / 2)]?.label }}</span>
              <span>{{ axis[axis.length - 1]?.label ?? "" }}</span>
            </div>
            <p v-if="axis.some((b) => b.isPartial)" class="mt-1 pr-9 text-right text-[10.5px] text-warn/80">
              {{ t("stats.partialDay") }}
            </p>
            </template>
          </div>
        </section>

        <!-- Kept getting pushed back -->
        <section class="mb-5">
          <h3 class="mb-1.5 px-2.5 text-[11px] font-medium tracking-[0.1em] text-ink-faint">
            {{ t("stats.rolled") }}
          </h3>
          <p v-if="!view.rolled.length" class="px-2.5 text-[12px] text-ink-faint">
            {{ t("stats.rolledEmpty") }}
          </p>
          <div v-else class="space-y-0.5">
            <div
              v-for="item in view.rolled"
              :key="item.id"
              class="flex items-baseline gap-3 rounded-xl px-2.5 py-1.5"
            >
              <span class="min-w-0 flex-1 truncate text-[13.5px] text-ink">{{ item.title }}</span>
              <span class="shrink-0 rounded-full bg-paper-deep px-1.5 py-0.5 text-[10.5px] tabular-nums text-ink-soft">
                {{ t("stats.rolledCount", { n: item.rollCount }) }}
              </span>
              <span class="shrink-0 text-[11px] tabular-nums text-ink-faint">
                {{ t("stats.rolledLast", { d: dayLabel(item.lastRolledAt) }) }}
              </span>
            </div>
          </div>
        </section>

        <!-- 明细：按天分组，可折叠 -->
        <section class="mb-2">
          <h3 class="mb-1.5 flex items-baseline gap-2 px-2.5">
            <span class="text-[11px] font-medium tracking-[0.1em] text-ink-faint">{{ t("stats.detail") }}</span>
            <span class="text-[10.5px] tabular-nums text-ink-faint">
              {{ t("stats.groupCount", { n: filtered.length }) }}
            </span>
          </h3>

          <p v-if="!filtered.length" class="px-2.5 text-[12px] text-ink-faint">
            {{ filter ? t("stats.filterEmpty") : t("stats.empty") }}
          </p>

          <div v-else class="space-y-1">
            <div v-for="g in visibleGroups" :key="g.date" class="rounded-xl">
              <button
                :class="[
                  'flex w-full items-baseline gap-2 rounded-xl px-2.5 py-1 text-left hover:bg-paper-deep',
                  focusRing,
                ]"
                :aria-expanded="expandedGroups.has(g.date)"
                @click="toggleGroup(g.date)"
              >
                <span class="font-display text-[11.5px] tabular-nums text-ink-faint">{{ fullDayLabel(g.date) }}</span>
                <span class="text-[11px] tabular-nums text-ink-faint">
                  {{ t("stats.groupCount", { n: g.count }) }}
                </span>
                <span class="ml-auto text-[10.5px] text-ink-faint">
                  {{ expandedGroups.has(g.date) ? t("stats.groupCollapse") : "" }}
                </span>
              </button>

              <div v-if="expandedGroups.has(g.date)" class="space-y-0.5">
                <div
                  v-for="item in shownEntries(g)"
                  :key="item.id"
                  class="flex items-start gap-3 rounded-xl px-2.5 py-1.5"
                >
                  <span class="w-[34px] shrink-0 font-display text-[11px] tabular-nums text-ink-faint">
                    {{ item.doneAt.slice(11, 16) }}
                  </span>
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-[13.5px] leading-6 text-ink">{{ item.title }}</p>
                    <p v-if="item.note" class="whitespace-pre-wrap text-[12px] leading-5 text-ink-faint">
                      {{ item.note }}
                    </p>
                  </div>
                </div>
                <button
                  v-if="g.entries.length > GROUP_ROWS"
                  :class="['ml-[3.4rem] text-[11px] text-accent hover:underline', focusRing]"
                  @click="toggleRows(g.date)"
                >
                  {{ openRows.has(g.date) ? t("stats.groupCollapse") : t("stats.groupMoreItems", { n: g.entries.length - GROUP_ROWS }) }}
                </button>
              </div>
            </div>

            <button
              v-if="hiddenGroups > 0"
              :class="['w-full rounded-xl px-2.5 py-1.5 text-left text-[11.5px] text-accent hover:bg-paper-deep', focusRing]"
              @click="allGroupsOpen = true"
            >
              {{ t("stats.groupMore", { n: hiddenGroups }) }}
            </button>
            <button
              v-else-if="allGroupsOpen && groups.length > OPEN_GROUPS"
              :class="['w-full rounded-xl px-2.5 py-1.5 text-left text-[11.5px] text-ink-faint hover:bg-paper-deep', focusRing]"
              @click="allGroupsOpen = false; resetGroups()"
            >
              {{ t("stats.groupCollapse") }}
            </button>

            <p v-if="view.undated" class="px-2.5 pt-1 text-[11.5px] text-ink-faint">
              {{ t("stats.groupUndated", { n: view.undated }) }}
            </p>
          </div>
        </section>

        <!-- 口径脚注 -->
        <section class="px-2.5 pb-2">
          <button
            :class="['flex items-center gap-1 text-[11px] text-ink-faint hover:text-ink-soft', focusRing]"
            :aria-expanded="footnoteOpen"
            @click="footnoteOpen = !footnoteOpen"
          >
            <span>{{ t("stats.footnoteSummary") }}</span>
            <span class="text-[10.5px]">{{ footnoteOpen ? "▾" : "▸" }}</span>
          </button>
          <ul v-if="footnoteOpen" class="mt-1 space-y-0.5 text-[11px] leading-5 text-ink-faint">
            <li>· {{ t("stats.footnoteRolled") }}</li>
            <li>· {{ t("stats.footnoteBacklog") }}</li>
            <li>· {{ t("stats.footnoteUndated") }}</li>
          </ul>
        </section>
      </template>
    </div>
  </PanelShell>
</template>
