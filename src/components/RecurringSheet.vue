<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";
import dayjs from "dayjs";
import { Plus, Repeat, Trash2 } from "lucide-vue-next";
import { useDayStore } from "@/stores/day";
import PanelShell from "@/components/PanelShell.vue";
import { t } from "@/lib/i18n";
import type { Recurrence } from "@/lib/api";

const store = useDayStore();
const emit = defineEmits<{ (e: "close"): void }>();

const loading = ref(true);
const busy = ref(false);
const error = ref<string | null>(null);
const askDelete = ref<string | null>(null);

const draft = ref("");
const kind = ref<"daily" | "weekly" | "monthly">("daily");
const days = ref<number[]>([]);
const monthDay = ref<number>(dayjs().date());
const titleEl = ref<HTMLInputElement | null>(null);

const rules = computed(() => store.recurrences);
const active = computed(() => rules.value.filter((r) => !r.archived).length);

function scheduleOf(rule: Recurrence): string {
  if (rule.kind === "daily") return t("repeat.daily");
  if (rule.kind === "weekly") {
    return `${t("repeat.weekly")} ${rule.days.map((d) => t(`repeat.weekday${d}` as "repeat.weekday1")).join(" ")}`;
  }
  return `${t("repeat.monthly")} ${rule.monthDay ?? 1}`;
}

/** The next day this rule fires, counted from tomorrow so "today" does not lie. */
function nextOf(rule: Recurrence): string {
  for (let i = 0; i < 400; i += 1) {
    const d = dayjs().add(i, "day");
    const dow = d.day() === 0 ? 7 : d.day();
    const last = d.endOf("month").date();
    const hit =
      rule.kind === "daily" ||
      (rule.kind === "weekly" && rule.days.includes(dow)) ||
      (rule.kind === "monthly" && d.date() === Math.min(rule.monthDay ?? 1, last));
    if (hit) return d.format("YYYY-MM-DD");
  }
  return "";
}

function toggleDay(d: number) {
  days.value = days.value.includes(d) ? days.value.filter((x) => x !== d) : [...days.value, d].sort();
}

async function create() {
  const title = draft.value.trim();
  if (!title) {
    error.value = t("stats.nameEmpty");
    return;
  }
  if (kind.value === "weekly" && days.value.length === 0) {
    error.value = t("repeat.pickDays");
    return;
  }
  busy.value = true;
  error.value = null;
  try {
    await store.saveRecurrence({
      title,
      kind: kind.value,
      days: days.value,
      monthDay: kind.value === "monthly" ? monthDay.value : null,
      projectId: store.captureProjectId,
    });
    draft.value = "";
    days.value = [];
    await nextTick();
    titleEl.value?.focus();
  } catch (e) {
    error.value = String(e);
  } finally {
    busy.value = false;
  }
}

async function toggle(rule: Recurrence) {
  await store.toggleRecurrence(rule.id, !rule.archived);
}

async function remove(id: string) {
  busy.value = true;
  try {
    await store.removeRecurrence(id);
    askDelete.value = null;
  } finally {
    busy.value = false;
  }
}

onMounted(async () => {
  try {
    await store.loadRecurrences();
  } finally {
    loading.value = false;
  }
  await nextTick();
  titleEl.value?.focus();
});
</script>

