import { computed, ref } from "vue";
import dayjs from "dayjs";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "dayjs/locale/zh-cn";

export type Locale = "zh" | "en";

const STORAGE_KEY = "suoji.locale";

const dict = {
  zh: {
    "brand": "琐 记",
    "nav.history": "记录",
    "nav.help": "怎么用",
    "nav.settings": "设置",
    "nav.minimize": "最小化",
    "nav.hide": "收到托盘",

    "greet.late": "这么晚还没睡",
    "greet.morning": "早上好",
    "greet.noon": "中午好",
    "greet.afternoon": "下午好",
    "greet.evening": "辛苦了",

    "summary.empty": "今天还没排事情，从收件箱挑几件？",
    "summary.base": "今天 {n} 件",
    "summary.stuck": "，其中 {n} 件已经挂了好几天",

    "tab.today": "今天",
    "tab.inbox": "收件箱",

    "note.label": "昨天留给今天的",

    "stuck.heading": "一直没动 · 处理掉或删掉",
    "section.timed": "定点",
    "section.today": "今天",

    "empty.title": "今天还是空的",
    "empty.hint": "顺手把小事记下来，明天就有得捋了",

    "suggest.heading": "收件箱里躺最久的",
    "suggest.add": "加入今天",
    "inbox.empty": "收件箱是空的",
    "inbox.drop": "删掉",

    "done.count": "今天已经做掉 {n} 件",
    "done.all": "全部记录",
    "closeout.open": "收工结账",

    "capture.placeholder": "记一件琐事…  用 @明天 @15:30 指定时间",
    "capture.inbox": "收件箱",
    "capture.enterToday": "Ctrl+⏎ 今天",
    "capture.today": "今天",
    "capture.tomorrow": "明天",
    "capture.dayAfter": "后天",

    "task.note.placeholder": "做到哪了？明天接着做的线索",
    "task.note.add": "+ 备注",
    "task.badge.held": "挂了 {n} 天",
    "task.badge.rolled": "挪过 {n} 次",
    "task.badge.rolledHint": "这件事之前被往后挪了 {n} 次",
    "task.act.tomorrow": "挪到明天",
    "task.act.inbox": "放回收件箱",
    "task.act.drop": "不做了",

    "closeout.title": "收工了",
    "closeout.left": "还有 {n} 件没勾掉，挑一下怎么处理",
    "closeout.clear": "今天的事都清了，收摊。",
    "closeout.noteLabel": "给明天的一句话",
    "closeout.notePlaceholder": "明天一开机就会看到：先干哪件？",
    "closeout.empty": "干干净净的一天",
    "closeout.pushAll": "全部挪到明天",
    "closeout.keep": "先这样",

    "settings.title": "设置",
    "settings.remind": "每天的两次提醒",
    "settings.morning": "早上捋一遍",
    "settings.evening": "傍晚结账",
    "settings.resident": "常驻",
    "settings.autostart": "开机自动启动",
    "settings.hotkey": "随手唤出",
    "settings.language": "界面语言",
    "settings.about": "说明",
    "settings.aboutText": "所有内容只存在这台电脑上（AppData 下的 suoji.db 一个文件），不联网、不上传。关掉窗口会收进托盘，早晚提醒照常。",
    "settings.aboutHelp": "看完整使用说明 →",
    "settings.cancel": "取消",
    "settings.save": "保存",
    "settings.saved": "已保存",

    "history.title": "记录",
    "history.subtitle": "做完的事都在这儿",
    "history.range": "{n} 天",
    "history.total": "共 {n} 件",
    "history.loading": "读取中…",
    "history.emptyTitle": "这段时间还没有做完的事",
    "history.emptyHint": "勾掉的会攒在这里，回头看得见",
    "history.today": "今天",
    "history.count": "{n} 件",
    "history.undo": "勾错了，退回今天",
    "history.delete": "删掉",

    "help.title": "怎么用",
    "help.subtitle": "四步，一天就顺了",
    "help.syntaxTitle": "一句话就能指定",
    "help.keysTitle": "快捷键",
    "help.whyTitle": "为什么不用每天「捋一遍」",
    "help.dataTitle": "数据和隐私",
    "help.dataBody":
      "所有内容只存在这台电脑上，一个 SQLite 文件，不联网、不登录、不上传。",
    "help.dataPath": "位置",
    "help.dataBackup": "（复制它就是备份）",
    "help.dataTray": "关窗口会收进右下角托盘，早晚提醒照常；右键托盘图标可「收工结账」或「退出」。",
    "help.ok": "知道了",

    "week.sun": "周日",
    "week.mon": "周一",
    "week.tue": "周二",
    "week.wed": "周三",
    "week.thu": "周四",
    "week.fri": "周五",
    "week.sat": "周六",
  },
  en: {
    "brand": "SUOJI",
    "nav.history": "Records",
    "nav.help": "How it works",
    "nav.settings": "Settings",
    "nav.minimize": "Minimize",
    "nav.hide": "Hide to tray",

    "greet.late": "Still up?",
    "greet.morning": "Good morning",
    "greet.noon": "Midday",
    "greet.afternoon": "Good afternoon",
    "greet.evening": "Nice work today",

    "summary.empty": "Nothing planned yet — pick a few from the inbox?",
    "summary.base": "{n} on today's list",
    "summary.stuck": ", {n} of them have been sitting for days",

    "tab.today": "Today",
    "tab.inbox": "Inbox",

    "note.label": "Left for you yesterday",

    "stuck.heading": "Stuck · finish it or drop it",
    "section.timed": "Scheduled",
    "section.today": "Today",

    "empty.title": "Nothing here yet",
    "empty.hint": "Jot the small things down — tomorrow they're waiting",

    "suggest.heading": "Longest sitting in the inbox",
    "suggest.add": "Add to today",
    "inbox.empty": "Inbox is empty",
    "inbox.drop": "Delete",

    "done.count": "{n} done today",
    "done.all": "All records",
    "closeout.open": "Close the day",

    "capture.placeholder": "Jot it down…  @tomorrow @15:30 to schedule",
    "capture.inbox": "Inbox",
    "capture.enterToday": "Ctrl+⏎ today",
    "capture.today": "today",
    "capture.tomorrow": "tomorrow",
    "capture.dayAfter": "day after",

    "task.note.placeholder": "Where did you get to? A hint for tomorrow",
    "task.note.add": "+ note",
    "task.badge.held": "{n}d stuck",
    "task.badge.rolled": "moved {n}×",
    "task.badge.rolledHint": "Pushed back {n} times before",
    "task.act.tomorrow": "Move to tomorrow",
    "task.act.inbox": "Back to inbox",
    "task.act.drop": "Drop it",

    "closeout.title": "That's a day",
    "closeout.left": "{n} still open — decide what happens to them",
    "closeout.clear": "All clear. Shut it down.",
    "closeout.noteLabel": "A line for tomorrow",
    "closeout.notePlaceholder": "First thing tomorrow you'll see: what comes first?",
    "closeout.empty": "A clean day",
    "closeout.pushAll": "Move all to tomorrow",
    "closeout.keep": "Leave it here",

    "settings.title": "Settings",
    "settings.remind": "Two reminders a day",
    "settings.morning": "Morning",
    "settings.evening": "Evening",
    "settings.resident": "Always there",
    "settings.autostart": "Start with Windows",
    "settings.hotkey": "Summon quickly",
    "settings.language": "Language",
    "settings.about": "About",
    "settings.aboutText": "Everything lives on this computer — a single suoji.db under AppData. No network, no upload. Closing the window keeps it in the tray and reminders still fire.",
    "settings.aboutHelp": "Read the full guide →",
    "settings.cancel": "Cancel",
    "settings.save": "Save",
    "settings.saved": "Saved",

    "history.title": "Records",
    "history.subtitle": "Everything you finished",
    "history.range": "{n}d",
    "history.total": "{n} total",
    "history.loading": "Loading…",
    "history.emptyTitle": "Nothing finished in this range",
    "history.emptyHint": "Checked items pile up here",
    "history.today": "Today",
    "history.count": "{n}",
    "history.undo": "Undo — back to today",
    "history.delete": "Delete",

    "help.title": "How it works",
    "help.subtitle": "Four steps and the day runs itself",
    "help.syntaxTitle": "One line says it all",
    "help.keysTitle": "Keyboard",
    "help.whyTitle": "Why you never review everything daily",
    "help.dataTitle": "Data & privacy",
    "help.dataBody": "Everything stays on this machine in one SQLite file. No network, no login, no upload.",
    "help.dataPath": "Path",
    "help.dataBackup": "(copy it to back up)",
    "help.dataTray":
      "Closing the window keeps it in the tray and reminders still fire; right-click the tray icon to close out or quit.",
    "help.ok": "Got it",

    "week.sun": "Sun",
    "week.mon": "Mon",
    "week.tue": "Tue",
    "week.wed": "Wed",
    "week.thu": "Thu",
    "week.fri": "Fri",
    "week.sat": "Sat",
  },
} as const;

