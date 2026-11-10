import { invoke } from "@tauri-apps/api/core";

export interface Task {
  id: string;
  title: string;
  note: string | null;
  bucket: "today" | "inbox";
  planDate: string | null;
  firstSeenDate: string | null;
  dueAt: string | null;
  done: boolean;
  doneAt: string | null;
  rollCount: number;
  lastRolledAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Which project it belongs to; `null` means 未分类. */
  projectId: string | null;
  /** Step inside that project; `null` means the project itself. */
  nodeId: string | null;
  /** Tags on it — empty when the caller did not load them. */
  tagIds: string[];
  /** Spawning rule, `null` for a one-off task. */
  recurrenceId: string | null;
  /** Which day of the rule this run belongs to. */
  occurrenceDate: string | null;
}

/** A bucket of related work. One level deep on purpose (spec 005 D1). */
export interface Project {
  id: string;
  name: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

/** A free-form label; several may sit on one task. */
export interface Tag {
  id: string;
  name: string;
  createdAt: string;
}

/** Both dictionaries in one round trip. */
export interface Classes {
  projects: Project[];
  tags: Tag[];
}

/** What deleting a project would touch — read before the second click. */
export interface ProjectImpact {
  tasks: number;
  nodes: number;
}

/** One step in a project's chain (spec 006). */
export interface Node {
  id: string;
  projectId: string;
  title: string;
  note: string | null;
  done: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/** A repeating rule (spec 008). It spawns one ordinary task per matching day. */
export interface Recurrence {
  id: string;
  title: string;
  projectId: string | null;
  nodeId: string | null;
  /** "daily" | "weekly" | "monthly" */
  kind: string;
  /** Weekly only: 1 = Monday … 7 = Sunday. */
  days: number[];
  /** Monthly only: 1..=31, where 31 means "the last day" in shorter months. */
  monthDay: number | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DayView {
  date: string;
  tasks: Task[];
  doneToday: Task[];
  suggestions: Task[];
  inboxCount: number;
  closedOut: boolean;
  yesterdayNote: string | null;
}

export type Locale = "zh" | "en";

export interface Settings {
  morningTime: string;
  eveningTime: string;
  hotkey: string;
  autostart: boolean;
  locale: Locale;
}

export interface StatsSpan {
  start: string;
  end: string;
  days: number;
}

export interface DoneEntry {
  id: string;
  title: string;
  note: string | null;
  /** Local time without a timezone suffix, exactly as stored. */
  doneAt: string;
  /** Current home of the task (no historical snapshot). */
  projectId: string | null;
  tagIds: string[];
}

export interface RollEntry {
  id: string;
  title: string;
  /** Cumulative — may include pushes from before the interval. */
  rollCount: number;
  /** Plain date (YYYY-MM-DD), not a timestamp. */
  lastRolledAt: string;
}

export interface StatsRaw {
  span: StatsSpan;
  prev: StatsSpan;
  done: DoneEntry[];
  prevDone: number;
  rolled: RollEntry[];
  backlog: number;
  undated: number;
  clamped: boolean;
}

export const api = {
  getDay: () => invoke<DayView>("get_day"),
  listInbox: () => invoke<Task[]>("list_inbox"),
  listProjectTasks: (projectId: string) => invoke<Task[]>("list_project_tasks", { projectId }),
  listDoneHistory: (days = 30) => invoke<Task[]>("list_done_history", { days }),
  getStats: (start: string, end: string) => invoke<StatsRaw>("get_stats", { start, end }),
  listClasses: () => invoke<Classes>("list_classes"),
  saveProject: (project: { id?: string | null; name: string; archived?: boolean | null }) =>
    invoke<Project>("save_project", { project }),
  projectImpact: (id: string) => invoke<ProjectImpact>("project_impact", { id }),
  deleteProject: (id: string) => invoke<Project[]>("delete_project", { id }),
  setTaskProject: (taskId: string, projectId: string | null) =>
    invoke<Task>("set_task_project", { taskId, projectId }),
  setTaskNode: (taskId: string, nodeId: string | null) => invoke<Task>("set_task_node", { taskId, nodeId }),
  saveTag: (name: string) => invoke<Tag>("save_tag", { name }),
  deleteTag: (id: string) => invoke<void>("delete_tag", { id }),
  setTaskTags: (taskId: string, tagIds: string[]) => invoke<Task>("set_task_tags", { taskId, tagIds }),
  listNodes: (projectId: string) => invoke<Node[]>("list_nodes", { projectId }),
  saveNode: (node: { id?: string | null; projectId: string; title: string; note?: string | null }) =>
    invoke<Node[]>("save_node", { node }),
  deleteNode: (id: string) => invoke<Node[]>("delete_node", { id }),
  completeNode: (id: string) => invoke<Node[]>("complete_node", { id }),
  reopenNode: (id: string) => invoke<Node[]>("reopen_node", { id }),
  listRecurrences: () => invoke<Recurrence[]>("list_recurrences"),
  saveRecurrence: (input: {
    id?: string | null;
    title: string;
    projectId?: string | null;
    nodeId?: string | null;
    kind: string;
    days?: number[];
    monthDay?: number | null;
    archived?: boolean | null;
  }) => invoke<Recurrence[]>("save_recurrence", { input }),
  archiveRecurrence: (id: string, paused: boolean) =>
    invoke<Recurrence[]>("archive_recurrence", { id, paused }),
  deleteRecurrence: (id: string) => invoke<Recurrence[]>("delete_recurrence", { id }),
  addTask: (title: string, target?: string, dueAt?: string | null, projectId?: string | null) =>
    invoke<Task>("add_task", { title, target, dueAt: dueAt ?? null, projectId: projectId ?? null }),
  setDone: (id: string, done: boolean, note?: string | null) =>
    invoke<Task>("set_done", { id, done, note: note ?? null }),
  setTitle: (id: string, title: string) => invoke<Task>("set_title", { id, title }),
  setNote: (id: string, note: string | null) => invoke<Task>("set_note", { id, note }),
  pushToTomorrow: (id: string) => invoke<void>("push_to_tomorrow", { id }),
  backToInbox: (id: string) => invoke<void>("back_to_inbox", { id }),
  moveToDate: (id: string, date: string) => invoke<void>("move_to_date", { id, date }),
  dropTask: (id: string) => invoke<void>("drop_task", { id }),
  closeOut: (pushAll: boolean, note?: string | null) =>
    invoke<DayView>("close_out", { pushAll, note: note ?? null }),
  getSettings: () => invoke<Settings>("get_settings"),
  saveSettings: (settings: Settings) => invoke<Settings>("save_settings", { settings }),
  setLocale: (locale: string) => invoke<Settings>("set_locale", { locale }),
  dataPath: () => invoke<string>("data_path"),
};
