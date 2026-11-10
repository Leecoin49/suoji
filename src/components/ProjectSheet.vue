<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import {
  Archive,
  Check,
  CircleDashed,
  CornerDownRight,
  FolderTree,
  GitBranch,
  Plus,
  Trash2,
  X,
} from "lucide-vue-next";
import { api, type Node, type Task } from "@/lib/api";
import { useDayStore } from "@/stores/day";
import { dayLabel, t } from "@/lib/i18n";
import { PROJECT_NAME_MAX, validateProjectName } from "@/lib/classes";

const store = useDayStore();
const emit = defineEmits<{ (e: "close"): void }>();

type MenuKind = "project" | "node" | "task";
type Menu = { kind: MenuKind; id: string; x: number; y: number };

const view = ref<"tree" | "overview">("tree");
const nodes = ref<Node[]>([]);
const projectTasks = ref<Task[]>([]);
const activeId = ref<string | null>(store.projects.find((p) => !p.archived)?.id ?? null);
const loading = ref(false);
const draft = ref("");
const editingId = ref<string | null>(null);
const editingTitle = ref("");
let editInput: HTMLInputElement | null = null;
const grabEdit = (el: unknown) => {
  editInput = (el as HTMLInputElement | null) ?? null;
};
const editingProject = ref(false);
const projectDraft = ref("");
let projectInput: HTMLInputElement | null = null;
const grabProject = (el: unknown) => {
  projectInput = (el as HTMLInputElement | null) ?? null;
};
const newProject = ref("");
const error = ref("");
const askDelete = ref(false);
const impact = ref<{ tasks: number; nodes: number } | null>(null);
const menu = ref<Menu | null>(null);
const addingUnder = ref<string | null>(null);
const addDraft = ref("");
let addInput: HTMLInputElement | null = null;
const grabAdd = (el: unknown) => {
  addInput = (el as HTMLInputElement | null) ?? null;
};

const projects = computed(() => [...store.projects].sort((a, b) => Number(a.archived) - Number(b.archived)));
const active = computed(() => projects.value.find((p) => p.id === activeId.value) ?? null);
const doneCount = computed(() => nodes.value.filter((n) => n.done).length);
const firstOpenId = computed(() => nodes.value.find((n) => !n.done)?.id ?? null);
const openTasks = computed(() => projectTasks.value.filter((x) => !x.done).length);

/** Tasks of one step, in the order the backend gave us. */
function tasksOf(nodeId: string) {
  return projectTasks.value.filter((x) => x.nodeId === nodeId);
}

/** Tasks filed under the project but not under any of its steps. */
const looseTasks = computed(() => projectTasks.value.filter((x) => !x.nodeId));

/** The fishbone: the project is the spine, every step is a bone pointing away from it. */
const bones = computed(() => {
  const list = nodes.value;
  const gap = Math.min(104, Math.max(56, 460 / Math.max(list.length, 1)));
  return list.map((node, i) => {
    const up = i % 2 === 0;
    const mine = tasksOf(node.id);
    return {
      id: node.id,
      title: node.title,
      done: node.done,
      total: mine.length,
      open: mine.filter((x) => !x.done).length,
      x: 70 + i * gap,
      width: gap,
      up,
    };
  });
});
const spineWidth = computed(() => Math.max(300, 120 + nodes.value.length * Math.min(104, Math.max(56, 460 / Math.max(nodes.value.length, 1)))));

async function load(id = activeId.value) {
  if (!id) {
    nodes.value = [];
    projectTasks.value = [];
    return;
  }
  loading.value = true;
  try {
    const [chain, filed] = await Promise.all([api.listNodes(id), api.listProjectTasks(id)]);
    nodes.value = chain;
    projectTasks.value = filed;
  } catch {
    error.value = t("stats.error");
  } finally {
    loading.value = false;
  }
}

async function reloadTasks() {
  if (!activeId.value) return;
  try {
    projectTasks.value = await api.listProjectTasks(activeId.value);
  } catch {
    error.value = t("stats.error");
  }
}

async function toggleTask(task: Task) {
  try {
    await store.toggle(task);
    await reloadTasks();
  } catch {
    error.value = t("stats.error");
  }
}

