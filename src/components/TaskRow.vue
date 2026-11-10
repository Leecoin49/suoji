<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { AlignLeft, CalendarClock, CalendarDays, Check, Inbox, Pencil, Repeat, Sunrise, Tag as TagIcon, Trash2 } from "lucide-vue-next";
import type { Task } from "@/lib/api";
import { useDayStore } from "@/stores/day";
import { deadlineInput, deadlineOf, heldDays, timeLabel } from "@/lib/utils";
import { t } from "@/lib/i18n";

const props = defineProps<{ task: Task; showActions?: boolean }>();
const store = useDayStore();

const editing = ref(false);
const draft = ref("");
const noteEl = ref<HTMLTextAreaElement | null>(null);

/* Renaming in place: click the title, type, Enter. */
const editingTitle = ref(false);
const titleDraft = ref("");
const titleEl = ref<HTMLInputElement | null>(null);

function startTitle() {
  titleDraft.value = props.task.title;
  editingTitle.value = true;
  nextTick(() => titleEl.value?.select());
}

async function commitTitle() {
  if (!editingTitle.value) return;
  editingTitle.value = false;
  const v = titleDraft.value.trim().replace(/\s+/g, " ");
  if (!v || v === props.task.title) return;
  await store.rename(props.task.id, v);
}

/* Right click: the same verbs as the hover buttons, without hovering. */
const menu = ref(false);
const menuAt = ref({ x: 0, y: 0 });

function openMenu(e: MouseEvent) {
  e.preventDefault();
  menuAt.value = {
    x: Math.min(e.clientX, window.innerWidth - 172),
    y: Math.min(e.clientY, window.innerHeight - 200),
  };
  menu.value = true;
}

function closeMenu() {
  menu.value = false;
}

function act(fn: () => unknown) {
  menu.value = false;
  void fn();
}

function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") menu.value = false;
}

onMounted(() => window.addEventListener("keydown", onKey));
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));

function startNote() {
  draft.value = props.task.note ?? "";
  editing.value = true;
  nextTick(() => noteEl.value?.focus());
}

async function commitNote() {
  editing.value = false;
  const v = draft.value.trim();
  if (v === (props.task.note ?? "")) return;
  await store.setNote(props.task.id, v || null);
}

const days = computed(() => heldDays(props.task));

/* A real deadline, as opposed to "sometime today" (spec 009). */
const deadline = computed(() => deadlineOf(props.task));
const deadlineText = computed(() => {
  const d = deadline.value;
  if (!d) return "";
  if (d.kind === "over") return t("task.deadline.overdue", { n: -d.days });
  if (d.kind === "today") return t("task.deadline.today", { t: d.time || "24:00" });
  if (d.kind === "tomorrow") return t("task.deadline.tomorrow", { t: d.time || "24:00" });
  return t("task.deadline.later", { d: d.date, t: d.time || "24:00" });
});
const deadlineTone = computed(() => {
  const kind = deadline.value?.kind;
  if (kind === "over") return "bg-warn-soft text-warn";
  if (kind === "today") return "bg-accent-soft text-accent";
  if (kind === "tomorrow") return "bg-paper-deep text-ink-soft";
  return "bg-paper-deep text-ink-faint";
});

const editingDeadline = ref(false);
const deadlineDraft = ref("");
const deadlineEl = ref<HTMLInputElement | null>(null);

function startDeadline() {
  deadlineDraft.value = deadlineInput(props.task.deadline, props.task.planDate);
  editingDeadline.value = true;
  nextTick(() => deadlineEl.value?.focus());
}

async function commitDeadline() {
  if (!editingDeadline.value) return;
  editingDeadline.value = false;
  const v = deadlineDraft.value.trim();
  if (!v) return;
  const current = props.task.deadline ? props.task.deadline.slice(0, 16) : "";
  if (v === current) return;
  await store.setDeadline(props.task.id, v);
}

/* Moving a planned task to another day. */
const editingDate = ref(false);
const dateDraft = ref("");
const dateEl = ref<HTMLInputElement | null>(null);

function startDate() {
  dateDraft.value = (props.task.planDate ?? "").slice(0, 10);
  editingDate.value = true;
  nextTick(() => dateEl.value?.focus());
}

async function commitDate() {
  if (!editingDate.value) return;
  editingDate.value = false;
  const v = dateDraft.value.trim();
  if (!v || v === (props.task.planDate ?? "")) return;
  await store.moveTo(props.task.id, v);
}
/** Chips are cheap, but three is enough on a row. */
const project = computed(() => store.projects.find((p) => p.id === props.task.projectId) ?? null);

/** "每天" / "每周" / "每月" — enough to tell at a glance why this line keeps coming back. */
const repeatLabel = computed(() => {
  const rule = store.recurrences.find((r) => r.id === props.task.recurrenceId);
  if (!rule) return t("repeat.badge");
  if (rule.kind === "daily") return t("repeat.daily");
  if (rule.kind === "weekly") return t("repeat.weekly");
  return t("repeat.monthly");
});
const tagNames = computed(() =>
  (props.task.tagIds ?? [])
    .map((id) => store.tags.find((x) => x.id === id)?.name)
    .filter((name): name is string => Boolean(name)),
);
const shownTags = computed(() => tagNames.value.slice(0, 3));
const moreTags = computed(() => Math.max(0, tagNames.value.length - shownTags.value.length));
</script>

