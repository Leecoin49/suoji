<script setup lang="ts">
import { computed } from "vue";
import { CheckCircle2, Download, RotateCcw, Sparkles, TriangleAlert, X } from "lucide-vue-next";
import { useUpdateStore } from "@/stores/update";
import { dayLabel } from "@/lib/i18n";
import { t } from "@/lib/i18n";

const emit = defineEmits<{ (e: "close"): void }>();
const update = useUpdateStore();

const showRelease = computed(() =>
  ["available", "downloading", "ready", "error"].includes(update.phase) && !!update.version
);

const statusHint = computed(() => {
  switch (update.phase) {
    case "checking":
      return t("update.checking");
    case "latest":
      return t("update.latest");
    case "available":
      return t("update.available", { v: update.version });
    case "downloading":
      return t("update.downloading", { p: update.progress });
    case "ready":
      return t("update.ready");
    case "error":
      return update.error;
    default:
      return t("update.idle");
  }
});

const primary =
  "rounded-xl bg-ink px-5 py-2 text-[13px] font-medium text-paper transition-colors hover:bg-ink/90 disabled:opacity-40";
const secondary =
  "rounded-xl border border-line px-4 py-2 text-[13px] text-ink-soft transition-colors hover:bg-card disabled:opacity-40";
</script>

<template>
  <div class="absolute inset-0 z-30 flex flex-col bg-paper">
    <div class="flex items-start justify-between px-8 pb-2 pt-6">
      <div>
        <h2 class="font-display text-[22px] tracking-tight">{{ t("update.title") }}</h2>
        <p class="mt-1 text-[12px] text-ink-faint">{{ t("update.subtitle") }}</p>
      </div>
      <button
        class="rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-paper-deep hover:text-ink"
        @click="emit('close')"
      >
        <X :size="15" :stroke-width="1.9" />
      </button>
    </div>

    <div class="scroll-thin flex-1 space-y-5 overflow-y-auto px-8 py-4">
      <!-- Current state -->
      <section class="rounded-2xl bg-card px-4 py-3.5">
        <div class="flex items-center gap-3">
          <component
            :is="
              update.phase === 'latest'
                ? CheckCircle2
                : update.phase === 'error'
                  ? TriangleAlert
                  : update.phase === 'ready'
                    ? Sparkles
                    : Download
            "
            :size="17"
            :stroke-width="1.9"
            :class="
              update.phase === 'error'
                ? 'text-warn'
                : update.phase === 'ready'
                  ? 'text-accent'
                  : 'text-ink-faint'
            "
          />
          <div class="min-w-0 flex-1">
            <p class="text-[13px] text-ink">{{ statusHint }}</p>
            <p class="mt-0.5 text-[11.5px] text-ink-faint">
              {{ t("update.current", { v: update.currentVersion || "—" }) }}
            </p>
          </div>
          <button
            :class="secondary"
            class="shrink-0 !py-1.5 !text-[12px]"
            :disabled="update.busy"
            @click="update.checkNow()"
          >
            {{ t("update.check") }}
          </button>
        </div>

        <!-- Progress -->
        <div v-if="update.phase === 'downloading'" class="mt-3 h-1 overflow-hidden rounded-full bg-line-soft">
          <div
            class="h-full rounded-full bg-accent transition-all duration-300"
            :style="{ width: Math.max(4, update.progress) + '%' }"
          />
        </div>
      </section>

      <!-- Release notes -->
      <section v-if="showRelease" class="space-y-2">
        <div class="flex items-baseline gap-2">
          <h3 class="text-[11px] font-medium tracking-[0.14em] text-ink-faint">
            {{ t("update.notes") }}
          </h3>
          <span class="text-[12.5px] text-ink">v{{ update.version }}</span>
          <span v-if="update.releasedAt" class="text-[11.5px] text-ink-faint">
            {{ dayLabel(update.releasedAt) }}
          </span>
        </div>
        <div class="rounded-2xl border border-line-soft bg-card/60 px-4 py-3">
          <pre class="whitespace-pre-wrap font-sans text-[12.5px] leading-6 text-ink-soft">{{ update.notes || t("update.noNotes") }}</pre>
        </div>
      </section>

      <p v-if="update.isIgnored && showRelease" class="text-[12px] text-ink-faint">
        {{ t("update.ignored", { v: update.version }) }}
      </p>
    </div>

    <div class="flex items-center gap-2 border-t border-line-soft px-8 py-4">
      <button v-if="update.phase === 'ready'" :class="primary" @click="update.install()">
        <span class="flex items-center gap-1.5">
          <RotateCcw :size="12.5" :stroke-width="2" />
          {{ t("update.install") }}
        </span>
      </button>
      <button
        v-else-if="update.phase === 'available' && !update.isIgnored"
        :class="primary"
        :disabled="update.busy"
        @click="update.download()"
      >
        {{ t("update.download") }}
      </button>
      <button
        v-else-if="update.phase === 'error'"
        :class="primary"
        :disabled="update.busy"
        @click="update.checkNow()"
      >
        {{ t("update.retry") }}
      </button>

      <button
        v-if="showRelease && !update.isIgnored"
        :class="secondary"
        class="!px-3 !text-[12px]"
        @click="update.ignore()"
      >
        {{ t("update.skip") }}
      </button>
      <button
        v-if="showRelease && update.isIgnored"
        :class="secondary"
        class="!px-3 !text-[12px]"
        @click="update.unignore"
      >
        {{ t("update.unskip") }}
      </button>

      <button class="ml-auto rounded-xl px-3 py-2 text-[13px] text-ink-faint hover:text-ink" @click="emit('close')">
        {{ t("update.later") }}
      </button>
    </div>
  </div>
</template>
