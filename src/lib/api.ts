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

export const api = {
  getDay: () => invoke<DayView>("get_day"),
  listInbox: () => invoke<Task[]>("list_inbox"),
  listDoneHistory: (days = 30) => invoke<Task[]>("list_done_history", { days }),
  addTask: (title: string, target?: string, dueAt?: string | null) =>
    invoke<Task>("add_task", { title, target, dueAt: dueAt ?? null }),
  setDone: (id: string, done: boolean, note?: string | null) =>
    invoke<Task>("set_done", { id, done, note: note ?? null }),
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
};
