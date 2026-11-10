<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import dayjs from "dayjs";
import { AlertTriangle, ArrowRight, ChevronDown, History, Inbox, X } from "lucide-vue-next";
import TitleBar from "@/components/TitleBar.vue";
import CaptureBar from "@/components/CaptureBar.vue";
import TaskRow from "@/components/TaskRow.vue";
import CloseOutSheet from "@/components/CloseOutSheet.vue";
import SettingsSheet from "@/components/SettingsSheet.vue";
import HistorySheet from "@/components/HistorySheet.vue";
import StatsSheet from "@/components/StatsSheet.vue";
import ProjectSheet from "@/components/ProjectSheet.vue";
import RecurringSheet from "@/components/RecurringSheet.vue";
import ClassSheet from "@/components/ClassSheet.vue";
import HelpSheet from "@/components/HelpSheet.vue";
import UpdateSheet from "@/components/UpdateSheet.vue";
import { useDayStore } from "@/stores/day";
import { useUpdateStore } from "@/stores/update";
import { api, type Task } from "@/lib/api";
import { cn, deadlineOf, heldDays } from "@/lib/utils";
import { applyLocale, dayLabel, greeting, t, weekday } from "@/lib/i18n";

const store = useDayStore();
const updater = useUpdateStore();
const capture = ref<InstanceType<typeof CaptureBar> | null>(null);
const closeOutOpen = ref(false);
const settingsOpen = ref(false);
const historyOpen = ref(false);
const statsOpen = ref(false);
const projectsOpen = ref(false);
const projectFocus = ref<string | null>(null);
const recurringOpen = ref(false);
const helpOpen = ref(false);
const updateOpen = ref(false);
const doneOpen = ref(true);
const noteDismissed = ref(false);
let unlisten: UnlistenFn | null = null;

const today = computed(() => dayjs(store.view?.date ?? undefined));
const dateLabel = computed(() => dayLabel(today.value));
const weekLabel = computed(() => weekday(today.value));

const groups = computed(() => {
  const all = store.tasks;
  const stuck = all.filter((t) => heldDays(t) >= 3);
  const rest = all.filter((t) => heldDays(t) < 3);
  return {
    stuck,
    timed: rest.filter((t) => !!t.dueAt),
    normal: rest.filter((t) => !t.dueAt),
  };
});

/** Today's unscheduled tasks, filed the way the user filed them: project -> step. */
type HomeSection = {
  key: string;
  project: string | null;
  projectId: string | null;
  step: string | null;
  tasks: Task[];
};

const stepNames = ref<Record<string, string>>({});
const collapsed = ref<Record<string, boolean>>({});

watch(
  () => store.tasks,
  async (list) => {
    const ids = [...new Set(list.map((x) => x.projectId).filter((x): x is string => !!x))];
    if (!ids.length) {
      stepNames.value = {};
      return;
    }
    const names: Record<string, string> = {};
    await Promise.all(
      ids.map(async (id) => {
        try {
          for (const node of await api.listNodes(id)) names[node.id] = node.title;
        } catch {
          /* the header falls back to 「未挂步骤」 */
        }
      }),
    );
    stepNames.value = names;
  },
  { immediate: true },
);

const homeSections = computed<HomeSection[]>(() => {
  const order: string[] = [];
  const map = new Map<string, HomeSection>();
  for (const task of groups.value.normal) {
    const project = task.projectId ? store.projects.find((p) => p.id === task.projectId) ?? null : null;
    const key = project ? `${project.id}/${task.nodeId ?? ""}` : "__none__";
    if (!map.has(key)) {
      order.push(key);
      map.set(key, {
        key,
        project: project?.name ?? null,
        projectId: project?.id ?? null,
        step: project && task.nodeId ? stepNames.value[task.nodeId] ?? t("home.noStep") : null,
        tasks: [],
      });
    }
    map.get(key)!.tasks.push(task);
  }
  const list = order.map((k) => map.get(k)!);
  // 没归项目的永远垫底，像「未分类」那样。
  return [...list.filter((s) => s.project !== null), ...list.filter((s) => s.project === null)];
});

function toggleSection(key: string) {
  collapsed.value = { ...collapsed.value, [key]: !collapsed.value[key] };
}

/** How many lines in this group have already blown past their deadline. */
function overdueCount(tasks: Task[]) {
  return tasks.filter((task) => {
    const due = deadlineOf(task);
    return due !== null && due.kind === "over";
  }).length;
}

