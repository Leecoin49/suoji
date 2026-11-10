<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { CornerDownLeft, FolderTree, Plus } from "lucide-vue-next";
import dayjs from "dayjs";
import { parseCapture } from "@/lib/parse";
import { useDayStore } from "@/stores/day";
import { dayLabel, t } from "@/lib/i18n";

const store = useDayStore();
const inputEl = ref<HTMLInputElement | null>(null);
const text = ref("");
const focused = ref(false);
const pickerOpen = ref(false);

const captureProject = computed(() => store.projects.find((p) => p.id === store.captureProjectId) ?? null);

onMounted(() => {
  void store.loadClasses();
});

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
    if (pickerOpen.value) {
      pickerOpen.value = false;
      return;
    }
    text.value = "";
    inputEl.value?.blur();
  }
}

function pickProject(id: string | null) {
  store.setCaptureProject(id);
  pickerOpen.value = false;
  inputEl.value?.focus();
}

function focus() {
  inputEl.value?.focus();
}

defineExpose({ focus });
</script>

<template>
  <div class="shrink-0 px-6 pb-5 pt-2">
    <div v-if="pickerOpen" class="fixed inset-0 z-20" @click="pickerOpen = false" />
    <div
      class="relative flex items-center gap-2.5 rounded-2xl border bg-card px-4 py-2.5 transition-all duration-200"
      :class="
        focused
          ? 'border-accent/35 shadow-[0_6px_24px_-12px_rgba(184,84,58,0.45)]'
          : 'border-line shadow-[0_2px_10px_-6px_rgba(34,30,25,0.18)]'
      "
      @click="focus"
    >
      <Plus :size="15" :stroke-width="2.2" class="shrink-0 text-ink-faint" />

      <!-- Which project the next line lands in -->
      <div class="relative shrink-0">
        <button
          class="flex max-w-[104px] items-center gap-1 rounded-lg px-1.5 py-0.5 text-[11px] transition-colors"
          :class="
            captureProject
              ? 'bg-accent-soft text-accent hover:bg-accent-soft/80'
              : 'text-ink-faint hover:bg-paper-deep hover:text-ink-soft'
          "
          :title="captureProject ? captureProject.name : t('capture.projectNone')"
          @click.stop="pickerOpen = !pickerOpen"
        >
          <FolderTree :size="11" :stroke-width="2" class="shrink-0" />
          <span class="truncate">{{ captureProject?.name ?? t("capture.project") }}</span>
        </button>

        <div
          v-if="pickerOpen"
          class="absolute bottom-full left-0 z-30 mb-2 max-h-[220px] w-[190px] overflow-y-auto rounded-xl border border-line bg-card p-1 shadow-[0_10px_30px_-12px_rgba(34,30,25,0.35)] scroll-thin"
          @click.stop
        >
          <button
            class="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[12px] transition-colors hover:bg-paper-deep"
            :class="store.captureProjectId ? 'text-ink-soft' : 'text-accent'"
            @click="pickProject(null)"
          >
            {{ t("capture.projectNone") }}
          </button>
          <button
            v-for="p in store.projects"
            :key="p.id"
            class="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[12px] transition-colors hover:bg-paper-deep"
            :class="
              store.captureProjectId === p.id
                ? 'text-accent'
                : p.archived
                  ? 'text-ink-faint/70'
                  : 'text-ink-soft'
            "
            @click="pickProject(p.id)"
          >
            <span class="min-w-0 flex-1 truncate">{{ p.name }}</span>
            <span v-if="p.archived" class="shrink-0 text-[10px] text-ink-faint">·</span>
          </button>
        </div>
      </div>
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