function taskWhen(task: Task) {
  if (task.bucket === "inbox") return t("capture.inbox");
  const date = task.planDate ?? task.createdAt.slice(0, 10);
  if (date === store.view?.date) return t("capture.today");
  return dayLabel(date);
}

function pick(id: string) {
  activeId.value = id;
  editingId.value = null;
  editingProject.value = false;
  askDelete.value = false;
  menu.value = null;
  addingUnder.value = null;
  void load(id);
}

/* ---- right-click menu ---- */

function openMenu(event: MouseEvent, kind: MenuKind, id: string) {
  event.preventDefault();
  const x = Math.min(event.clientX, window.innerWidth - 190);
  const y = Math.min(event.clientY, window.innerHeight - 210);
  menu.value = { kind, id, x, y };
}

function closeMenu() {
  menu.value = null;
}

const menuTask = computed(() =>
  menu.value?.kind === "task" ? projectTasks.value.find((x) => x.id === menu.value?.id) : null,
);

function editFromMenu() {
  const m = menu.value;
  if (!m) return;
  if (m.kind === "project") {
    startProjectEdit();
  } else if (m.kind === "node") {
    const node = nodes.value.find((n) => n.id === m.id);
    if (node) startEdit(node);
  } else {
    const task = projectTasks.value.find((x) => x.id === m.id);
    if (task) startTaskEdit(task);
  }
  closeMenu();
}

async function deleteFromMenu() {
  const m = menu.value;
  closeMenu();
  if (!m) return;
  if (m.kind === "project") {
    await askRemove();
  } else if (m.kind === "node") {
    const node = nodes.value.find((n) => n.id === m.id);
    if (node) await remove(node);
  } else {
    await dropTask(m.id);
  }
}

async function addTaskFromMenu() {
  const m = menu.value;
  closeMenu();
  if (m?.kind !== "node") return;
  startAdding(m.id);
}

async function moveTo(nodeId: string | null) {
  const task = menuTask.value;
  closeMenu();
  if (!task) return;
  try {
    await api.setTaskNode(task.id, nodeId);
    await reloadTasks();
    await store.refresh();
  } catch {
    error.value = t("stats.error");
  }
}

/* ---- project ---- */

function startProjectEdit() {
  const p = active.value;
  if (!p) return;
  projectDraft.value = p.name;
  editingProject.value = true;
  void nextTick(() => projectInput?.select());
}

async function commitProjectEdit() {
  const p = active.value;
  const name = projectDraft.value.trim();
  editingProject.value = false;
  if (!p || !name || name === p.name) return;
  const check = validateProjectName(name);
  if (!check.ok) {
    error.value = check.reason === "long" ? t("stats.nameTooLong", { n: PROJECT_NAME_MAX }) : t("stats.nameEmpty");
    return;
  }
  try {
    await store.saveProject(check.name, p.id, p.archived);
    error.value = "";
  } catch {
    error.value = t("stats.nameTaken");
  }
}

async function toggleArchive() {
  const p = active.value;
  if (!p) return;
  try {
    await store.saveProject(p.name, p.id, !p.archived);
    error.value = "";
  } catch {
    error.value = t("stats.error");
  }
}

async function askRemove() {
  const p = active.value;
  if (!p) return;
  try {
    impact.value = await api.projectImpact(p.id);
    askDelete.value = true;
  } catch {
    error.value = t("stats.error");
  }
}

async function confirmRemove() {
  const p = active.value;
  if (!p) return;
  try {
    const left = await store.removeProject(p.id);
    askDelete.value = false;
    impact.value = null;
    nodes.value = [];
    activeId.value = left.find((x) => !x.archived)?.id ?? left[0]?.id ?? null;
    if (activeId.value) await load();
  } catch {
    error.value = t("stats.error");
  }
}

async function createProject() {
  const check = validateProjectName(newProject.value);
  if (!check.ok) {
    error.value = check.reason === "long" ? t("stats.nameTooLong", { n: PROJECT_NAME_MAX }) : t("stats.nameEmpty");
    return;
  }
  try {
    const saved = await store.saveProject(check.name);
    newProject.value = "";
    error.value = "";
    pick(saved.id);
  } catch {
    error.value = t("stats.nameTaken");
  }
}

