<script setup lang="ts">
import { getCurrentWindow } from "@tauri-apps/api/window";
import { CircleHelp, History, Minus, Settings2, X } from "lucide-vue-next";
import { t } from "@/lib/i18n";

const win = getCurrentWindow();
const emit = defineEmits<{
  (e: "settings"): void;
  (e: "history"): void;
  (e: "help"): void;
}>();

const btn =
  "flex h-8 w-8 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-paper-deep hover:text-ink";
</script>

<template>
  <header data-tauri-drag-region class="flex h-11 shrink-0 items-center justify-between pl-6 pr-2">
    <div data-tauri-drag-region class="flex items-center gap-2">
      <span class="h-1.5 w-1.5 rounded-full bg-accent/70" />
      <span class="text-[12px] font-medium tracking-[0.22em] text-ink-faint">{{ t("brand") }}</span>
    </div>

    <div class="flex items-center gap-0.5">
      <button :class="btn" :title="t('nav.history')" @click="emit('history')">
        <History :size="14" :stroke-width="1.8" />
      </button>
      <button :class="btn" :title="t('nav.help')" @click="emit('help')">
        <CircleHelp :size="14" :stroke-width="1.8" />
      </button>
      <button :class="btn" :title="t('nav.settings')" @click="emit('settings')">
        <Settings2 :size="14" :stroke-width="1.8" />
      </button>
      <button :class="btn" :title="t('nav.minimize')" @click="win.minimize()">
        <Minus :size="14" :stroke-width="1.8" />
      </button>
      <button
        :class="btn"
        :title="t('nav.hide')"
        class="hover:!bg-accent hover:!text-white"
        @click="win.hide()"
      >
        <X :size="14" :stroke-width="1.8" />
      </button>
    </div>
  </header>
</template>
