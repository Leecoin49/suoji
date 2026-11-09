<script setup lang="ts">
import { computed, ref } from "vue";
import { Check, FolderPlus, Loader2, Tag as TagIcon, X } from "lucide-vue-next";
import { useDayStore } from "@/stores/day";
import { t } from "@/lib/i18n";
import {
  PROJECT_NAME_MAX,
  TAG_NAME_MAX,
  TAGS_PER_TASK,
  validateProjectName,
  validateTagName,
} from "@/lib/classes";

const store = useDayStore();
const emit = defineEmits<{ (e: "close"): void }>();

const task = computed(() => store.classTask);
const busy = ref(false);
const error = ref("");

const projectDraft = ref("");
const tagDraft = ref("");

const openProjects = computed(() => store.projects.filter((p) => !p.archived));
const currentProject = computed(() => task.value?.projectId ?? null);
const chosenTags = computed(() => task.value?.tagIds ?? []);

function fail(reason: "empty" | "long" | "taken" | "limit", max?: number) {
  error.value =
    reason === "empty"
      ? t("stats.nameEmpty")
      : reason === "long"
        ? t("stats.nameTooLong", { n: max ?? 0 })
        : reason === "limit"
          ? t("stats.tagsLimit", { n: TAGS_PER_TASK })
          : t("stats.nameTaken");
}

async function pick(target: string | null) {
  if (!task.value || busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    await store.setTaskProject(task.value.id, target);
  } catch {
    error.value = t("stats.error");
  } finally {
    busy.value = false;
  }
}

async function toggleTag(id: string) {
  if (!task.value || busy.value) return;
  const current = chosenTags.value;
  const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
  if (next.length > TAGS_PER_TASK) {
    fail("limit");
    return;
  }
  busy.value = true;
  error.value = "";
  try {
    await store.setTaskTags(task.value.id, next);
  } catch {
    error.value = t("stats.error");
  } finally {
    busy.value = false;
  }
}

async function createProject() {
  const check = validateProjectName(projectDraft.value);
  if (!check.ok) {
    fail(check.reason, PROJECT_NAME_MAX);
    return;
  }
  if (openProjects.value.some((p) => p.name.toLowerCase() === check.name.toLowerCase())) {
    fail("taken");
    return;
  }
  busy.value = true;
  error.value = "";
  try {
    const saved = await store.saveProject(check.name);
    projectDraft.value = "";
    await pick(saved.id);
  } catch (e) {
    error.value = String(e).includes("duplicate") ? t("stats.nameTaken") : t("stats.error");
  } finally {
    busy.value = false;
  }
}