/* ---- steps ---- */

async function addNode() {
  const title = draft.value.trim();
  if (!title || !activeId.value) return;
  draft.value = "";
  try {
    nodes.value = await api.saveNode({ projectId: activeId.value, title });
  } catch {
    error.value = t("stats.error");
  }
}

async function toggle(node: Node) {
  try {
    nodes.value = node.done ? await api.reopenNode(node.id) : await api.completeNode(node.id);
  } catch {
    error.value = t("stats.error");
  }
}

async function remove(node: Node) {
  try {
    nodes.value = await api.deleteNode(node.id);
    projectTasks.value = projectTasks.value.map((x) => (x.nodeId === node.id ? { ...x, nodeId: null } : x));
  } catch {
    error.value = t("stats.error");
  }
}

function startEdit(node: Node) {
  editingId.value = node.id;
  editingTitle.value = node.title;
  void nextTick(() => editInput?.select());
}

async function commitEdit(node: Node) {
  const title = editingTitle.value.trim();
  editingId.value = null;
  if (!title || title === node.title) return;
  try {
    nodes.value = await api.saveNode({ id: node.id, projectId: node.projectId, title, note: node.note });
  } catch {
    error.value = t("stats.error");
  }
}

function startAdding(nodeId: string) {
  addingUnder.value = nodeId;
  addDraft.value = "";
  void nextTick(() => addInput?.focus());
}

async function commitAdd() {
  const title = addDraft.value.trim();
  const nodeId = addingUnder.value;
  if (!title || !nodeId || !activeId.value) return;
  addingUnder.value = null;
  addDraft.value = "";
  try {
    const task = await api.addTask(title, "today", null, activeId.value);
    await api.setTaskNode(task.id, nodeId);
    await reloadTasks();
    await store.refresh();
  } catch {
    error.value = t("stats.error");
  }
}

/* ---- tasks ---- */

const editingTaskId = ref<string | null>(null);
const taskTitleDraft = ref("");
let taskInput: HTMLInputElement | null = null;
const grabTask = (el: unknown) => {
  taskInput = (el as HTMLInputElement | null) ?? null;
};

function startTaskEdit(task: Task) {
  editingTaskId.value = task.id;
  taskTitleDraft.value = task.title;
  void nextTick(() => taskInput?.select());
}

async function commitTaskEdit(task: Task) {
  const title = taskTitleDraft.value.trim();
  editingTaskId.value = null;
  if (!title || title === task.title) return;
  try {
    const saved = await api.setTitle(task.id, title);
    projectTasks.value = projectTasks.value.map((x) => (x.id === saved.id ? { ...x, title: saved.title } : x));
    await store.refresh();
  } catch {
    error.value = t("stats.error");
  }
}

async function dropTask(id: string) {
  const task = projectTasks.value.find((x) => x.id === id);
  if (!task) return;
  try {
    await store.drop(id);
    await reloadTasks();
  } catch {
    error.value = t("stats.error");
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    if (menu.value) {
      closeMenu();
      event.stopPropagation();
    }
  }
}

onMounted(async () => {
  window.addEventListener("keydown", onKeydown);
  await store.loadClasses();
  activeId.value = store.projects.find((p) => !p.archived)?.id ?? store.projects[0]?.id ?? null;
  await load();
});

onUnmounted(() => window.removeEventListener("keydown", onKeydown));

const btn = "rounded-md p-1 text-ink-faint transition-colors hover:bg-paper-deep hover:text-ink";
const pill =
  "max-w-[150px] truncate rounded-full border px-2.5 py-1 text-[12px] transition-colors";
const menuRow =
  "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px] text-ink transition-colors hover:bg-paper-deep";
</script>

