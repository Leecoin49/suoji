<script setup lang="ts">
import { computed, ref } from "vue";
import { CornerDownLeft, Plus } from "lucide-vue-next";
import dayjs from "dayjs";
import { parseCapture } from "@/lib/parse";
import { useDayStore } from "@/stores/day";
import { dayLabel, t } from "@/lib/i18n";

const store = useDayStore();
const inputEl = ref<HTMLInputElement | null>(null);
const text = ref("");
const focused = ref(false);

const parsed = computed(() => parseCapture(text.value));

const targetLabel = computed(() => {
  if (!text.value.trim()) return "";
  const p = parsed.value;
  if (p.target === "inbox") return "";
  if (p.target === "today") return p.dueAt ? `${t("capture.today")} ${p.dueAt}` : t("capture.today");
  const d = dayjs(p.target);
  const diff = d.startOf("day").diff(dayjs().startOf("day"), "day");
  const base = diff === 1 ? t("capture.tomorrow") : diff === 2 ? t("capture.dayAfter") : dayLabel(d);
  return p.dueAt ? `${base} ${p.dueAt}` : base;
});

async function submit(forceToday: boolean) {
  const raw = text.value.trim();
  if (!raw) return;
  const p = parseCapture(raw);
  if (!p.title) return;
  const target = forceToday && p.target === "inbox" ? "today" : p.target;
  text.value = "";
  await store.add(p.title, target, p.dueAt);
}

function onKey(e: KeyboardEvent) {
  if (e.key === "Enter") {
    e.preventDefault();
    submit(e.ctrlKey || e.metaKey);
  } else if (e.key === "Escape") {
    text.value = "";
    inputEl.value?.blur();
  }
}

function focus() {
  inputEl.value?.focus();
}

defineExpose({ focus });
</script>

<template>
  <div class="shrink-0 px-6 pb-5 pt-2">
    <div
      class="flex items-center gap-2.5 rounded-2xl border bg-card px-4 py-2.5 transition-all duration-200"
      :class="
        focused
          ? 'border-accent/35 shadow-[0_6px_24px_-12px_rgba(184,84,58,0.45)]'
          : 'border-line shadow-[0_2px_10px_-6px_rgba(34,30,25,0.18)]'
      "
      @click="focus"
    >
      <Plus :size="15" :stroke-width="2.2" class="shrink-0 text-ink-faint" />
      <input
        ref="inputEl"
        v-model="text"
        class="min-w-0 flex-1 bg-transparent text-[14px] text-ink placeholder:text-ink-faint"
        :placeholder="t('capture.placeholder')"
        spellcheck="false"
        @focus="focused = true"
        @blur="focused = false"
        @keydown="onKey"
      />

      <span
        v-if="targetLabel"
        class="shrink-0 rounded-md bg-accent-soft px-1.5 py-0.5 text-[11px] font-medium text-accent"
      >
        → {{ targetLabel }}
      </span>
      <span v-else class="flex shrink-0 items-center gap-1 text-[11px] text-ink-faint/80">
        <CornerDownLeft :size="11" :stroke-width="2" />
        {{ t("capture.inbox") }}
        <span class="px-0.5 text-ink-faint/40">/</span>
        {{ t("capture.enterToday") }}
      </span>
    </div>
  </div>
</template>
