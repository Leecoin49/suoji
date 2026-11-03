import dayjs from "dayjs";

export interface Parsed {
  /** The task body with the inline hints stripped out. */
  title: string;
  /** "today" | "inbox" | "YYYY-MM-DD" */
  target: string;
  /** Clock time, HH:MM */
  dueAt: string | null;
}

const WEEK_ZH: Record<string, number> = { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };

const WEEK_EN: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};

const DAY_TOKENS =
  "今天|明天|后天|大后天|周[一二三四五六日天]|星期[一二三四五六日天]|" +
  "today|tonight|tomorrow|tmrw|day\\s?after|dayafter|overmorrow|" +
  "mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?|" +
  "(\\d{1,2})[-/.](\\d{1,2})";

function weekdayIndex(token: string): number | undefined {
  if (token.startsWith("星期")) return WEEK_ZH[token.slice(2)];
  if (token.startsWith("周")) return WEEK_ZH[token.slice(1)];
  return WEEK_EN[token];
}

function resolveDay(token: string, num1?: string, num2?: string): string | null {
  const today = dayjs().startOf("day");
  const key = token.toLowerCase().replace(/\s+/g, "");

  switch (key) {
    case "今天":
    case "today":
    case "tonight":
      return today.format("YYYY-MM-DD");
    case "明天":
    case "tomorrow":
    case "tmrw":
      return today.add(1, "day").format("YYYY-MM-DD");
    case "后天":
    case "dayafter":
    case "overmorrow":
      return today.add(2, "day").format("YYYY-MM-DD");
    case "大后天":
      return today.add(3, "day").format("YYYY-MM-DD");
  }

  const w = weekdayIndex(key);
  if (w !== undefined) {
    const cur = today.day();
    let delta = (w - cur + 7) % 7;
    if (delta === 0) delta = 7; // "wed" always means the next Wednesday
    return today.add(delta, "day").format("YYYY-MM-DD");
  }

  if (num1 && num2) {
    const m = Number(num1);
    const d = Number(num2);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      let picked = dayjs(
        `${today.year()}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
      );
      if (!picked.isValid()) return null;
      if (picked.isBefore(today)) picked = picked.add(1, "year");
      return picked.format("YYYY-MM-DD");
    }
  }

  return null;
}

/**
 * Lightweight, rule-based syntax (no AI involved):
 *   sync with design @tomorrow @15:30
 *   file the expense!
 *   reply to Anna @fri
 */
export function parseCapture(raw: string): Parsed {
  let s = raw.trim();
  let dueAt: string | null = null;
  let date: string | null = null;

  // Time hint anywhere in the line: @15:30 / @9:05
  const mTime = s.match(/@(\d{1,2}):(\d{2})/);
  if (mTime && mTime.index !== undefined) {
    const h = Math.min(23, Number(mTime[1]));
    const mi = Math.min(59, Number(mTime[2]));
    dueAt = `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
    s = (s.slice(0, mTime.index) + " " + s.slice(mTime.index + mTime[0].length)).trim();
  }

  // Date hint anywhere in the line: @today @tomorrow @周三 @wed @10-25 @10/25
  const mDay = s.match(new RegExp(`@(${DAY_TOKENS})`, "i"));
  if (mDay && mDay.index !== undefined) {
    const d = resolveDay(mDay[1], mDay[2], mDay[3]);
    if (d) {
      date = d;
      s = (s.slice(0, mDay.index) + " " + s.slice(mDay.index + mDay[0].length)).trim();
    }
  }

  // Trailing exclamation mark = do it today
  let forceToday = false;
  const mBang = s.match(/[!！]+$/);
  if (mBang) {
    forceToday = true;
    s = s.slice(0, mBang.index).trim();
  }

  let target = "inbox";
  if (date) target = date;
  else if (forceToday || dueAt) target = "today";

  return { title: s.replace(/\s{2,}/g, " ").trim(), target, dueAt };
}