async function createTag() {
  const check = validateTagName(tagDraft.value);
  if (!check.ok) {
    fail(check.reason, TAG_NAME_MAX);
    return;
  }
  if (store.tags.some((x) => x.name.toLowerCase() === check.name.toLowerCase())) {
    fail("taken");
    return;
  }
  busy.value = true;
  error.value = "";
  try {
    const saved = await store.saveTag(check.name);
    tagDraft.value = "";
    await store.setTaskTags(task.value?.id ?? "", [...chosenTags.value, saved.id]);
  } catch (e) {
    error.value = String(e).includes("duplicate") ? t("stats.nameTaken") : t("stats.error");
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div
    v-if="task"
    class="absolute inset-0 z-40 flex items-center justify-center bg-ink/10 px-6"
    @click.self="emit('close')"
  >
    <div class="w-full max-w-[430px] rounded-2xl border border-line bg-card p-5 shadow-[0_18px_40px_rgba(34,30,25,0.16)]">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <h2 class="font-display text-[19px] leading-6 tracking-tight">{{ t("stats.assignTitle") }}</h2>
          <p class="mt-0.5 truncate text-[12.5px] text-ink-faint">{{ task.title }}</p>
        </div>
        <button
          class="rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-paper-deep hover:text-ink"
          :title="t('stats.close')"
          @click="emit('close')"
        >
          <X :size="15" :stroke-width="1.9" />
        </button>
      </div>

      <!-- Project -->
      <div class="mt-4">
        <p class="text-[11.5px] font-medium uppercase tracking-wide text-ink-faint">
          {{ t("stats.projectLabel") }}
        </p>
        <div class="mt-1.5 flex flex-wrap gap-1.5">
          <button
            class="rounded-full border px-2.5 py-1 text-[12px] transition-colors"
            :class="
              currentProject === null
                ? 'border-accent/40 bg-accent-soft text-accent'
                : 'border-line text-ink-soft hover:border-line-soft hover:text-ink'
            "
            @click="pick(null)"
          >
            {{ t("stats.noneProject") }}
          </button>
          <button
            v-for="p in openProjects"
            :key="p.id"
            class="flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] transition-colors"
            :class="
              currentProject === p.id
                ? 'border-accent/40 bg-accent-soft text-accent'
                : 'border-line text-ink-soft hover:border-line-soft hover:text-ink'
            "
            @click="pick(p.id)"
          >
            <Check v-if="currentProject === p.id" :size="11" :stroke-width="3" />
            {{ p.name }}
          </button>
        </div>
        <div class="mt-2 flex items-center gap-1.5">
          <input
            v-model="projectDraft"
            :maxlength="PROJECT_NAME_MAX"
            :placeholder="t('stats.newProject')"
            class="min-w-0 flex-1 rounded-lg border border-line bg-paper px-2 py-1 text-[12px] text-ink placeholder:text-ink-faint focus:border-accent/40"
            @keydown.enter.prevent="createProject"
          />
          <button
            class="flex items-center gap-1 rounded-lg px-2 py-1 text-[11.5px] text-accent transition-colors hover:bg-accent-soft disabled:opacity-40"
            :disabled="busy"
            @click="createProject"
          >
            <FolderPlus :size="12" :stroke-width="2" />
            {{ t("stats.create") }}
          </button>
        </div>
      </div>

      <!-- Tags -->
      <div class="mt-4">
        <div class="flex items-baseline justify-between">
          <p class="text-[11.5px] font-medium uppercase tracking-wide text-ink-faint">
            {{ t("stats.tagLabel") }}
          </p>
          <span class="text-[10.5px] text-ink-faint">{{ chosenTags.length }}/{{ TAGS_PER_TASK }}</span>
        </div>
        <div v-if="store.tags.length" class="mt-1.5 flex flex-wrap gap-1.5">
          <button
            v-for="tag in store.tags"
            :key="tag.id"
            class="flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] transition-colors"
            :class="
              chosenTags.includes(tag.id)
                ? 'border-accent/40 bg-accent-soft text-accent'
                : 'border-line text-ink-soft hover:border-line-soft hover:text-ink'
            "
            @click="toggleTag(tag.id)"
          >
            <TagIcon v-if="chosenTags.includes(tag.id)" :size="10" :stroke-width="2.4" />
            {{ tag.name }}
          </button>
        </div>
        <p v-else class="mt-1.5 text-[11.5px] text-ink-faint">{{ t("stats.classEmptyHint") }}</p>
        <div class="mt-2 flex items-center gap-1.5">
          <input
            v-model="tagDraft"
            :maxlength="TAG_NAME_MAX"
            :placeholder="t('stats.newTag')"
            class="min-w-0 flex-1 rounded-lg border border-line bg-paper px-2 py-1 text-[12px] text-ink placeholder:text-ink-faint focus:border-accent/40"
            @keydown.enter.prevent="createTag"
          />
          <button
            class="rounded-lg px-2 py-1 text-[11.5px] text-accent transition-colors hover:bg-accent-soft disabled:opacity-40"
            :disabled="busy"
            @click="createTag"
          >
            {{ t("stats.create") }}
          </button>
        </div>
      </div>

      <div class="mt-3 flex min-h-[18px] items-center justify-between gap-2">
        <p class="text-[11px] text-warn">{{ error }}</p>
        <Loader2 v-if="busy" class="animate-spin text-ink-faint" :size="13" />
        <button
          class="rounded-lg px-2.5 py-1 text-[11.5px] text-ink-soft transition-colors hover:bg-paper-deep hover:text-ink"
          @click="emit('close')"
        >
          {{ t("stats.close") }}
        </button>
      </div>
    </div>
  </div>
</template>