export type MessageKey = keyof (typeof dict)["zh"];

type Bullet = { title: string; body: string };
type Row = { left: string; right: string };

const content = {
  zh: {
    steps: [
      { title: "想到就丢", body: "按 Ctrl+Alt+Space 随时唤出，敲一句回车。不用分类、不用想放哪天，默认进收件箱。" },
      { title: "早上看一眼", body: "打开就是「今天」：昨天留给你的那句话、到点的事、从收件箱挑出来的几件。9 点会提醒一次。" },
      { title: "白天勾掉", body: "点左边圆圈做掉，它沉到下面「今天已做掉」，随时能展开看明细，勾错了再点一下退回。" },
      { title: "傍晚结账", body: "18:30 提醒时点「收工结账」，剩下的逐条选明天 / 收件箱 / 不做了，最后留一句给明天。" },
    ] as Bullet[],
    syntax: [
      { left: "交周报 @明天", right: "落到明天" },
      { left: "跟产品对齐 @15:30", right: "今天 15:30，单独一组" },
      { left: "补报销单 @周五", right: "落到那周的周五" },
      { left: "@10-25  @10/25  @后天", right: "指定日期都认" },
      { left: "回王姐消息!", right: "结尾感叹号 = 今天就做" },
    ] as Row[],
    keys: [
      { left: "Ctrl+Alt+Space", right: "全局唤出 / 收起" },
      { left: "Ctrl+K", right: "光标跳到输入框" },
      { left: "Enter", right: "新建（按 @ 的内容归位）" },
      { left: "Ctrl+Enter", right: "不管写了啥，直接放进今天" },
      { left: "Esc", right: "清空输入 / 收起浮层" },
    ] as Row[],
    why: [
      "没做完的事每天零点自动顺延到新的一天 —— 这是默认行为，不是你要做的动作。",
      "被「明天」太多次的会标「挪过 5 次」，长期挂着的标「挂了 12 天」，默默烂掉的事自己会浮上来。",
      "早上给的是「今天该做的几件」，不是全部待办列表。",
    ] as string[],
  },
  en: {
    steps: [
      { title: "Capture it", body: "Ctrl+Alt+Space summons the window any time; type a line and hit Enter. No folders, no dates needed — it lands in the inbox." },
      { title: "Glance in the morning", body: "You open on Today: yesterday's note to you, anything scheduled, and a few picks from the inbox. A reminder fires at 9:00." },
      { title: "Tick through the day", body: "Tap the circle to finish it. It sinks into “done today” — expand any time, tap again to undo." },
      { title: "Close out", body: "At 18:30 pick tomorrow / inbox / drop for whatever is left, then leave one line for tomorrow." },
    ] as Bullet[],
    syntax: [
      { left: "send the weekly report @tomorrow", right: "lands tomorrow" },
      { left: "sync with design @15:30", right: "today 15:30, its own group" },
      { left: "file the expense @fri", right: "that week's Friday" },
      { left: "@10-25  @10/25  @day after", right: "explicit dates work too" },
      { left: "reply to Anna!", right: "trailing “!” = do it today" },
    ] as Row[],
    keys: [
      { left: "Ctrl+Alt+Space", right: "Summon / hide" },
      { left: "Ctrl+K", right: "Jump to the input" },
      { left: "Enter", right: "Create (honours the @ hints)" },
      { left: "Ctrl+Enter", right: "Force it into today" },
      { left: "Esc", right: "Clear input / close the sheet" },
    ] as Row[],
    why: [
      "Whatever is unfinished rolls over at midnight — that's the default, not an action you take.",
      "Pushed too often gets a “moved 5×” badge, sitting too long gets “stuck 12 days” — the things quietly rotting surface on their own.",
      "The morning shows the few things for today, not the whole backlog.",
    ] as string[],
  },
};

function readLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "en" || saved === "zh") return saved;
  } catch {
    /* storage may be unavailable */
  }
  return "zh";
}

export const locale = ref<Locale>(readLocale());

export const isEn = computed(() => locale.value === "en");

/** Translate a key, substituting {placeholders}. */
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  const table = dict[locale.value] as Record<string, string>;
  let out = table[key] ?? key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      out = out.split(`{${name}}`).join(String(value));
    }
  }
  return out;
}

export const helpContent = computed(() => content[locale.value]);

/** Apply locale to dayjs, the window title, <html lang> and localStorage. */
export function applyLocale(next: Locale) {
  locale.value = next;
  dayjs.locale(next === "en" ? "en" : "zh-cn");
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* ignore */
  }
  document.documentElement.lang = next === "en" ? "en" : "zh-CN";
  document.title = next === "en" ? "Suoji" : "琐记";
  // The taskbar entry and Alt+Tab keep the window title, so follow the language.
  void getCurrentWindow()
    .setTitle(document.title)
    .catch(() => undefined);
}

export function weekday(date: dayjs.Dayjs | string): string {
  return dayjs(date).format("ddd");
}

/** 11月3日 / Nov 3 */
export function dayLabel(date: dayjs.Dayjs | string): string {
  return dayjs(date).format(locale.value === "en" ? "MMM D" : "M月D日");
}

export function greeting(): string {
  const h = dayjs().hour();
  if (h < 5) return t("greet.late");
  if (h < 11) return t("greet.morning");
  if (h < 14) return t("greet.noon");
  if (h < 18) return t("greet.afternoon");
  return t("greet.evening");
}

applyLocale(locale.value);
