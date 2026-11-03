<script setup lang="ts">
import { computed, ref } from "vue";
import { ArrowRight, Inbox, Sunrise, Trash2, X } from "lucide-vue-next";
import { useDayStore } from "@/stores/day";
import { t } from "@/lib/i18n";

const store = useDayStore();
const emit = defineEmits<{ (e: "close"): void }>();

const left = computed(() => store.tasks);
const tomorrowNote = ref("");

async function finish(pushAll: boolean) {
  await store.closeOut(pushAll, tomorrowNote.value);
  emit("close");
}

const pill = "flex items-center gap-1 rounded-lg px-2 py-1 text-[11.5px] transition-colors";
</script>

<template>
  <div class="absolute inset-0 z-30 flex flex-col bg-paper/97 backdrop-blur-md">
    <div class="sheet-up flex flex-1 flex-col overflow-hidden">
      <div class="flex items-start justify-between px-8 pb-4 pt-2">
        <div>
          <h2 class="font-display text-[26px] leading-tight tracking-tight">
            {{ t("closeout.title") }}
          </h2>
          <p class="mt-1 text-[12.5px] text-ink-soft">
            <template v-if="left.length">
              {{ t("closeout.left", { n: left.length }) }}
            </template>
            <template v-else>{{ t("closeout.clear") }}</template>
          </p>
        </div>
        <button
          class="rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-paper-deep hover:text-ink"
          @click="emit('close')"
        >
          <X :size="15" :stroke-width="1.9" />
        </button>
      </div>

      <div class="scroll-thin flex-1 overflow-y-auto px-8">
        <!-- A line for tomorrow -->
        <div class="mb-4 rounded-xl border border-line-soft bg-card/60 px-3.5 py-3">
          <label class="block text-[11px] font-medium tracking-[0.08em] text-ink-faint">
            {{ t("closeout.noteLabel") }}
          </label>
          <textarea
            v-model="tomorrowNote"
            rows="2"
            class="mt-1.5 w-full resize-none bg-transparent text-[13.5px] leading-6 text-ink placeholder:text-ink-faint/70 focus:outline-none"
            :placeholder="t('closeout.notePlaceholder')"
          />
        </div>

        <div v-if="!left.length" class="flex flex-col items-center justify-center py-14">
          <div class="h-12 w-12 rounded-full bg-accent-soft" />
          <p class="mt-4 text-[13px] text-ink-soft">{{ t("closeout.empty") }}</p>
        </div>

        <div v-else class="space-y-1.5 pb-4">
          <div
            v-for="task in left"
            :key="task.id"
            class="group flex items-center gap-3 rounded-xl border border-transparent bg-card px-3.5 py-2.5 transition-colors hover:border-line"
          >
            <span class="min-w-0 flex-1 truncate text-[14px]">{{ task.title }}</span>

            <div
              class="flex shrink-0 items-center gap-1 opacity-60 transition-opacity group-hover:opacity-100"
            >
              <button
                :class="[pill, 'bg-accent-soft text-accent hover:bg-accent hover:text-white']"
                @click="store.tomorrow(task.id)"
              >
                <Sunrise :size="12" :stroke-width="2" />{{ t("capture.tomorrow") }}
              </button>
              <button
                :class="[pill, 'text-ink-soft hover:bg-paper-deep']"
                @click="store.toInbox(task.id)"
              >
                <Inbox :size="12" :stroke-width="2" />{{ t("capture.inbox") }}
              </button>
              <button
                :class="[pill, 'text-ink-faint hover:bg-paper-deep hover:text-ink']"
                @click="store.drop(task.id)"
              >
                <Trash2 :size="12" :stroke-width="2" />{{ t("task.act.drop") }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="flex items-center gap-2.5 border-t border-line-soft px-8 py-4">
        <button
          class="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-ink px-4 py-2.5 text-[13.5px] font-medium text-paper transition-colors hover:bg-ink/90 disabled:opacity-40"
          :disabled="!left.length || store.busy"
          @click="finish(true)"
        >
          {{ t("closeout.pushAll") }}
          <ArrowRight :size="14" :stroke-width="2.2" />
        </button>
        <button
          class="rounded-xl border border-line px-4 py-2.5 text-[13.5px] text-ink-soft transition-colors hover:bg-card disabled:opacity-40"
          :disabled="store.busy"
          @click="finish(false)"
        >
          {{ t("closeout.keep") }}
        </button>
      </div>
    </div>
  </div>
</template>
