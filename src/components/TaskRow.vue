<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { Check, Inbox, Sunrise, Trash2 } from "lucide-vue-next";
import type { Task } from "@/lib/api";
import { useDayStore } from "@/stores/day";
import { heldDays, timeLabel } from "@/lib/utils";
import { t } from "@/lib/i18n";

const props = defineProps<{ task: Task; showActions?: boolean }>();
const store = useDayStore();

const editing = ref(false);
const draft = ref("");
const noteEl = ref<HTMLTextAreaElement | null>(null);

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
</script>

<template>
  <div
    class="group relative flex items-start gap-3 rounded-xl px-2.5 py-2 transition-colors hover:bg-card"
    :class="task.done && 'opacity-50'"
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
        <p
          class="truncate text-[14.5px] leading-6 transition-all"
          :class="task.done ? 'text-ink-faint line-through' : 'text-ink'"
        >
          {{ task.title }}
        </p>
      </div>

      <!-- Note: where did it get to -->
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
  </div>
</template>

<style scoped>
textarea {
  field-sizing: content;
}
</style>
