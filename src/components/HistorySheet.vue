<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import dayjs from "dayjs";
import { CheckCircle2, RotateCcw, Trash2 } from "lucide-vue-next";
import { useDayStore } from "@/stores/day";
import PanelShell from "@/components/PanelShell.vue";
import { dayLabel, t, weekday } from "@/lib/i18n";

const store = useDayStore();
const emit = defineEmits<{ (e: "close"): void }>();

const loading = ref(true);
const ranges = [7, 30, 90] as const;

async function pick(days: number) {
  loading.value = true;
  try {
    await store.loadHistory(days);
  } finally {
    loading.value = false;
  }
}

onMounted(() => pick(store.historyDays));

/** Group by completion date, newest first. */
const groups = computed(() => {
  const map = new Map<string, typeof store.history>();
  for (const task of store.history) {
    const d = (task.doneAt ?? task.updatedAt).slice(0, 10);
    if (!map.has(d)) map.set(d, []);
    map.get(d)!.push(task);
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, items]) => ({
      date,
      items,
      label: dayLabel(date),
      week: weekday(date),
      isToday: date === dayjs().format("YYYY-MM-DD"),
    }));
});

const total = computed(() => store.history.length);

async function undo(id: string) {
  await store.undo(id);
  await pick(store.historyDays);
}

async function drop(id: string) {
  await store.drop(id);
  await pick(store.historyDays);
}
</script>

<template>
  <PanelShell :title="t('history.title')" :subtitle="t('history.subtitle')" @close="emit('close')">
    <!-- Range -->
    <div class="flex items-center justify-between pb-3 pt-0">
      <div class="flex items-center gap-0.5 rounded-xl bg-paper-deep p-1">
        <button
          v-for="r in ranges"
          :key="r"
          class="rounded-lg px-2.5 py-1 text-[12px] transition-all"
          :class="
            store.historyDays === r
              ? 'bg-card text-ink shadow-[0_1px_3px_rgba(34,30,25,0.08)]'
              : 'text-ink-soft hover:text-ink'
          "
          @click="pick(r)"
        >
          {{ t("history.range", { n: r }) }}
        </button>
      </div>
      <span class="text-[11.5px] text-ink-faint">{{ t("history.total", { n: total }) }}</span>
    </div>

    <div class="pb-1">
      <p v-if="loading" class="px-2.5 py-10 text-center text-[12.5px] text-ink-faint">
        {{ t("history.loading") }}
      </p>

      <div v-else-if="!groups.length" class="flex flex-col items-center justify-center py-20">
        <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft">
          <CheckCircle2 :size="20" :stroke-width="1.6" class="text-accent" />
        </div>
        <p class="mt-4 text-[13.5px] text-ink-soft">{{ t("history.emptyTitle") }}</p>
        <p class="mt-1 text-[12px] text-ink-faint">{{ t("history.emptyHint") }}</p>
      </div>

      <section v-for="g in groups" :key="g.date" class="mb-5">
        <h3 class="mb-1 flex items-baseline gap-2 px-2.5">
          <span class="text-[12px] font-medium tracking-[0.06em] text-ink-soft">{{ g.label }}</span>
          <span class="text-[11px] text-ink-faint">{{ g.week }}</span>
          <span
            v-if="g.isToday"
            class="rounded-md bg-accent-soft px-1.5 py-0.5 text-[10.5px] text-accent"
          >
            {{ t("history.today") }}
          </span>
          <span class="ml-auto text-[11px] tabular-nums text-ink-faint">
            {{ t("history.count", { n: g.items.length }) }}
          </span>
        </h3>

        <div
          v-for="task in g.items"
          :key="task.id"
          class="group flex items-start gap-3 rounded-xl px-2.5 py-2 transition-colors hover:bg-card"
        >
          <CheckCircle2 :size="15" :stroke-width="2" class="mt-0.5 shrink-0 text-accent/80" />
          <div class="min-w-0 flex-1">
            <div class="flex items-baseline gap-2">
              <span class="shrink-0 font-display text-[12.5px] tabular-nums text-ink-faint">
                {{ dayjs(task.doneAt ?? task.updatedAt).format("HH:mm") }}
              </span>
              <p class="truncate text-[14px] leading-6 text-ink">{{ task.title }}</p>
              <span
                v-if="task.rollCount > 0"
                class="shrink-0 rounded-full bg-paper-deep px-1.5 py-0.5 text-[10.5px] text-ink-faint"
                :title="t('task.badge.rolledHint', { n: task.rollCount })"
              >
                {{ t("task.badge.rolled", { n: task.rollCount }) }}
              </span>
            </div>
            <p
              v-if="task.note"
              class="mt-0.5 whitespace-pre-wrap text-[12.5px] leading-5 text-ink-faint"
            >
              {{ task.note }}
            </p>
          </div>
          <div class="hidden shrink-0 items-center gap-0.5 group-hover:flex">
            <button
              class="rounded-md p-1.5 text-ink-faint transition-colors hover:bg-paper-deep hover:text-ink"
              :title="t('history.undo')"
              @click="undo(task.id)"
            >
              <RotateCcw :size="13" :stroke-width="1.9" />
            </button>
            <button
              class="rounded-md p-1.5 text-ink-faint transition-colors hover:bg-accent-soft hover:text-accent"
              :title="t('history.delete')"
              @click="drop(task.id)"
            >
              <Trash2 :size="13" :stroke-width="1.9" />
            </button>
          </div>
        </div>
      </section>
    </div>
  </PanelShell>
</template>
