<script setup lang="ts">
import { X } from "lucide-vue-next";
import { t } from "@/lib/i18n";

defineProps<{
  title: string;
  subtitle?: string;
  layer?: string;
}>();

defineEmits<{ (e: "close"): void }>();
</script>

<template>
  <div :class="['absolute inset-0 flex flex-col bg-paper text-ink', layer ?? 'z-30']">
    <header class="flex shrink-0 items-start gap-3 px-8 pb-2 pt-6">
      <div class="min-w-0">
        <h1 class="font-display text-[22px] leading-tight tracking-tight">{{ title }}</h1>
        <p v-if="subtitle" class="mt-0.5 truncate text-[12px] text-ink-soft">{{ subtitle }}</p>
      </div>
      <div class="ml-auto flex shrink-0 items-center gap-2">
        <slot name="actions" />
      </div>
      <button
        class="ml-1 flex h-7 shrink-0 items-center gap-1 rounded-lg border border-line-soft px-2 text-[11.5px] text-ink-soft transition-colors hover:border-line hover:bg-paper-deep hover:text-ink"
        :title="t('stats.close')"
        @click="$emit('close')"
      >
        <X :size="12" :stroke-width="2" />
        {{ t("stats.close") }}
      </button>
    </header>
    <div class="scroll-thin min-h-0 flex-1 overflow-y-auto px-8 pb-8 pt-1">
      <slot />
    </div>
  </div>
</template>
