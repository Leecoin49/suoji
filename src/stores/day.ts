import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { api, type DayView, type Locale, type Project, type Recurrence, type Settings, type Tag, type Task } from "@/lib/api";
import { todayStr } from "@/lib/utils";
import { applyLocale } from "@/lib/i18n";
import { applyAppearance } from "@/lib/appearance";

export const useDayStore = defineStore("day", () => {
  const view = ref<DayView | null>(null);
  const inbox = ref<Task[]>([]);
  const settings = ref<Settings>({
    morningTime: "09:00",
    eveningTime: "18:30",
    hotkey: "Ctrl+Alt+Space",
    autostart: true,
    locale: "zh",
    fontScale: "1",
    fontFamily: "sans",
  });
  const tab = ref<"today" | "inbox">("today");
  const busy = ref(false);
  const history = ref<Task[]>([]);
  const historyDays = ref(30);
  const projects = ref<Project[]>([]);
  const tags = ref<Tag[]>([]);
  const recurrences = ref<Recurrence[]>([]);
  /** The task whose 归类 sheet is open; `null` keeps it closed. */
  const classTask = ref<Task | null>(null);
  /** Project the capture bar attaches to new tasks; in-memory only, never persisted. */
  const captureProjectId = ref<string | null>(null);
  /** Step inside that project (spec 009); `null` means the project itself. */
  const captureNodeId = ref<string | null>(null);
  let classesLoaded = false;

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

  /** Projects and tags are read once per session and refreshed after every edit. */
  async function loadClasses(force = false) {
    if (classesLoaded && !force) return;
    const both = await api.listClasses();
    projects.value = both.projects;
    tags.value = both.tags;
    classesLoaded = true;
  }

  async function saveProject(name: string, id?: string | null, archived?: boolean | null) {
    const saved = await api.saveProject({ id: id ?? null, name, archived: archived ?? null });
    await loadClasses(true);
    return saved;
  }

  async function saveTag(name: string) {
    const saved = await api.saveTag(name);
    await loadClasses(true);
    return saved;
  }

  async function removeTag(id: string) {
    await api.deleteTag(id);
    await loadClasses(true);
    await refresh();
  }

  /** Deleting a project keeps its tasks (they fall back to unclassified). */
  async function removeProject(id: string) {
    projects.value = await api.deleteProject(id);
    if (classTask.value?.projectId === id) classTask.value = { ...classTask.value, projectId: null };
    await refresh();
    return projects.value;
  }

  async function setTaskProject(taskId: string, projectId: string | null) {
    const updated = await api.setTaskProject(taskId, projectId);
    if (classTask.value?.id === taskId) classTask.value = updated;
    await refresh();
    return updated;
  }

  async function setTaskTags(taskId: string, tagIds: string[]) {
    const updated = await api.setTaskTags(taskId, tagIds);
    if (classTask.value?.id === taskId) classTask.value = updated;
    await refresh();
    return updated;
  }

  function openClass(task: Task) {
    classTask.value = task;
  }

  function closeClass() {
    classTask.value = null;
  }

  async function loadRecurrences() {
    recurrences.value = await api.listRecurrences();
    return recurrences.value;
  }

  async function saveRecurrence(input: Parameters<typeof api.saveRecurrence>[0]) {
    recurrences.value = await api.saveRecurrence(input);
    await refresh();
    return recurrences.value;
  }

  async function toggleRecurrence(id: string, paused: boolean) {
    recurrences.value = await api.archiveRecurrence(id, paused);
    await refresh();
    return recurrences.value;
  }

  async function removeRecurrence(id: string) {
    recurrences.value = await api.deleteRecurrence(id);
    await refresh();
    return recurrences.value;
  }

  async function add(title: string, target?: string, dueAt?: string | null) {
    const made = await api.addTask(title, target, dueAt, captureProjectId.value);
    // The step is a second, cheap hop: `add_task` keeps its old signature so no
    // other caller has to change.
    if (captureNodeId.value) await api.setTaskNode(made.id, captureNodeId.value);
    await refresh();
  }

  function setCaptureProject(id: string | null) {
    captureProjectId.value = id;
    if (!id) captureNodeId.value = null;
  }

  function setCaptureStep(id: string | null) {
    captureNodeId.value = id;
  }

  async function setDeadline(id: string, deadline: string | null) {
    await api.setDeadline(id, deadline);
    await refresh();
  }

  async function moveTo(id: string, date: string) {
    await api.moveToDate(id, date);
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

  async function rename(id: string, title: string) {
    await api.setTitle(id, title);
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
    applyAppearance(settings.value);
    applyLocale(settings.value.locale);
  }

  async function saveSettings(s: Settings) {
    settings.value = await api.saveSettings(s);
    applyAppearance(settings.value);
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
    projects,
    tags,
    recurrences,
    classTask,
    captureProjectId,
    captureNodeId,
    tasks,
    doneToday,
    suggestions,
    inboxCount,
    refresh,
    loadInbox,
    loadHistory,
    loadClasses,
    saveProject,
    saveTag,
    removeTag,
    removeProject,
    setTaskProject,
    setTaskTags,
    openClass,
    closeClass,
    loadRecurrences,
    saveRecurrence,
    toggleRecurrence,
    removeRecurrence,
    setCaptureProject,
    setCaptureStep,
    setDeadline,
    moveTo,
    add,
    toggle,
    tomorrow,
    toInbox,
    drop,
    setNote,
    rename,
    undo,
    promote,
    closeOut,
    loadSettings,
    saveSettings,
    setLocale,
  };
});