<template>
  <PanelShell :title="t('repeat.title')" :subtitle="t('repeat.subtitle')" @close="emit('close')">
    <div class="pb-1 pt-1">
      <!-- new rule -->
      <div class="mt-3 rounded-2xl bg-card p-4">
        <div class="flex items-center gap-2">
          <Repeat :size="14" :stroke-width="1.8" class="text-accent" />
          <input
            ref="titleEl"
            v-model="draft"
            class="min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-faint"
            :placeholder="t('repeat.new')"
            @keydown.enter.prevent="create"
          />
          <button
            class="flex h-7 items-center gap-1 rounded-lg bg-accent px-2.5 text-[12px] text-white disabled:opacity-40"
            :disabled="busy"
            @click="create"
          >
            <Plus :size="12" :stroke-width="2" />
            {{ t("repeat.save") }}
          </button>
        </div>

        <div class="mt-3 flex items-center gap-1.5">
          <button
            v-for="k in (['daily', 'weekly', 'monthly'] as const)"
            :key="k"
            class="rounded-lg px-2.5 py-1 text-[11.5px] transition-colors"
            :class="kind === k ? 'bg-accent-soft text-accent' : 'text-ink-faint hover:bg-paper-deep'"
            @click="kind = k"
          >
            {{ t(`repeat.${k}`) }}
          </button>
        </div>

        <div v-if="kind === 'weekly'" class="mt-2.5">
          <p class="text-[11px] text-ink-faint">{{ t("repeat.pickDays") }}</p>
          <div class="mt-1.5 flex gap-1.5">
            <button
              v-for="d in 7"
              :key="d"
              class="h-7 w-7 rounded-lg text-[11.5px] transition-colors"
              :class="days.includes(d) ? 'bg-accent text-white' : 'bg-paper-deep text-ink-soft hover:text-ink'"
              @click="toggleDay(d)"
            >
              {{ t(`repeat.weekday${d}` as "repeat.weekday1") }}
            </button>
          </div>
        </div>

        <div v-if="kind === 'monthly'" class="mt-2.5 flex items-center gap-2">
          <p class="text-[11px] text-ink-faint">{{ t("repeat.dayOfMonth") }}</p>
          <input
            v-model.number="monthDay"
            type="number"
            min="1"
            max="31"
            class="w-14 rounded-lg bg-paper-deep px-2 py-1 text-[12px] text-ink outline-none"
          />
        </div>

        <p v-if="error" class="mt-2 text-[11px] text-warn">{{ error }}</p>
      </div>

      <!-- existing rules -->
      <p class="mt-5 text-[11px] text-ink-faint">
        <template v-if="active">{{ t("repeat.count", { n: active }) }}</template>
      </p>

      <p v-if="loading" class="mt-3 text-[12px] text-ink-faint">{{ t("history.loading") }}</p>

      <div v-else-if="rules.length === 0" class="mt-8 text-center">
        <Repeat :size="20" :stroke-width="1.4" class="mx-auto text-ink-faint/60" />
        <p class="mt-2 text-[12.5px] text-ink-soft">{{ t("repeat.empty") }}</p>
        <p class="mt-1 text-[11.5px] leading-5 text-ink-faint">{{ t("repeat.emptyHint") }}</p>
      </div>

      <ul v-else class="mt-2 space-y-1">
        <li v-for="rule in rules" :key="rule.id" class="rounded-xl px-1 py-2">
          <div class="flex items-center gap-2">
            <span class="min-w-0 flex-1 truncate text-[13px] text-ink" :class="rule.archived ? 'text-ink-faint line-through' : ''">
              {{ rule.title }}
            </span>
            <span class="shrink-0 text-[11px] text-ink-faint">
              {{ rule.archived ? t("repeat.paused") : t("repeat.next", { d: nextOf(rule) }) }}
            </span>
            <button
              class="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] text-ink-faint transition-colors hover:bg-paper-deep hover:text-ink"
              @click="toggle(rule)"
            >
              {{ rule.archived ? t("repeat.resume") : t("repeat.pause") }}
            </button>
            <button
              class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-paper-deep hover:text-warn"
              :title="t('repeat.delete')"
              @click="askDelete = askDelete === rule.id ? null : rule.id"
            >
              <Trash2 :size="12" :stroke-width="1.8" />
            </button>
          </div>
          <p class="mt-0.5 text-[11px] text-ink-faint">{{ scheduleOf(rule) }}</p>

          <div v-if="askDelete === rule.id" class="mt-2 rounded-xl bg-warn-soft/50 px-3 py-2">
            <p class="text-[11px] leading-5 text-ink-soft">{{ t("repeat.deleteImpact") }}</p>
            <div class="mt-1.5 flex gap-2">
              <button
                class="rounded-lg bg-warn px-2.5 py-1 text-[11px] text-white disabled:opacity-40"
                :disabled="busy"
                @click="remove(rule.id)"
              >
                {{ t("nodes.deleteConfirm") }}
              </button>
              <button
                class="rounded-lg px-2.5 py-1 text-[11px] text-ink-faint hover:text-ink"
                @click="askDelete = null"
              >
                {{ t("nodes.deleteCancel") }}
              </button>
            </div>
          </div>
        </li>
      </ul>
    </div>
  </PanelShell>
</template>
