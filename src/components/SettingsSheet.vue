<script setup lang="ts">
import { ref, watch } from "vue";
import { X } from "lucide-vue-next";
import type { Settings } from "@/lib/api";
import { FONT_FAMILIES, FONT_SCALES, applyAppearance } from "@/lib/appearance";
import { useDayStore } from "@/stores/day";
import { useUpdateStore } from "@/stores/update";
import { locale, t, type MessageKey } from "@/lib/i18n";

const props = defineProps<{ open: boolean }>();
const store = useDayStore();
const update = useUpdateStore();
const emit = defineEmits<{ (e: "close"): void; (e: "help"): void; (e: "update"): void }>();

const draft = ref<Settings>({ ...store.settings });
const saved = ref(false);

watch(
  () => props.open,
  (o) => {
    if (o) {
      draft.value = { ...store.settings };
      saved.value = false;
    }
  }
);

async function save() {
  await store.saveSettings({ ...draft.value, locale: locale.value });
  saved.value = true;
  setTimeout(() => emit("close"), 400);
}

/* Picking a size or a face should show itself right away; 保存 just remembers it. */
function preview() {
  applyAppearance(draft.value);
}

const scaleLabels: Record<string, MessageKey> = {
  "0.9": "settings.scaleSmall",
  "1": "settings.scaleDefault",
  "1.1": "settings.scaleLarge",
  "1.25": "settings.scaleHuge",
};

const familyLabels: Record<string, MessageKey> = {
  sans: "settings.fontSans",
  serif: "settings.fontSerif",
  kai: "settings.fontKai",
};

const field =
  "w-full rounded-lg border border-line bg-card px-2.5 py-1.5 text-[13px] text-ink focus:border-accent/40";
</script>