<template>
  <div
    class="group relative flex items-start gap-3 rounded-xl px-2.5 py-2 transition-colors hover:bg-card"
    :class="task.done && 'opacity-50'"
    @contextmenu="openMenu"
  >
    <!-- Checkbox -->
    <button
      class="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition-all duration-150"
      :class="
        task.done
          ? 'border-accent bg-accent text-white'
          : 'border-line bg-transparent text-transparent hover:border-accent hover:bg-accent-soft hover:text-accent'
      "
      @click="store.toggle(task)"
    >
      <Check :size="11" :stroke-width="3" />
    </button>

    <div class="min-w-0 flex-1">
      <div class="flex items-baseline gap-2">
        <span v-if="task.dueAt" class="shrink-0 font-display text-[13px] tabular-nums text-accent">
          {{ timeLabel(task) }}
        </span>
        <input
          v-if="editingTitle"
          ref="titleEl"
          v-model="titleDraft"
          class="min-w-0 flex-1 rounded-lg border border-accent/40 bg-card px-1.5 text-[14.5px] leading-6 text-ink"
          :placeholder="t('task.title.placeholder')"
          @blur="commitTitle"
          @keydown.enter.prevent="commitTitle"
          @keydown.esc.prevent="editingTitle = false"
        />
        <button
          v-else
          class="min-w-0 truncate text-left text-[14.5px] leading-6 transition-all"
          :class="task.done ? 'text-ink-faint line-through' : 'text-ink'"
          :title="t('task.menu.rename')"
          @click="startTitle"
        >
          {{ task.title }}
        </button>
      </div>

      <!-- Where it belongs (spec 005): project + tags, one click opens the sheet -->
      <div
        v-if="project || tagNames.length || task.recurrenceId || deadline"
        class="mt-1 flex flex-wrap items-center gap-1"
      >
        <span
          v-if="task.recurrenceId"
          class="flex items-center gap-0.5 rounded-full bg-paper-deep px-1.5 py-0.5 text-[10.5px] text-ink-faint"
          :title="t('repeat.badge')"
        >
          <Repeat :size="9" :stroke-width="2.2" />
          {{ repeatLabel }}
        </span>
        <button
          v-if="deadline && !task.done"
          class="flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10.5px] font-medium transition-colors"
          :class="deadlineTone"
          :title="t('task.menu.deadline')"
          @click="startDeadline"
        >
          <CalendarClock :size="9" :stroke-width="2.2" />
          {{ deadlineText }}
        </button>
        <button
          v-if="project"
          class="max-w-[140px] truncate rounded-full bg-accent-soft px-1.5 py-0.5 text-[10.5px] text-accent transition-colors hover:bg-accent/20"
          :title="t('stats.projectLabel')"
          @click="store.openClass(task)"
        >
          {{ project.name }}
        </button>
        <button
          v-for="name in shownTags"
          :key="name"
          class="max-w-[110px] truncate rounded-full bg-paper-deep px-1.5 py-0.5 text-[10.5px] text-ink-faint transition-colors hover:text-ink-soft"
          :title="t('stats.tagLabel')"
          @click="store.openClass(task)"
        >
          {{ name }}
        </button>
        <button
          v-if="moreTags"
          class="rounded-full bg-paper-deep px-1.5 py-0.5 text-[10.5px] text-ink-faint hover:text-ink-soft"
          @click="store.openClass(task)"
        >
          +{{ moreTags }}
        </button>
      </div>

      <!-- Note: where did it get to -->
      <div v-if="editingDeadline" class="mt-1.5 flex items-center gap-1.5">
        <input
          ref="deadlineEl"
          v-model="deadlineDraft"
          type="datetime-local"
          class="rounded-lg border border-accent/40 bg-card px-2 py-1 text-[12px] text-ink"
          @keydown.enter.prevent="commitDeadline"
          @keydown.esc.prevent="editingDeadline = false"
          @blur="commitDeadline"
        />
        <button
          v-if="task.deadline"
          class="text-[11px] text-ink-faint hover:text-warn"
          @mousedown.prevent="editingDeadline = false; store.setDeadline(task.id, null)"
        >
          {{ t("task.deadline.clear") }}
        </button>
      </div>
      <div v-if="editingDate" class="mt-1.5 flex items-center gap-1.5">
        <input
          ref="dateEl"
          v-model="dateDraft"
          type="date"
          class="rounded-lg border border-accent/40 bg-card px-2 py-1 text-[12px] text-ink"
          @keydown.enter.prevent="commitDate"
          @keydown.esc.prevent="editingDate = false"
          @blur="commitDate"
        />
      </div>
      <textarea
        v-if="editing"
        ref="noteEl"
        v-model="draft"
        rows="2"
        class="mt-1 w-full resize-none rounded-lg border border-line bg-card px-2 py-1.5 text-[12.5px] leading-5 text-ink-soft placeholder:text-ink-faint focus:border-accent/40"
        :placeholder="t('task.note.placeholder')"
        @blur="commitNote"
        @keydown.enter.exact.prevent="commitNote"
        @keydown.esc.prevent="editing = false"
      />
      <button
        v-else-if="task.note"
        class="mt-0.5 block max-w-full truncate text-left text-[12.5px] text-ink-faint hover:text-ink-soft"
        @click="startNote"
      >
        {{ task.note }}
      </button>
      <button
        v-else
        class="mt-0.5 hidden text-[12px] text-ink-faint/70 hover:text-ink-soft group-hover:block"
        @click="startNote"
      >
        {{ t("task.note.add") }}
      </button>
    </div>

    <!-- Right: age badge / hover actions -->
    <div class="flex shrink-0 items-center gap-1 pl-1">
      <span
        v-if="!task.done && days >= 3"
        class="rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-medium text-warn"
      >
        {{ t("task.badge.held", { n: days }) }}
      </span>
      <span
        v-if="task.done && task.rollCount > 0"
        class="rounded-full bg-paper-deep px-2 py-0.5 text-[10.5px] text-ink-faint"
        :title="t('task.badge.rolledHint', { n: task.rollCount })"
      >
        {{ t("task.badge.rolled", { n: task.rollCount }) }}
      </span>
      <div v-if="showActions !== false" class="hidden items-center gap-0.5 group-hover:flex">
        <button
          class="rounded-md p-1.5 text-ink-faint transition-colors hover:bg-paper-deep hover:text-ink"
          :title="t('stats.assign')"
          @click="store.openClass(task)"
        >
          <TagIcon :size="13" :stroke-width="1.9" />
        </button>
        <button
          class="rounded-md p-1.5 text-ink-faint transition-colors hover:bg-paper-deep hover:text-ink"
          :title="t('task.act.tomorrow')"
          @click="store.tomorrow(task.id)"
        >
          <Sunrise :size="13" :stroke-width="1.9" />
        </button>
        <button
          class="rounded-md p-1.5 text-ink-faint transition-colors hover:bg-paper-deep hover:text-ink"
          :title="t('task.act.inbox')"
          @click="store.toInbox(task.id)"
        >
          <Inbox :size="13" :stroke-width="1.9" />
        </button>
        <button
          class="rounded-md p-1.5 text-ink-faint transition-colors hover:bg-accent-soft hover:text-accent"
          :title="t('task.act.drop')"
          @click="store.drop(task.id)"
        >
          <Trash2 :size="13" :stroke-width="1.9" />
        </button>
      </div>
    </div>

    <!-- Right-click menu (teleported so the scroll container cannot clip it) -->
    <Teleport to="body">
      <div v-if="menu" class="fixed inset-0 z-40" @click="closeMenu" @contextmenu.prevent="closeMenu" />
      <div
        v-if="menu"
        class="fixed z-50 w-[168px] overflow-hidden rounded-xl border border-line bg-card py-1 shadow-[0_10px_28px_rgba(0,0,0,0.12)]"
        :style="{ left: menuAt.x + 'px', top: menuAt.y + 'px' }"
        @mousedown.stop
      >
        <button class="menu-row" @click="act(startTitle)">
          <Pencil :size="12.5" :stroke-width="1.9" />{{ t("task.menu.rename") }}
        </button>
        <button class="menu-row" @click="act(startNote)">
          <AlignLeft :size="12.5" :stroke-width="1.9" />{{ t("task.menu.note") }}
        </button>
        <button class="menu-row" @click="act(() => store.openClass(task))">
          <TagIcon :size="12.5" :stroke-width="1.9" />{{ t("stats.assign") }}
        </button>
        <template v-if="!task.done">
          <button class="menu-row" @click="act(startDeadline)">
            <CalendarClock :size="12.5" :stroke-width="1.9" />{{ t("task.menu.deadline") }}
          </button>
          <button class="menu-row" @click="act(startDate)">
            <CalendarDays :size="12.5" :stroke-width="1.9" />{{ t("task.menu.reschedule") }}
          </button>
        </template>
        <template v-if="!task.done">
          <button class="menu-row" @click="act(() => store.tomorrow(task.id))">
            <Sunrise :size="12.5" :stroke-width="1.9" />{{ t("task.act.tomorrow") }}
          </button>
          <button class="menu-row" @click="act(() => store.toInbox(task.id))">
            <Inbox :size="12.5" :stroke-width="1.9" />{{ t("task.act.inbox") }}
          </button>
        </template>
        <button class="menu-row mt-0.5 border-t border-line-soft pt-1.5 text-warn hover:text-warn" @click="act(() => store.drop(task.id))">
          <Trash2 :size="12.5" :stroke-width="1.9" />{{ t("task.act.drop") }}
        </button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
textarea {
  field-sizing: content;
}

.menu-row {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.75rem;
  text-align: left;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--color-ink);
  transition: background-color 120ms ease;
}

.menu-row:hover {
  background: var(--color-paper-deep);
}
</style>
