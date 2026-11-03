<script setup lang="ts">
import { X } from "lucide-vue-next";
import { helpContent, t } from "@/lib/i18n";

const emit = defineEmits<{ (e: "close"): void }>();

const row = "flex items-start gap-3 py-2";
const kbd = "shrink-0 rounded-md border border-line bg-paper px-1.5 py-0.5 text-[11px] text-ink-soft";
</script>

<template>
  <div class="absolute inset-0 z-30 flex flex-col bg-paper">
    <div class="flex items-center justify-between px-8 pb-1 pt-6">
      <div class="flex items-baseline gap-3">
        <h2 class="font-display text-[22px] tracking-tight">{{ t("help.title") }}</h2>
        <span class="text-[11.5px] text-ink-faint">{{ t("help.subtitle") }}</span>
      </div>
      <button
        class="rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-paper-deep hover:text-ink"
        @click="emit('close')"
      >
        <X :size="15" :stroke-width="1.9" />
      </button>
    </div>

    <div class="scroll-thin min-h-0 flex-1 overflow-y-auto px-8 pb-4 pt-3">
      <!-- Four steps -->
      <section class="mb-7 space-y-1">
        <div v-for="(step, i) in helpContent.steps" :key="step.title" :class="row">
          <span
            class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-medium text-accent"
          >
            {{ i + 1 }}
          </span>
          <div class="min-w-0">
            <p class="text-[13.5px] font-medium text-ink">{{ step.title }}</p>
            <p class="mt-0.5 text-[12.5px] leading-6 text-ink-soft">{{ step.body }}</p>
          </div>
        </div>
      </section>

      <!-- Syntax -->
      <section class="mb-7">
        <h3 class="mb-2 text-[11px] font-medium tracking-[0.14em] text-ink-faint">
          {{ t("help.syntaxTitle") }}
        </h3>
        <div class="rounded-2xl bg-card px-4 py-1">
          <div
            v-for="s in helpContent.syntax"
            :key="s.left"
            class="flex items-baseline justify-between gap-4 border-b border-line-soft py-2 last:border-0"
          >
            <span class="font-display text-[13px] text-ink">{{ s.left }}</span>
            <span class="shrink-0 text-[11.5px] text-ink-faint">{{ s.right }}</span>
          </div>
        </div>
      </section>

      <!-- Keyboard -->
      <section class="mb-7">
        <h3 class="mb-2 text-[11px] font-medium tracking-[0.14em] text-ink-faint">
          {{ t("help.keysTitle") }}
        </h3>
        <div class="rounded-2xl bg-card px-4 py-1">
          <div
            v-for="k in helpContent.keys"
            :key="k.left"
            class="flex items-center justify-between gap-4 border-b border-line-soft py-2 last:border-0"
          >
            <kbd :class="kbd">{{ k.left }}</kbd>
            <span class="text-[11.5px] text-ink-faint">{{ k.right }}</span>
          </div>
        </div>
      </section>

      <!-- Why this is not another to-do list -->
      <section class="mb-7">
        <h3 class="mb-2 text-[11px] font-medium tracking-[0.14em] text-ink-faint">
          {{ t("help.whyTitle") }}
        </h3>
        <ul class="space-y-1.5 text-[12.5px] leading-6 text-ink-soft">
          <li v-for="line in helpContent.why" :key="line" class="flex gap-2">
            <span class="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent/60" />
            <span>{{ line }}</span>
          </li>
        </ul>
      </section>

      <!-- Data -->
      <section>
        <h3 class="mb-2 text-[11px] font-medium tracking-[0.14em] text-ink-faint">
          {{ t("help.dataTitle") }}
        </h3>
        <p class="text-[12.5px] leading-6 text-ink-soft">
          {{ t("help.dataBody") }}<br />
          {{ t("help.dataPath") }}: <span class="text-ink-faint">%APPDATA%\com.tool.suoji\suoji.db</span>
          <span class="ml-1">{{ t("help.dataBackup") }}</span><br />
          {{ t("help.dataTray") }}
        </p>
      </section>
    </div>

    <div class="flex justify-end border-t border-line-soft px-8 py-4">
      <button
        class="rounded-xl bg-ink px-5 py-2 text-[13px] font-medium text-paper transition-colors hover:bg-ink/90"
        @click="emit('close')"
      >
        {{ t("help.ok") }}
      </button>
    </div>
  </div>
</template>