<template>
  <div class="absolute inset-0 z-30 flex flex-col bg-paper" @click="closeMenu">
    <div class="flex items-center justify-between px-8 pb-1 pt-6">
      <div class="flex items-baseline gap-3">
        <h2 class="font-display text-[22px] tracking-tight">{{ t("nodes.title") }}</h2>
        <span class="text-[11.5px] text-ink-faint">{{ t("nodes.subtitle") }}</span>
      </div>
      <div class="flex items-center gap-1">
        <div class="mr-1 flex items-center gap-0.5 rounded-lg bg-paper-deep p-0.5">
          <button
            v-for="v in [
              { key: 'tree', label: t('nodes.viewTree'), icon: GitBranch },
              { key: 'overview', label: t('nodes.viewOverview'), icon: FolderTree },
            ]"
            :key="v.key"
            class="flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] transition-colors"
            :class="view === v.key ? 'bg-card text-ink shadow-[0_1px_3px_rgba(34,30,25,0.08)]' : 'text-ink-soft hover:text-ink'"
            @click="view = v.key as 'tree' | 'overview'"
          >
            <component :is="v.icon" :size="11.5" :stroke-width="2" />
            {{ v.label }}
          </button>
        </div>
        <button :class="btn" :title="t('stats.close')" @click="emit('close')">
          <X :size="15" :stroke-width="1.9" />
        </button>
      </div>
    </div>

    <!-- Project picker -->
    <div class="flex flex-wrap items-center gap-1.5 px-8 pb-2 pt-2">
      <button
        v-for="p in projects"
        :key="p.id"
        :class="[
          pill,
          activeId === p.id
            ? 'border-accent/40 bg-accent-soft text-accent'
            : p.archived
              ? 'border-line text-ink-faint/70 line-through hover:text-ink-soft'
              : 'border-line text-ink-soft hover:border-line-soft hover:text-ink',
        ]"
        @click="pick(p.id)"
        @contextmenu="openMenu($event, 'project', p.id)"
      >
        {{ p.name }}
      </button>
      <div class="flex items-center gap-1">
        <input
          v-model="newProject"
          :maxlength="PROJECT_NAME_MAX"
          :placeholder="t('stats.newProject')"
          class="w-[110px] rounded-lg border border-line bg-card px-2 py-1 text-[11.5px] text-ink placeholder:text-ink-faint focus:border-accent/40"
          @keydown.enter.prevent="createProject"
        />
        <button class="rounded-lg px-1.5 py-1 text-[11.5px] text-accent hover:bg-accent-soft" @click="createProject">
          {{ t("stats.create") }}
        </button>
      </div>
    </div>

    <div class="scroll-thin min-h-0 flex-1 overflow-y-auto px-8 pb-6">
      <p v-if="error" class="mb-2 rounded-xl bg-warn-soft/60 px-3 py-2 text-[11.5px] text-warn">{{ error }}</p>

      <div v-if="!active" class="flex flex-col items-center justify-center py-20 text-center">
        <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft">
          <FolderTree :size="20" :stroke-width="1.6" class="text-accent" />
        </div>
        <p class="mt-4 text-[13px] text-ink-soft">{{ t("nodes.pick") }}</p>
        <p class="mt-1 text-[11.5px] text-ink-faint">{{ t("nodes.noProject") }}</p>
      </div>

      <template v-else>
        <!-- Project line: name (click to rename) + progress + archive/delete -->
        <div class="mb-3 flex items-baseline gap-2">
          <input
            v-if="editingProject"
            :ref="grabProject"
            v-model="projectDraft"
            class="min-w-0 max-w-[220px] rounded-lg border border-accent/40 bg-card px-2 py-0.5 text-[14px] text-ink"
            @blur="commitProjectEdit"
            @keydown.enter.prevent="commitProjectEdit"
            @keydown.esc.prevent="editingProject = false"
          />
          <button
            v-else
            class="min-w-0 truncate text-left font-display text-[15px] text-ink transition-colors hover:text-accent"
            :title="t('nodes.menuEdit')"
            @click="startProjectEdit"
          >
            {{ active.name }}
          </button>
          <span class="shrink-0 text-[12px] tabular-nums text-ink-faint">
            {{ t("nodes.progress", { done: doneCount, total: nodes.length }) }}
          </span>
          <span
            v-if="nodes.length && doneCount === nodes.length"
            class="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[10.5px] text-accent"
          >
            {{ t("nodes.allDone") }}
          </span>
          <span v-if="active.archived" class="shrink-0 rounded-full bg-paper-deep px-2 py-0.5 text-[10.5px] text-ink-faint">
            {{ t("nodes.archived") }}
          </span>
          <div class="ml-auto flex items-center gap-0.5">
            <button
              :class="btn"
              :title="active.archived ? t('nodes.unarchive') : t('nodes.archive')"
              @click="toggleArchive"
            >
              <Archive :size="12" :stroke-width="1.9" />
            </button>
            <button
              class="rounded-md p-1 text-ink-faint transition-colors hover:bg-paper-deep hover:text-warn"
              :title="t('nodes.deleteProject')"
              @click="askRemove"
            >
              <Trash2 :size="12" :stroke-width="1.9" />
            </button>
          </div>
        </div>

        <div
          v-if="askDelete"
          class="mb-3 rounded-xl border border-warn/30 bg-warn-soft/40 px-3 py-2 text-[11.5px] text-ink"
        >
          <p class="font-medium">{{ t("nodes.deleteProject") }} — {{ active.name }}</p>
          <p v-if="impact" class="mt-0.5 text-[11px] text-ink-soft">
            {{ t("nodes.deleteImpact", { tasks: impact.tasks, nodes: impact.nodes }) }}
          </p>
          <div class="mt-2 flex items-center gap-2">
            <button
              class="rounded-lg bg-warn px-2 py-1 text-[11px] font-medium text-paper transition-opacity hover:opacity-90"
              @click="confirmRemove"
            >
              {{ t("nodes.deleteConfirm") }}
            </button>
            <button class="rounded-lg px-2 py-1 text-[11px] text-ink-soft hover:bg-paper-deep" @click="askDelete = false">
              {{ t("nodes.deleteCancel") }}
            </button>
          </div>
        </div>

        <p v-if="loading" class="py-6 text-center text-[12px] text-ink-faint">{{ t("history.loading") }}</p>

        <!-- ============ Overview: fishbone ============ -->
        <template v-else-if="view === 'overview'">
          <div class="rounded-2xl border border-line-soft bg-card px-3 py-3">
            <div class="flex items-baseline gap-2 px-1">
              <span class="text-[11px] font-medium tracking-[0.1em] text-ink-faint">{{ t("nodes.overview") }}</span>
              <span class="text-[11px] text-ink-faint">
                {{ t("nodes.overviewHint", { n: nodes.length, tasks: projectTasks.length }) }}
              </span>
            </div>
            <div v-if="!nodes.length" class="py-10 text-center text-[12px] text-ink-faint">
              {{ t("nodes.emptyHint") }}
            </div>
            <div v-else class="scroll-thin overflow-x-auto">
              <svg :width="spineWidth" height="252" class="mt-1">
                <!-- spine -->
                <line x1="24" :y1="126" :x2="spineWidth - 78" :y2="126" stroke="var(--color-line)" stroke-width="1.5" />
                <!-- head: the project itself -->
                <g>
                  <rect
                    :x="spineWidth - 78"
                    y="108"
                    width="66"
                    height="36"
                    rx="9"
                    fill="var(--color-accent)"
                    fill-opacity="0.12"
                    stroke="var(--color-accent)"
                    stroke-opacity="0.35"
                  />
                  <text
                    :x="spineWidth - 45"
                    y="131"
                    text-anchor="middle"
                    font-size="11.5"
                    fill="var(--color-ink)"
                  >
                    {{ t("nodes.spineDone", { done: doneCount, total: nodes.length }) }}
                  </text>
                </g>
                <!-- bones -->
                <g v-for="b in bones" :key="b.id">
                  <line
                    :x1="b.x"
                    y1="126"
                    :x2="b.x + 26"
                    :y2="b.up ? 48 : 204"
                    :stroke="b.done ? 'var(--color-accent)' : 'var(--color-line)'"
                    :stroke-opacity="b.done ? 0.5 : 1"
                    stroke-width="1.5"
                  />
                  <circle
                    :cx="b.x + 26"
                    :cy="b.up ? 48 : 204"
                    r="3.4"
                    :fill="b.done ? 'var(--color-accent)' : 'var(--color-line)'"
                  />
                  <text
                    :x="b.x + 34"
                    :y="b.up ? 44 : 208"
                    font-size="11"
                    :fill="b.done ? 'var(--color-ink-faint)' : 'var(--color-ink)'"
                    :text-decoration="b.done ? 'line-through' : 'none'"
                  >
                    {{ b.title.length > 6 ? b.title.slice(0, 6) + "…" : b.title }}
                  </text>
                  <text
                    :x="b.x + 34"
                    :y="b.up ? 58 : 222"
                    font-size="10"
                    fill="var(--color-ink-faint)"
                  >
                    {{ t("nodes.boneCount", { open: b.open, total: b.total }) }}
                  </text>
                </g>
              </svg>
            </div>
            <div class="mt-1 flex items-center gap-3 border-t border-line-soft px-1 pt-2 text-[11px] text-ink-faint">
              <span>{{ t("nodes.projectTasksCount", { n: openTasks }) }}</span>
              <span v-if="looseTasks.length">· {{ t("nodes.noStepTasks") }} {{ looseTasks.length }}</span>
            </div>
          </div>
        </template>

        <!-- ============ Tree: steps, each holding its tasks ============ -->
        <template v-else>
          <div v-if="!nodes.length" class="flex flex-col items-center justify-center py-12 text-center">
            <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-paper-deep">
              <CircleDashed :size="18" :stroke-width="1.6" class="text-ink-faint" />
            </div>
            <p class="mt-3 text-[13px] text-ink-soft">{{ t("nodes.empty") }}</p>
            <p class="mt-1 text-[11.5px] text-ink-faint">{{ t("nodes.emptyHint") }}</p>
          </div>

          <ol v-else class="relative">
            <li v-for="(node, i) in nodes" :key="node.id" class="flex gap-3">
              <div class="flex flex-col items-center">
                <button
                  class="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition-all duration-150"
                  :class="
                    node.done
                      ? 'border-accent bg-accent text-white'
                      : 'border-line bg-transparent text-transparent hover:border-accent hover:bg-accent-soft hover:text-accent'
                  "
                  :title="node.done ? t('nodes.reopen') : t('nodes.complete')"
                  @click="toggle(node)"
                >
                  <Check :size="11" :stroke-width="3" />
                </button>
                <span v-if="i < nodes.length - 1" class="my-1 w-px flex-1" :class="node.done ? 'bg-accent/40' : 'bg-line'" />
              </div>

              <div class="group min-w-0 flex-1 pb-3">
                <div
                  class="flex items-baseline gap-2"
                  @contextmenu="openMenu($event, 'node', node.id)"
                >
                  <input
                    v-if="editingId === node.id"
                    :ref="grabEdit"
                    v-model="editingTitle"
                    class="min-w-0 flex-1 rounded-lg border border-accent/40 bg-card px-2 py-0.5 text-[13.5px] text-ink"
                    @blur="commitEdit(node)"
                    @keydown.enter.prevent="commitEdit(node)"
                    @keydown.esc.prevent="editingId = null"
                  />
                  <button
                    v-else
                    class="min-w-0 truncate text-left text-[13.5px] leading-6 transition-colors hover:text-accent"
                    :class="node.done ? 'text-ink-faint line-through' : 'text-ink'"
                    @click="startEdit(node)"
                  >
                    {{ node.title }}
                  </button>
                  <span
                    v-if="node.id === firstOpenId && !node.done"
                    class="shrink-0 rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] text-accent"
                  >
                    {{ t("nodes.current") }}
                  </span>
                  <span class="shrink-0 text-[11px] tabular-nums text-ink-faint">
                    {{ t("nodes.stepTasks", { n: tasksOf(node.id).length }) }}
                  </span>
                  <button
                    class="shrink-0 rounded-md p-1 text-ink-faint opacity-0 transition-all hover:bg-paper-deep hover:text-accent group-hover:opacity-100"
                    :title="t('nodes.menuNewTask')"
                    @click="startAdding(node.id)"
                  >
                    <Plus :size="12" :stroke-width="2" />
                  </button>
                </div>

                <!-- The tasks under this step -->
                <ul v-if="tasksOf(node.id).length" class="mt-1 space-y-0.5 border-l border-line-soft pl-3">
                  <li
                    v-for="task in tasksOf(node.id)"
                    :key="task.id"
                    class="group/task flex items-center gap-2"
                    @contextmenu="openMenu($event, 'task', task.id)"
                  >
                    <button
                      class="flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full border transition-colors"
                      :class="
                        task.done
                          ? 'border-accent/50 bg-accent/10 text-accent'
                          : 'border-line text-transparent hover:border-accent hover:bg-accent-soft hover:text-accent'
                      "
                      :title="task.done ? t('nodes.reopen') : t('nodes.complete')"
                      @click="toggleTask(task)"
                    >
                      <Check :size="9.5" :stroke-width="3" />
                    </button>
                    <input
                      v-if="editingTaskId === task.id"
                      :ref="grabTask"
                      v-model="taskTitleDraft"
                      class="min-w-0 flex-1 rounded-lg border border-accent/40 bg-card px-1.5 py-0.5 text-[12.5px] text-ink"
                      @blur="commitTaskEdit(task)"
                      @keydown.enter.prevent="commitTaskEdit(task)"
                      @keydown.esc.prevent="editingTaskId = null"
                    />
                    <button
                      v-else
                      class="min-w-0 flex-1 truncate text-left text-[12.5px] leading-5 transition-colors hover:text-accent"
                      :class="task.done ? 'text-ink-faint line-through' : 'text-ink'"
                      @click="startTaskEdit(task)"
                    >
                      {{ task.title }}
                    </button>
                    <span v-if="!task.done" class="shrink-0 text-[10.5px] text-ink-faint">{{ taskWhen(task) }}</span>
                  </li>
                </ul>

                <!-- New task, created straight under this step -->
                <div v-if="addingUnder === node.id" class="mt-1 flex items-center gap-1.5 pl-3">
                  <input
                    v-model="addDraft"
                    :placeholder="t('nodes.taskPlaceholder')"
                    class="min-w-0 flex-1 rounded-lg border border-accent/40 bg-card px-2 py-1 text-[12px] text-ink placeholder:text-ink-faint"
                    :ref="grabAdd"
                    @keydown.enter.prevent="commitAdd"
                    @keydown.esc.prevent="addingUnder = null"
                  />
                  <button
                    class="rounded-lg px-1.5 py-1 text-[11px] text-accent hover:bg-accent-soft disabled:opacity-40"
                    :disabled="!addDraft.trim()"
                    @click="commitAdd"
                  >
                    {{ t("nodes.addTask") }}
                  </button>
                </div>
              </div>
            </li>
          </ol>

          <!-- Add the next step -->
          <div class="mt-2 flex items-center gap-1.5 pl-[30px]">
            <Plus :size="13" :stroke-width="2" class="shrink-0 text-ink-faint" />
            <input
              v-model="draft"
              :placeholder="t('nodes.placeholder')"
              class="min-w-0 flex-1 rounded-lg border border-line bg-card px-2 py-1 text-[12.5px] text-ink placeholder:text-ink-faint focus:border-accent/40"
              @keydown.enter.prevent="addNode"
            />
            <button
              class="rounded-lg px-2 py-1 text-[11.5px] text-accent transition-colors hover:bg-accent-soft disabled:opacity-40"
              :disabled="!draft.trim()"
              @click="addNode"
            >
              {{ t("nodes.add") }}
            </button>
          </div>

          <!-- Tasks filed under the project but under none of its steps -->
          <div v-if="looseTasks.length" class="mt-4 border-t border-line-soft pt-3">
            <div class="flex items-baseline gap-2">
              <h3 class="text-[12px] font-medium text-ink-soft">{{ t("nodes.noStepTasks") }}</h3>
              <span class="text-[11px] tabular-nums text-ink-faint">{{ looseTasks.length }}</span>
            </div>
            <ul class="mt-1 space-y-0.5">
              <li
                v-for="task in looseTasks"
                :key="task.id"
                class="group/task flex items-center gap-2"
                @contextmenu="openMenu($event, 'task', task.id)"
              >
                <button
                  class="flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full border transition-colors"
                  :class="
                    task.done
                      ? 'border-accent/50 bg-accent/10 text-accent'
                      : 'border-line text-transparent hover:border-accent hover:bg-accent-soft hover:text-accent'
                  "
                  :title="task.done ? t('nodes.reopen') : t('nodes.complete')"
                  @click="toggleTask(task)"
                >
                  <Check :size="9.5" :stroke-width="3" />
                </button>
                <input
                  v-if="editingTaskId === task.id"
                  :ref="grabTask"
                  v-model="taskTitleDraft"
                  class="min-w-0 flex-1 rounded-lg border border-accent/40 bg-card px-1.5 py-0.5 text-[12.5px] text-ink"
                  @blur="commitTaskEdit(task)"
                  @keydown.enter.prevent="commitTaskEdit(task)"
                  @keydown.esc.prevent="editingTaskId = null"
                />
                <button
                  v-else
                  class="min-w-0 flex-1 truncate text-left text-[12.5px] leading-5 transition-colors hover:text-accent"
                  :class="task.done ? 'text-ink-faint line-through' : 'text-ink'"
                  @click="startTaskEdit(task)"
                >
                  {{ task.title }}
                </button>
                <span v-if="!task.done" class="shrink-0 text-[10.5px] text-ink-faint">{{ taskWhen(task) }}</span>
              </li>
            </ul>
          </div>

          <div v-if="!projectTasks.length && nodes.length" class="mt-4 text-[11.5px] text-ink-faint">
            <CornerDownRight :size="10" :stroke-width="2" class="mr-1 inline" />
            {{ t("nodes.projectTasksEmpty") }}
          </div>
        </template>
      </template>
    </div>

    <!-- Right-click menu -->
    <Teleport to="body">
      <div v-if="menu" class="fixed inset-0 z-[60]" @click.stop="closeMenu" @contextmenu.prevent="closeMenu" />
      <div
        v-if="menu"
        class="fixed z-[61] w-[176px] overflow-hidden rounded-xl border border-line bg-card py-1 shadow-[0_10px_28px_rgba(34,30,25,0.16)]"
        :style="{ left: menu.x + 'px', top: menu.y + 'px' }"
      >
        <button :class="menuRow" @click.stop="editFromMenu">
          <span class="w-3.5 text-ink-faint">✎</span>
          {{ t("nodes.menuEdit") }}
        </button>
        <template v-if="menu.kind === 'node'">
          <button :class="menuRow" @click.stop="addTaskFromMenu">
            <Plus :size="12" :stroke-width="2" class="text-ink-faint" />
            {{ t("nodes.menuNewTask") }}
          </button>
          <button :class="menuRow" @click.stop="deleteFromMenu">
            <Trash2 :size="12" :stroke-width="2" class="text-warn" />
            {{ t("nodes.menuDeleteStep") }}
          </button>
        </template>
        <template v-else-if="menu.kind === 'task'">
          <div class="mt-1 border-t border-line-soft px-2.5 pb-1 pt-1.5 text-[10.5px] text-ink-faint">
            {{ t("nodes.menuMoveTo") }}
          </div>
          <button
            v-for="n in nodes"
            :key="n.id"
            :class="menuRow"
            class="pl-5"
            :disabled="menuTask?.nodeId === n.id"
            @click.stop="moveTo(n.id)"
          >
            <span class="min-w-0 truncate">{{ n.title }}</span>
            <Check v-if="menuTask?.nodeId === n.id" :size="11" :stroke-width="2.4" class="ml-auto text-accent" />
          </button>
          <button :class="menuRow" class="pl-5" @click.stop="moveTo(null)">
            {{ t("nodes.menuDetach") }}
          </button>
          <button :class="[menuRow, 'mt-1 border-t border-line-soft pt-2']" @click.stop="deleteFromMenu">
            <Trash2 :size="12" :stroke-width="2" class="text-warn" />
            {{ t("nodes.menuDelete") }}
          </button>
        </template>
        <template v-else>
          <button :class="menuRow" @click.stop="deleteFromMenu">
            <Trash2 :size="12" :stroke-width="2" class="text-warn" />
            {{ t("nodes.deleteProject") }}
          </button>
        </template>
      </div>
    </Teleport>
  </div>
</template>