<template>
  <div v-if="open" class="absolute inset-0 z-30 flex flex-col bg-paper">
    <div class="flex items-center justify-between px-8 pb-2 pt-6">
      <h2 class="font-display text-[22px] tracking-tight">{{ t("settings.title") }}</h2>
      <button
        class="rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-paper-deep hover:text-ink"
        @click="emit('close')"
      >
        <X :size="15" :stroke-width="1.9" />
      </button>
    </div>

    <div class="flex-1 space-y-6 overflow-y-auto px-8 py-4">
      <section class="space-y-3">
        <h3 class="text-[11px] font-medium tracking-[0.14em] text-ink-faint">
          {{ t("settings.remind") }}
        </h3>
        <div class="flex items-center gap-3">
          <label class="w-24 text-[13px] text-ink-soft">{{ t("settings.morning") }}</label>
          <input v-model="draft.morningTime" type="time" :class="field" />
        </div>
        <div class="flex items-center gap-3">
          <label class="w-24 text-[13px] text-ink-soft">{{ t("settings.evening") }}</label>
          <input v-model="draft.eveningTime" type="time" :class="field" />
        </div>
      </section>

      <section class="space-y-3">
        <h3 class="text-[11px] font-medium tracking-[0.14em] text-ink-faint">
          {{ t("settings.resident") }}
        </h3>
        <label
          class="flex cursor-pointer items-center justify-between rounded-xl bg-card px-3.5 py-2.5"
        >
          <span class="text-[13px] text-ink">{{ t("settings.autostart") }}</span>
          <input v-model="draft.autostart" type="checkbox" class="h-4 w-4 accent-accent" />
        </label>
        <div class="flex items-center justify-between rounded-xl bg-card px-3.5 py-2.5">
          <span class="text-[13px] text-ink">{{ t("settings.hotkey") }}</span>
          <kbd
            class="rounded-md border border-line bg-paper px-2 py-0.5 text-[11.5px] text-ink-soft"
          >
            {{ draft.hotkey }}
          </kbd>
        </div>
      </section>

      <section class="space-y-3">
        <h3 class="text-[11px] font-medium tracking-[0.14em] text-ink-faint">
          {{ t("settings.appearance") }}
        </h3>

        <div>
          <p class="mb-1.5 text-[12px] text-ink-soft">{{ t("settings.fontSize") }}</p>
          <div class="flex items-center gap-0.5 rounded-xl bg-paper-deep p-1">
            <button
              v-for="s in FONT_SCALES"
              :key="s"
              class="flex-1 rounded-lg py-1.5 text-[12.5px] transition-all"
              :class="
                draft.fontScale === s
                  ? 'bg-card text-ink shadow-[0_1px_3px_rgba(34,30,25,0.08)]'
                  : 'text-ink-soft hover:text-ink'
              "
              @click="draft.fontScale = s; preview()"
            >
              {{ t(scaleLabels[s]) }}
            </button>
          </div>
        </div>

        <div>
          <p class="mb-1.5 text-[12px] text-ink-soft">{{ t("settings.fontFamily") }}</p>
          <div class="flex items-center gap-0.5 rounded-xl bg-paper-deep p-1">
            <button
              v-for="f in FONT_FAMILIES"
              :key="f"
              class="flex-1 rounded-lg py-1.5 text-[12.5px] transition-all"
              :class="
                draft.fontFamily === f
                  ? 'bg-card text-ink shadow-[0_1px_3px_rgba(34,30,25,0.08)]'
                  : 'text-ink-soft hover:text-ink'
              "
              @click="draft.fontFamily = f; preview()"
            >
              {{ t(familyLabels[f]) }}
            </button>
          </div>
          <p class="mt-1.5 text-[11.5px] leading-5 text-ink-faint">{{ t("settings.fontHint") }}</p>
        </div>
      </section>

      <section class="space-y-3">
        <h3 class="text-[11px] font-medium tracking-[0.14em] text-ink-faint">
          {{ t("settings.language") }}
        </h3>
        <div class="flex items-center gap-0.5 rounded-xl bg-paper-deep p-1">
          <button
            class="flex-1 rounded-lg py-1.5 text-[12.5px] transition-all"
            :class="
              locale === 'zh'
                ? 'bg-card text-ink shadow-[0_1px_3px_rgba(34,30,25,0.08)]'
                : 'text-ink-soft hover:text-ink'
            "
            @click="store.setLocale('zh')"
          >
            中文
          </button>
          <button
            class="flex-1 rounded-lg py-1.5 text-[12.5px] transition-all"
            :class="
              locale === 'en'
                ? 'bg-card text-ink shadow-[0_1px_3px_rgba(34,30,25,0.08)]'
                : 'text-ink-soft hover:text-ink'
            "
            @click="store.setLocale('en')"
          >
            English
          </button>
        </div>
      </section>

      <section class="space-y-3">
        <h3 class="text-[11px] font-medium tracking-[0.14em] text-ink-faint">
          {{ t("settings.update") }}
        </h3>
        <label
          class="flex cursor-pointer items-center justify-between rounded-xl bg-card px-3.5 py-2.5"
        >
          <span class="text-[13px] text-ink">{{ t("update.autoCheck") }}</span>
          <input
            :checked="update.autoCheck"
            type="checkbox"
            class="h-4 w-4 accent-accent"
            @change="update.setAutoCheck(($event.target as HTMLInputElement).checked)"
          />
        </label>
        <div class="flex items-center justify-between rounded-xl bg-card px-3.5 py-2.5">
          <span class="text-[13px] text-ink">{{ t("update.current", { v: update.currentVersion || "—" }) }}</span>
          <button class="text-[12.5px] text-accent hover:underline" @click="emit('update')">
            {{ t("update.open") }}
          </button>
        </div>
      </section>

      <section class="space-y-2">
        <h3 class="text-[11px] font-medium tracking-[0.14em] text-ink-faint">
          {{ t("settings.about") }}
        </h3>
        <p class="text-[12.5px] leading-6 text-ink-soft">{{ t("settings.aboutText") }}</p>
        <button class="text-[12.5px] text-accent hover:underline" @click="emit('help')">
          {{ t("settings.aboutHelp") }}
        </button>
      </section>
    </div>

    <div class="flex justify-end gap-2 border-t border-line-soft px-8 py-4">
      <button
        class="rounded-xl border border-line px-4 py-2 text-[13px] text-ink-soft transition-colors hover:bg-card"
        @click="emit('close')"
      >
        {{ t("settings.cancel") }}
      </button>
      <button
        class="rounded-xl bg-ink px-5 py-2 text-[13px] font-medium text-paper transition-colors hover:bg-ink/90"
        @click="save"
      >
        {{ saved ? t("settings.saved") : t("settings.save") }}
      </button>
    </div>
  </div>
</template>