const summary = computed(() => {
  const n = store.tasks.length;
  if (n === 0) return t("summary.empty");
  const stuck = groups.value.stuck.length;
  const base = t("summary.base", { n });
  return stuck ? base + t("summary.stuck", { n: stuck }) : base;
});

/** Today's shape in one line: how much of the card is already ticked off. */
const progress = computed(() => {
  const done = store.doneToday.length;
  const total = done + store.tasks.length;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
});

const tabs = computed(() => [
  { key: "today" as const, label: t("tab.today"), badge: store.tasks.length },
  { key: "inbox" as const, label: t("tab.inbox"), badge: store.inboxCount },
]);

function switchTab(k: "today" | "inbox") {
  closeAllSheets();
  store.tab = k;
  if (k === "inbox") store.loadInbox();
}

function openHistory() {
  closeOutOpen.value = false;
  settingsOpen.value = false;
  helpOpen.value = false;
  updateOpen.value = false;
  statsOpen.value = false;
  projectsOpen.value = false;
  recurringOpen.value = false;
  historyOpen.value = true;
}

function openStats() {
  closeOutOpen.value = false;
  settingsOpen.value = false;
  historyOpen.value = false;
  helpOpen.value = false;
  updateOpen.value = false;
  projectsOpen.value = false;
  recurringOpen.value = false;
  statsOpen.value = true;
}

function openProjects(projectId: string | null = null) {
  closeOutOpen.value = false;
  settingsOpen.value = false;
  historyOpen.value = false;
  helpOpen.value = false;
  updateOpen.value = false;
  statsOpen.value = false;
  recurringOpen.value = false;
  projectFocus.value = projectId;
  projectsOpen.value = true;
}

/** The tabs always win: whichever sheet is up, clicking 今天/收件箱 puts you back on the list. */
function closeAllSheets() {
  closeOutOpen.value = false;
  settingsOpen.value = false;
  historyOpen.value = false;
  statsOpen.value = false;
  projectsOpen.value = false;
  recurringOpen.value = false;
  updateOpen.value = false;
  if (helpOpen.value) closeHelp();
}

function openRecurring() {
  closeOutOpen.value = false;
  settingsOpen.value = false;
  historyOpen.value = false;
  helpOpen.value = false;
  updateOpen.value = false;
  statsOpen.value = false;
  projectsOpen.value = false;
  recurringOpen.value = true;
}

function openUpdate() {
  closeOutOpen.value = false;
  settingsOpen.value = false;
  historyOpen.value = false;
  statsOpen.value = false;
  helpOpen.value = false;
  updateOpen.value = true;
  if (updater.phase === "idle") void updater.checkNow();
}

const HELP_KEY = "suoji.helpSeen";

function openHelp() {
  closeOutOpen.value = false;
  historyOpen.value = false;
  statsOpen.value = false;
  settingsOpen.value = false;
  updateOpen.value = false;
  helpOpen.value = true;
}

function closeHelp() {
  helpOpen.value = false;
  try {
    localStorage.setItem(HELP_KEY, "1");
  } catch {
    /* storage may be unavailable */
  }
}

function onKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    capture.value?.focus();
  }
  if (e.key === "Escape") {
    closeOutOpen.value = false;
    settingsOpen.value = false;
    historyOpen.value = false;
    statsOpen.value = false;
    projectsOpen.value = false;
    recurringOpen.value = false;
    updateOpen.value = false;
    if (store.classTask) store.closeClass();
    if (helpOpen.value) closeHelp();
  }
}

async function boot() {
  await store.loadSettings();
  applyLocale(store.settings.locale);
  await store.refresh();
  // Projects and tags are small; loading them once keeps every row's chips ready.
  void store.loadClasses();
  void store.loadRecurrences();
  const v = store.view;
  if (v && !v.closedOut && v.tasks.length > 0 && dayjs().hour() >= 18) {
    closeOutOpen.value = true;
  }
  // Show the guide on the very first run; afterwards it lives behind the "?" button.
  let seen = "1";
  try {
    seen = localStorage.getItem(HELP_KEY) ?? "";
  } catch {
    /* storage may be unavailable */
  }
  if (!seen) helpOpen.value = true;
  setTimeout(() => capture.value?.focus(), 220);
}

onMounted(async () => {
  await boot();
  void updater.init();
  unlisten = await listen("open-closeout", () => {
    closeOutOpen.value = true;
  });
  window.addEventListener("keydown", onKeydown);
});

