import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { getVersion } from "@tauri-apps/api/app";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

const IGNORE_KEY = "suoji.ignoreVersion";
const CHECK_KEY = "suoji.lastCheck";
const AUTO_KEY = "suoji.autoCheck";
const DAY = 24 * 60 * 60 * 1000;

export type Phase = "idle" | "checking" | "latest" | "available" | "downloading" | "ready" | "error";

function read(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage may be unavailable */
  }
}

/** No release has uploaded latest.json yet - that is not something the user can fix. */
function isMissingManifest(raw: string) {
  return /valid release JSON|404|not found/i.test(raw);
}

function isOffline(raw: string) {
  return /error sending request|dns|connect|network|timed out|failed to fetch/i.test(raw);
}

export const useUpdateStore = defineStore("update", () => {
  const currentVersion = ref("");
  const phase = ref<Phase>("idle");
  const version = ref("");
  const notes = ref("");
  const releasedAt = ref("");
  const downloaded = ref(0);
  const total = ref(0);
  const error = ref("");
  const ignoredVersion = ref("");
  const autoCheck = ref(true);
  /** Translation key for errors worth explaining in the panel; raw text lives in `error`. */
  const noticeKey = ref<"" | "update.noManifest" | "update.offline">("");

  // The plugin keeps the downloaded bytes in memory, so the handle has to live here.
  let pending: Update | null = null;

  const progress = computed(() =>
    total.value > 0 ? Math.min(100, Math.round((downloaded.value / total.value) * 100)) : 0
  );

  const isIgnored = computed(() => !!version.value && version.value === ignoredVersion.value);

  /** Red dot in the title bar: an update is either waiting to download or ready to install. */
  const badge = computed(() => {
    if (isIgnored.value) return "";
    if (phase.value === "ready") return "ready";
    return phase.value === "available" ? "new" : "";
  });

  const busy = computed(() => phase.value === "checking" || phase.value === "downloading");

  function loadPrefs() {
    ignoredVersion.value = read(IGNORE_KEY);
    const auto = read(AUTO_KEY);
    autoCheck.value = auto !== "0";
  }

  function remember() {
    write(CHECK_KEY, String(Date.now()));
  }

  function reset() {
    pending = null;
    version.value = "";
    notes.value = "";
    releasedAt.value = "";
    downloaded.value = 0;
    total.value = 0;
    error.value = "";
    noticeKey.value = "";
  }

  async function init() {
    currentVersion.value = await getVersion();
    loadPrefs();
    const last = Number(read(CHECK_KEY)) || 0;
    if (autoCheck.value && Date.now() - last > DAY) void checkNow(true);
  }

  async function checkNow(silent = false) {
    if (busy.value) return;
    reset();
    phase.value = "checking";
    try {
      const found = await check();
      remember();
      if (!found) {
        phase.value = "latest";
        return;
      }
      pending = found;
      version.value = found.version;
      notes.value = found.body ?? "";
      releasedAt.value = found.date ?? "";
      phase.value = "available";
      if (version.value === ignoredVersion.value) return;
      // Quietly fetch it so "restart and update" is instant when the user asks for it.
      void download();
    } catch (e) {
      const raw = String(e);
      remember();
      // An unreleased manifest is a normal state for a young project: say so instead of
      // showing the plugin's "Could not fetch a valid release JSON from the remote".
      if (isMissingManifest(raw)) {
        phase.value = "latest";
        noticeKey.value = "update.noManifest";
        return;
      }
      phase.value = "error";
      error.value = raw;
      noticeKey.value = isOffline(raw) ? "update.offline" : "";
      if (!silent) remember();
    }
  }

  async function download() {
    if (!pending || phase.value === "downloading" || phase.value === "ready") return;
    phase.value = "downloading";
    error.value = "";
    try {
      await pending.download((event) => {
        if (event.event === "Started") {
          total.value = event.data.contentLength ?? 0;
        } else if (event.event === "Progress") {
          downloaded.value += event.data.chunkLength;
        } else if (event.event === "Finished") {
          phase.value = "ready";
        }
      });
      phase.value = "ready";
    } catch (e) {
      phase.value = "error";
      error.value = String(e);
    }
  }

  async function install() {
    if (!pending || phase.value !== "ready") return;
    try {
      await pending.install();
      await relaunch();
    } catch (e) {
      phase.value = "error";
      error.value = String(e);
    }
  }

  function ignore() {
    if (!version.value) return;
    ignoredVersion.value = version.value;
    write(IGNORE_KEY, version.value);
  }

  function unignore() {
    ignoredVersion.value = "";
    write(IGNORE_KEY, "");
  }

  function setAutoCheck(on: boolean) {
    autoCheck.value = on;
    write(AUTO_KEY, on ? "1" : "0");
  }

  return {
    currentVersion,
    phase,
    version,
    notes,
    releasedAt,
    downloaded,
    total,
    progress,
    error,
    noticeKey,
    badge,
    busy,
    autoCheck,
    isIgnored,
    init,
    checkNow,
    download,
    install,
    ignore,
    unignore,
    setAutoCheck,
  };
});
