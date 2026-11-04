// Merge the per-platform metadata uploaded by the build matrix into latest.json,
// the manifest every installed app polls, and render the release body.
//
//   node .github/scripts/make-manifest.mjs --dir assets \
//     --repo Leecoin49/suoji --tag v0.1.1 --notes-file release-notes/0.1.1.md

import { readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function arg(name, fallback = "") {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

const dir = arg("dir", "assets");
const repo = arg("repo");
const tag = arg("tag");
const notesFile = arg("notes-file");

if (!repo || !tag) {
  console.error("usage: make-manifest.mjs --dir <assets> --repo <owner/name> --tag <v> [--notes-file <path>]");
  process.exit(1);
}

const version = tag.replace(/^v/, "");
const entries = readdirSync(dir).filter((name) => /^meta-.*\.json$/.test(name));
if (entries.length === 0) {
  console.error(`no meta-*.json in ${dir}`);
  process.exit(1);
}

const platforms = {};
for (const entry of entries) {
  const meta = JSON.parse(readFileSync(join(dir, entry), "utf8"));
  platforms[meta.platform] = {
    signature: meta.signature,
    url: `https://github.com/${repo}/releases/download/${tag}/${meta.asset}`,
  };
  // The staging metadata is build plumbing, not a release asset.
  unlinkSync(join(dir, entry));
}

let notes = "See the release page for what changed.";
if (notesFile) {
  try {
    notes = readFileSync(notesFile, "utf8").trim();
  } catch {
    console.warn(`no notes file at ${notesFile}; using a placeholder`);
  }
}

const manifest = {
  version,
  notes,
  pub_date: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
  platforms,
};
writeFileSync(join(dir, "latest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

// Release body: the same notes, then the files a human needs to pick from.
const downloads = readdirSync(dir)
  .filter((name) => /\.(exe|dmg|deb|AppImage)$/.test(name))
  .sort()
  .map((name) => `- \`${name}\``)
  .join("\n");

const body = `${notes}

---

${downloads}
- \`latest.json\` - update manifest read by the app

${Object.keys(platforms).length} platforms: ${Object.keys(platforms).sort().join(", ")}.
`;
writeFileSync("notes.md", body);

console.log(`latest.json: ${version} with ${Object.keys(platforms).length} platforms`);