onUnmounted(() => {
  unlisten?.();
  window.removeEventListener("keydown", onKeydown);
});
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden">
    <TitleBar
      @settings="settingsOpen = true"
      @history="openHistory"
      @stats="openStats"
      @projects="openProjects"
      @help="openHelp"
      @update="openUpdate"
    />

    <!-- Header -->
    <header class="shrink-0 px-8 pb-4 pt-1">
      <div class="flex items-end justify-between gap-4">
        <div class="min-w-0">
          <div class="flex items-baseline gap-2.5">
            <h1 class="font-display text-[34px] leading-none tracking-tight text-ink">
              {{ dateLabel }}
            </h1>
            <span class="text-[13px] text-ink-faint">{{ weekLabel }}</span>
          </div>
          <p class="mt-2 truncate text-[12.5px] text-ink-soft">
            <span class="text-ink-faint">{{ greeting() }}</span>
            <span class="mx-1.5 text-line">·</span>{{ summary }}
          </p>

          <!-- How far into today we are, in one thin line -->
          <div v-if="store.tab === 'today' && progress.total" class="mt-3 flex items-center gap-2.5">
            <div class="h-[3px] min-w-0 flex-1 overflow-hidden rounded-full bg-paper-deep">
              <div
                class="h-full rounded-full bg-accent/75 transition-[width] duration-500 ease-out"
                :style="{ width: progress.pct + '%' }"
              />
            </div>
            <span class="shrink-0 text-[10.5px] tabular-nums text-ink-faint">
              {{ t("home.progress", { done: progress.done, total: progress.total }) }}
            </span>
          </div>
        </div>

        <!-- Segmented control -->
        <div class="no-drag flex shrink-0 items-center gap-0.5 rounded-xl bg-paper-deep p-1">
          <button
            v-for="t in tabs"
            :key="t.key"
            class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] transition-all"
            :class="
              store.tab === t.key
                ? 'bg-card text-ink shadow-[0_1px_3px_rgba(34,30,25,0.08)]'
                : 'text-ink-soft hover:text-ink'
            "
            @click="switchTab(t.key)"
          >
            {{ t.label }}
            <span
              v-if="t.badge"
              class="rounded-md px-1 text-[11px] tabular-nums"
              :class="store.tab === t.key ? 'bg-paper-deep text-ink-soft' : 'text-ink-faint'"
            >
              {{ t.badge }}
            </span>
          </button>
        </div>
      </div>
    </header>

    <!-- Body -->
    <main class="relative min-h-0 flex-1">
      <div class="scroll-thin h-full overflow-y-auto px-6 pb-4">
        <!-- Yesterday's note: written at close-out, greeted here -->
        <div
          v-if="store.view?.yesterdayNote && !noteDismissed"
          class="group mb-4 mt-1 flex items-start gap-3 rounded-xl border border-accent/15 bg-accent-soft/50 px-4 py-3 rise"
        >
          <span class="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
          <div class="min-w-0 flex-1">
            <span class="text-[10.5px] font-medium tracking-[0.14em] text-accent/80">
              {{ t("note.label") }}
            </span>
            <p class="mt-0.5 whitespace-pre-wrap text-[13.5px] leading-6 text-ink">
              {{ store.view?.yesterdayNote }}
            </p>
          </div>
          <button
            class="shrink-0 rounded-md p-1 text-ink-faint opacity-0 transition-opacity hover:text-ink group-hover:opacity-100"
            @click="noteDismissed = true"
          >
            <X :size="12" :stroke-width="2" />
          </button>
        </div>
        <!-- ============ Today ============ -->
        <template v-if="store.tab === 'today'">
          <!-- Sitting for a while -->
          <section v-if="groups.stuck.length" class="mb-5 rise">
            <div class="rounded-2xl border border-warn/20 bg-warn-soft/60 px-2 py-2">
              <div class="px-2.5 pb-1 pt-1">
                <span class="flex items-center gap-1.5 text-[11px] font-medium tracking-[0.1em] text-warn">
                  <AlertTriangle :size="11" :stroke-width="2.2" class="shrink-0" />
                  {{ t("stuck.heading") }}
                  <span class="rounded-full bg-warn/15 px-1.5 text-[10px] tabular-nums">
                    {{ groups.stuck.length }}
                  </span>
                </span>
              </div>
              <TaskRow v-for="task in groups.stuck" :key="task.id" :task="task" />
            </div>
          </section>

          <!-- Scheduled -->
          <section v-if="groups.timed.length" class="mb-4">
            <h2 class="mb-1 px-2.5 text-[11px] font-medium tracking-[0.1em] text-ink-faint">
              {{ t("section.timed") }}
            </h2>
            <TaskRow v-for="task in groups.timed" :key="task.id" :task="task" />
          </section>

          <!-- The rest: grouped by project and step, each group folds away -->
          <section v-if="groups.normal.length" class="mb-4">
            <template v-if="homeSections.length === 1 && !homeSections[0].project">
              <h2
                v-if="groups.timed.length || groups.stuck.length"
                class="mb-1 px-2.5 text-[11px] font-medium tracking-[0.1em] text-ink-faint"
              >
                {{ t("section.today") }}
              </h2>
              <TaskRow v-for="task in groups.normal" :key="task.id" :task="task" />
            </template>
            <template v-else>
              <div v-for="sec in homeSections" :key="sec.key" class="mb-1.5">
                <div class="flex items-center gap-0.5 rounded-lg pr-1.5 transition-colors hover:bg-paper-deep">
                  <button
                    class="flex h-[22px] w-[20px] shrink-0 items-center justify-center rounded-md text-ink-faint transition-colors hover:text-ink"
                    :aria-expanded="!collapsed[sec.key]"
                    :aria-label="collapsed[sec.key] ? t('home.expand') : t('home.collapse')"
                    @click="toggleSection(sec.key)"
                  >
                    <ChevronDown
                      :size="11"
                      :stroke-width="2.4"
                      class="transition-transform duration-150"
                      :class="collapsed[sec.key] ? '-rotate-90' : ''"
                    />
                  </button>
                  <button
                    class="flex min-w-0 flex-1 items-center gap-1.5 py-1 pr-1 text-left"
                    :class="sec.projectId ? 'group/name' : 'cursor-default'"
                    :title="sec.projectId ? t('home.openProject') : undefined"
                    @click="sec.projectId ? openProjects(sec.projectId) : toggleSection(sec.key)"
                  >
                    <span
                      class="max-w-[42%] truncate text-[11px] font-medium tracking-[0.06em]"
                      :class="sec.project ? 'text-accent/80 group-hover/name:underline' : 'text-ink-faint'"
                    >
                      {{ sec.project ?? t("home.ungrouped") }}
                    </span>
                    <template v-if="sec.step">
                      <span class="text-line">·</span>
                      <span class="min-w-0 truncate text-[11px] text-ink-soft">{{ sec.step }}</span>
                    </template>
                    <span
                      v-if="overdueCount(sec.tasks)"
                      class="shrink-0 rounded-full bg-warn-soft px-1.5 py-0.5 text-[10px] font-medium text-warn"
                    >
                      {{ t("home.overdue", { n: overdueCount(sec.tasks) }) }}
                    </span>
                  </button>
                  <span class="shrink-0 text-[10.5px] tabular-nums text-ink-faint">
                    {{ t("home.groupCount", { n: sec.tasks.length }) }}
                  </span>
                </div>
                <div v-if="!collapsed[sec.key]" class="rise ml-3 border-l border-line-soft">
                  <TaskRow v-for="task in sec.tasks" :key="task.id" :task="task" />
                </div>
              </div>
            </template>
          </section>

          <!-- Empty -->
          <div v-if="!store.tasks.length" class="flex flex-col items-center justify-center py-16">
            <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft">
              <Inbox :size="20" :stroke-width="1.6" class="text-accent" />
            </div>
            <p class="mt-4 text-[13.5px] text-ink-soft">{{ t("empty.title") }}</p>
            <p class="mt-1 text-[12px] text-ink-faint">{{ t("empty.hint") }}</p>
          </div>

          <!-- Inbox suggestions -->
          <section v-if="store.suggestions.length" class="mt-6">
            <h2 class="mb-1 px-2.5 text-[11px] font-medium tracking-[0.1em] text-ink-faint">
              {{ t("suggest.heading") }}
            </h2>
            <div
              v-for="task in store.suggestions"
              :key="task.id"
              class="group flex items-center gap-3 rounded-xl px-2.5 py-2 transition-colors hover:bg-card"
            >
              <span class="min-w-0 flex-1 truncate text-[14px] text-ink-soft">{{ task.title }}</span>
              <button
                class="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11.5px] text-accent opacity-0 transition-all hover:bg-accent-soft group-hover:opacity-100"
                @click="store.promote(task)"
              >
                {{ t("suggest.add") }}
                <ArrowRight :size="11" :stroke-width="2.2" />
              </button>
            </div>
          </section>

          <!-- Done today: expandable detail -->
          <section v-if="store.doneToday.length" class="mt-6">
            <div class="flex items-center gap-2">
              <button
                class="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11.5px] text-ink-faint transition-colors hover:bg-paper-deep hover:text-ink-soft"
                @click="doneOpen = !doneOpen"
              >
                <ChevronDown
                  :size="12"
                  :stroke-width="2.2"
                  class="transition-transform duration-150"
                  :class="doneOpen ? 'rotate-180' : '-rotate-90'"
                />
                {{ t("done.count", { n: store.doneToday.length }) }}
              </button>
              <button
                class="ml-auto flex items-center gap-1 rounded-lg px-2 py-1 text-[11.5px] text-ink-faint transition-colors hover:bg-paper-deep hover:text-ink-soft"
                @click="openHistory()"
              >
                <History :size="11.5" :stroke-width="2" />
                {{ t("done.all") }}
              </button>
            </div>

            <div v-if="doneOpen" class="mt-1 rise">
              <TaskRow v-for="task in store.doneToday" :key="task.id" :task="task" />
            </div>
          </section>
        </template>

        <!-- ============ Inbox ============ -->
        <template v-else>
          <div v-if="!store.inbox.length" class="flex flex-col items-center justify-center py-20">
            <p class="text-[13px] text-ink-faint">{{ t("inbox.empty") }}</p>
          </div>
          <div v-else class="space-y-0.5">
            <div
              v-for="task in store.inbox"
              :key="task.id"
              class="group flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition-colors hover:bg-card"
            >
              <span class="min-w-0 flex-1 truncate text-[14px]">{{ task.title }}</span>
              <span class="shrink-0 text-[11px] text-ink-faint">
                {{ dayLabel(task.createdAt) }}
              </span>
              <div
                class="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100"
              >
                <button
                  class="rounded-lg px-2 py-1 text-[11.5px] text-accent hover:bg-accent-soft"
                  @click="store.promote(task)"
                >
                  {{ t("suggest.add") }}
                </button>
                <button
                  class="rounded-lg px-2 py-1 text-[11.5px] text-ink-faint hover:bg-paper-deep hover:text-ink"
                  @click="store.drop(task.id)"
                >
                  {{ t("inbox.drop") }}
                </button>
              </div>
            </div>
          </div>
        </template>
      </div>

      <CloseOutSheet v-if="closeOutOpen" @close="closeOutOpen = false" />
      <HistorySheet v-if="historyOpen" @close="historyOpen = false" />
      <StatsSheet v-if="statsOpen" @close="statsOpen = false" />
      <ProjectSheet v-if="projectsOpen" :focus="projectFocus" @close="projectsOpen = false" />
    <RecurringSheet v-if="recurringOpen" @close="recurringOpen = false" />
      <ClassSheet v-if="store.classTask" @close="store.closeClass()" />
      <HelpSheet v-if="helpOpen" @close="closeHelp" />
      <UpdateSheet v-if="updateOpen" @close="updateOpen = false" />
      <SettingsSheet
        :open="settingsOpen"
        @close="settingsOpen = false"
        @help="settingsOpen = false; openHelp()"
        @update="settingsOpen = false; openUpdate()"
      />
    </main>

    <div v-if="!closeOutOpen && !historyOpen && !statsOpen && !projectsOpen && !recurringOpen && !helpOpen && !updateOpen && !store.classTask" class="shrink-0 px-6">
      <button
        v-if="store.tab === 'today' && store.tasks.length"
        :class="
          cn(
            'mb-1 w-full rounded-lg py-1.5 text-center text-[11.5px] text-ink-faint transition-colors hover:bg-paper-deep hover:text-ink-soft'
          )
        "
        @click="closeOutOpen = true"
      >
        {{ t("closeout.open") }}
      </button>
    </div>

    <CaptureBar
      v-if="!closeOutOpen && !historyOpen && !statsOpen && !projectsOpen && !recurringOpen && !helpOpen && !updateOpen && !store.classTask"
      ref="capture"
      @recurring="openRecurring"
    />
  </div>
</template>
