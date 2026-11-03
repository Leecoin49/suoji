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
