import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import dayjs from "dayjs";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function todayStr() {
  return dayjs().format("YYYY-MM-DD");
}

export function tomorrowStr() {
  return dayjs().add(1, "day").format("YYYY-MM-DD");
}

/** Whole days since the task first landed on "today". */
export function heldDays(t: { firstSeenDate: string | null; createdAt: string }): number {
  const start = t.firstSeenDate ?? t.createdAt.slice(0, 10);
  if (!start) return 0;
  return Math.max(0, dayjs().startOf("day").diff(dayjs(start).startOf("day"), "day"));
}

/** 2026-11-03T15:30 → 15:30; another day → 11-05 15:30; null → "". */
export function timeLabel(t: { dueAt: string | null }) {
  if (!t.dueAt) return "";
  const at = dayjs(t.dueAt);
  if (!at.isValid()) return t.dueAt;
  return at.isSame(dayjs(), "day") ? at.format("HH:mm") : at.format("MM-DD HH:mm");
}

/** How pressing a deadline is, so the row can colour it without knowing any date maths. */
export interface DeadlineView {
  /** Signed whole days until the deadline; 0 = today, negative = already past. */
  days: number;
  /** "over" | "today" | "tomorrow" | "soon" | "later" */
  kind: "over" | "today" | "tomorrow" | "soon" | "later";
  /** HH:mm, "" when the deadline is exactly midnight. */
  time: string;
  /** Day part: 今天 / 明天 / MM-DD (the component localises the labels). */
  date: string;
}

export function deadlineOf(t: { deadline: string | null }): DeadlineView | null {
  if (!t.deadline) return null;
  const at = dayjs(t.deadline);
  if (!at.isValid()) return null;
  const days = at.startOf("day").diff(dayjs().startOf("day"), "day");
  const kind = days < 0 ? "over" : days === 0 ? "today" : days === 1 ? "tomorrow" : days <= 3 ? "soon" : "later";
  return {
    days,
    kind,
    time: at.format("HH:mm") === "00:00" ? "" : at.format("HH:mm"),
    date: at.format("MM-DD"),
  };
}

/** `YYYY-MM-DDTHH:mm` for `<input type="datetime-local">`. */
export function deadlineInput(deadline: string | null, planDate?: string | null): string {
  const base = deadline ?? planDate ?? dayjs().format("YYYY-MM-DD");
  const d = dayjs(base);
  if (!d.isValid()) return "";
  return (deadline ? d : d.hour(18).minute(0)).format("YYYY-MM-DDTHH:mm");
}
