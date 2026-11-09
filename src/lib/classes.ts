import type { DoneEntry, Project, Tag } from "./api";

/** Length caps — mirrored in `src-tauri/src/commands.rs` (single source: the spec). */
export const PROJECT_NAME_MAX = 20;
export const TAG_NAME_MAX = 16;
export const TAGS_PER_TASK = 10;

/** How many class rows the review card shows before "more". */
export const CLASS_ROWS_SHOWN = 6;

export type ClassKind = "project" | "tag";

/** Key used for tasks without a project. Always present, always last. */
export const NO_CLASS = "__none__";

export interface ClassRow {
  key: string;
  name: string;
  count: number;
  share: number;
  archived: boolean;
}

export type NameCheck = { ok: true; name: string } | { ok: false; reason: "empty" | "long" };

/** Collapse runs of whitespace — what gets stored is what gets compared. */
export function normalizeName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

export function validateName(raw: string, max: number): NameCheck {
  const name = normalizeName(raw);
  if (!name) return { ok: false, reason: "empty" };
  if ([...name].length > max) return { ok: false, reason: "long" };
  return { ok: true, name };
}

export const validateProjectName = (raw: string) => validateName(raw, PROJECT_NAME_MAX);
export const validateTagName = (raw: string) => validateName(raw, TAG_NAME_MAX);

export function classShareOf(count: number, total: number): number {
  return total > 0 ? count / total : 0;
}

/**
 * Count finished entries by project or by tag.
 *
 * Only dated completions are counted (they are the only ones `get_stats` returns);
 * the caller shows the range-wide undated count next to the card instead of
 * inventing a per-row breakdown that the data cannot support.
 */
export function classRowsOf(
  entries: DoneEntry[],
  kind: ClassKind,
  projects: Project[],
  tags: Tag[],
): ClassRow[] {
  const counts = new Map<string, number>();
  const add = (key: string) => counts.set(key, (counts.get(key) ?? 0) + 1);
  const total = entries.length;

  if (kind === "project") {
    const known = new Set(projects.map((p) => p.id));
    for (const entry of entries) {
      const id = entry.projectId;
      // A project id we no longer know about belongs in the unclassified bucket, so
      // shares still add up to 1 and the drill-down count matches the row.
      add(id && known.has(id) ? id : NO_CLASS);
    }
  } else {
    const known = new Set(tags.map((tg) => tg.id));
    for (const entry of entries) {
      for (const id of entry.tagIds ?? []) if (known.has(id)) add(id);
    }
  }

  const rows: ClassRow[] = [];
  for (const [key, count] of counts) {
    if (kind === "project") {
      const project = key === NO_CLASS ? null : projects.find((p) => p.id === key);
      rows.push({
        key,
        name: project?.name ?? "",
        count,
        share: classShareOf(count, total),
        archived: project?.archived ?? false,
      });
    } else {
      const tag = tags.find((tg) => tg.id === key);
      if (!tag) continue;
      rows.push({ key, name: tag.name, count, share: classShareOf(count, total), archived: false });
    }
  }

  rows.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    if (a.key === NO_CLASS) return 1;
    if (b.key === NO_CLASS) return -1;
    const byName = a.name.localeCompare(b.name);
    return byName !== 0 ? byName : a.key.localeCompare(b.key);
  });

  return rows;
}

/** Which entries belong to the picked class — the drill-down filter. */
export function entriesOfClass(
  entries: DoneEntry[],
  kind: ClassKind,
  key: string,
  projects: Project[] = [],
  tags: Tag[] = [],
): DoneEntry[] {
  if (kind === "project") {
    const known = new Set(projects.map((p) => p.id));
    return entries.filter((e) => {
      const own = e.projectId ?? NO_CLASS;
      if (key === NO_CLASS) return own === NO_CLASS || (projects.length > 0 && !known.has(own));
      return own === key;
    });
  }
  const knownTags = new Set(tags.map((t) => t.id));
  return entries.filter((e) => (e.tagIds ?? []).some((id) => id === key || (tags.length > 0 && !knownTags.has(id))));
}
