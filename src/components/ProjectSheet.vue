<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";
import { Archive, Check, CircleDashed, CornerDownRight, FolderTree, Plus, Trash2, X } from "lucide-vue-next";
import { api, type Node, type Task } from "@/lib/api";
import { useDayStore } from "@/stores/day";
import { dayLabel, t } from "@/lib/i18n";
import { PROJECT_NAME_MAX, validateProjectName } from "@/lib/classes";

const store = useDayStore();
const emit = defineEmits<{ (e: "close"): void }>();

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
const newProject = ref("");
const error = ref("");
const askDelete = ref(false);
const impact = ref<{ tasks: number; nodes: number } | null>(null);

const projects = computed(() => [...store.projects].sort((a, b) => Number(a.archived) - Number(b.archived)));
const active = computed(() => projects.value.find((p) => p.id === activeId.value) ?? null);
const doneCount = computed(() => nodes.value.filter((n) => n.done).length);
const firstOpenId = computed(() => nodes.value.find((n) => !n.done)?.id ?? null);

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

async function toggleTask(task: Task) {
  try {
    await store.toggle(task);
    if (activeId.value) projectTasks.value = await api.listProjectTasks(activeId.value);
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
  askDelete.value = false;
  void load(id);
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
    nodes.value = await api.saveNode({
      id: node.id,
      projectId: node.projectId,
      title,
      note: node.note,
    });
  } catch {
    error.value = t("stats.error");
  }
}

onMounted(async () => {
  await store.loadClasses();
  activeId.value = store.projects.find((p) => !p.archived)?.id ?? store.projects[0]?.id ?? null;
  await load();
});
</script>

<template>
  <div class="absolute inset-0 z-30 flex flex-col bg-paper">
    <div class="flex items-center justify-between px-8 pb-1 pt-6">
      <div class="flex items-baseline gap-3">
        <h2 class="font-display text-[22px] tracking-tight">{{ t("nodes.title") }}</h2>
        <span class="text-[11.5px] text-ink-faint">{{ t("nodes.subtitle") }}</span>
      </div>
      <button
        class="rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-paper-deep hover:text-ink"
        :title="t('stats.close')"
        @click="emit('close')"
      >
        <X :size="15" :stroke-width="1.9" />
      </button>
    </div>

    <!-- Project picker -->
    <div class="flex flex-wrap items-center gap-1.5 px-8 pb-2 pt-2">
      <button
        v-for="p in projects"
        :key="p.id"
        class="max-w-[150px] truncate rounded-full border px-2.5 py-1 text-[12px] transition-colors"
        :class="
          activeId === p.id
            ? 'border-accent/40 bg-accent-soft text-accent'
            : p.archived
              ? 'border-line text-ink-faint/70 line-through hover:text-ink-soft'
              : 'border-line text-ink-soft hover:border-line-soft hover:text-ink'
        "
        @click="pick(p.id)"
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
        <button
          class="rounded-lg px-1.5 py-1 text-[11.5px] text-accent hover:bg-accent-soft"
          @click="createProject"
        >
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
        <div class="mb-3 flex items-baseline gap-2">
          <span class="text-[12px] tabular-nums text-ink-faint">
            {{ t("nodes.progress", { done: doneCount, total: nodes.length }) }}
          </span>
          <span
            v-if="nodes.length && doneCount === nodes.length"
            class="rounded-full bg-accent-soft px-2 py-0.5 text-[10.5px] text-accent"
          >
            {{ t("nodes.allDone") }}
          </span>
          <span v-if="active.archived" class="rounded-full bg-paper-deep px-2 py-0.5 text-[10.5px] text-ink-faint">
            {{ t("nodes.archived") }}
          </span>
          <div class="ml-auto flex items-center gap-0.5">
            <button
              class="rounded-md p-1 text-ink-faint transition-colors hover:bg-paper-deep hover:text-ink"
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

        <div v-else-if="!nodes.length" class="flex flex-col items-center justify-center py-12 text-center">
          <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-paper-deep">
            <CircleDashed :size="18" :stroke-width="1.6" class="text-ink-faint" />
          </div>
          <p class="mt-3 text-[13px] text-ink-soft">{{ t("nodes.empty") }}</p>
          <p class="mt-1 text-[11.5px] text-ink-faint">{{ t("nodes.emptyHint") }}</p>
        </div>

        <ol v-else class="relative">
          <li v-for="(node, i) in nodes" :key="node.id" class="flex gap-3">
            <!-- Connector + tick -->
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
              <span
                v-if="i < nodes.length - 1"
                class="my-1 w-px flex-1"
                :class="node.done ? 'bg-accent/40' : 'bg-line'"
              />
            </div>

            <div class="group min-w-0 flex-1 pb-3">
              <div class="flex items-baseline gap-2">
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
                <span v-if="node.note" class="shrink-0 truncate text-[11px] text-ink-faint">
                  <CornerDownRight :size="10" :stroke-width="2" class="inline" />
                  {{ node.note }}
                </span>
                <button
                  class="ml-auto shrink-0 rounded-md p-1 text-ink-faint opacity-0 transition-all hover:bg-paper-deep hover:text-warn group-hover:opacity-100"
                  :title="t('nodes.delete')"
                  @click="remove(node)"
                >
                  <Trash2 :size="12" :stroke-width="1.9" />
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

        <!-- What is actually filed under this project -->
        <div class="mt-6 border-t border-line-soft pt-3">
          <div class="flex items-baseline gap-2">
            <h3 class="text-[12.5px] font-medium text-ink-soft">{{ t("nodes.projectTasks") }}</h3>
            <span class="text-[11px] tabular-nums text-ink-faint">
              {{ t("nodes.projectTasksCount", { n: projectTasks.filter((x) => !x.done).length }) }}
            </span>
          </div>
          <p v-if="!projectTasks.length" class="mt-2 text-[11.5px] text-ink-faint">
            {{ t("nodes.projectTasksEmpty") }}
          </p>
          <ul v-else class="mt-2 space-y-0.5">
            <li v-for="task in projectTasks" :key="task.id" class="group flex items-center gap-2 py-0.5">
              <button
                class="flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-full border transition-colors"
                :class="
                  task.done
                    ? 'border-accent/50 bg-accent/10 text-accent'
                    : 'border-line text-transparent hover:border-accent hover:bg-accent-soft hover:text-accent'
                "
                :title="task.done ? t('nodes.reopen') : t('nodes.complete')"
                @click="toggleTask(task)"
              >
                <Check :size="10" :stroke-width="3" />
              </button>
              <span
                class="min-w-0 flex-1 truncate text-[13px]"
                :class="task.done ? 'text-ink-faint line-through' : 'text-ink'"
              >
                {{ task.title }}
              </span>
              <span v-if="!task.done" class="shrink-0 text-[11px] text-ink-faint">{{ taskWhen(task) }}</span>
            </li>
          </ul>
        </div>
      </template>
    </div>
  </div>
</template>
