import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { api, type DayView, type Locale, type Settings, type Task } from "@/lib/api";
import { todayStr } from "@/lib/utils";
import { applyLocale } from "@/lib/i18n";

export const useDayStore = defineStore("day", () => {
  const view = ref<DayView | null>(null);
  const inbox = ref<Task[]>([]);
  const settings = ref<Settings>({
    morningTime: "09:00",
    eveningTime: "18:30",
    hotkey: "Ctrl+Alt+Space",
    autostart: true,
    locale: "zh",
  });
  const tab = ref<"today" | "inbox">("today");
  const busy = ref(false);
  const history = ref<Task[]>([]);
  const historyDays = ref(30);

  const tasks = computed(() => view.value?.tasks ?? []);
  const doneToday = computed(() => view.value?.doneToday ?? []);
  const suggestions = computed(() => view.value?.suggestions ?? []);
  const inboxCount = computed(() => view.value?.inboxCount ?? 0);

  async function refresh() {
    view.value = await api.getDay();
    if (tab.value === "inbox") inbox.value = await api.listInbox();
  }

  async function loadInbox() {
    inbox.value = await api.listInbox();
  }

  async function loadHistory(days = historyDays.value) {
    historyDays.value = days;
    history.value = await api.listDoneHistory(days);
  }

  async function add(title: string, target?: string, dueAt?: string | null) {
    await api.addTask(title, target, dueAt);
    await refresh();
  }

  async function toggle(t: Task, note?: string | null) {
    // Optimistic update so the click feels instant.
    t.done = !t.done;
    await api.setDone(t.id, t.done, note);
    await refresh();
  }

  async function tomorrow(id: string) {
    await api.pushToTomorrow(id);
    await refresh();
  }

  async function toInbox(id: string) {
    await api.backToInbox(id);
    await refresh();
  }

  async function drop(id: string) {
    await api.dropTask(id);
    await refresh();
  }

  async function setNote(id: string, note: string | null) {
    await api.setNote(id, note);
    await refresh();
  }

  /** "Back to today" from the records sheet: un-complete and re-plan for today. */
  async function undo(id: string) {
    await api.setDone(id, false);
    await api.moveToDate(id, todayStr());
    await refresh();
  }

  async function promote(t: Task) {
    await api.moveToDate(t.id, todayStr());
    await refresh();
  }

  async function closeOut(pushAll: boolean, note?: string | null) {
    busy.value = true;
    try {
      view.value = await api.closeOut(pushAll, note);
    } finally {
      busy.value = false;
    }
  }

  async function loadSettings() {
    settings.value = await api.getSettings();
  }

  async function saveSettings(s: Settings) {
    settings.value = await api.saveSettings(s);
    applyLocale(settings.value.locale);
  }

  async function setLocale(next: Locale) {
    applyLocale(next);
    settings.value = await api.setLocale(next);
  }

  return {
    view,
    inbox,
    settings,
    tab,
    busy,
    history,
    historyDays,
    tasks,
    doneToday,
    suggestions,
    inboxCount,
    refresh,
    loadInbox,
    loadHistory,
    add,
    toggle,
    tomorrow,
    toInbox,
    drop,
    setNote,
    undo,
    promote,
    closeOut,
    loadSettings,
    saveSettings,
    setLocale,
  };
});
