// Rename the bundles of one matrix leg into stable, ASCII release asset names and
// record which of them is the file the updater should download.
//
//   node .github/scripts/collect-assets.mjs \
//     --version 0.1.1 --target x86_64-pc-windows-msvc \
//     --platform windows-x86_64 --arch x64 --out dist
//
// productName is non-ASCII (琐记) and GitHub mangles those file names on the
// Windows runner, so every asset is renamed to Suoji_<version>_<arch><ext>.
//
// The updater payload is whichever bundle the CLI signed, i.e. the one with a
// <file>.sig next to it: the NSIS installer on Windows, .app.tar.gz on macOS,
// .AppImage.tar.gz on Linux.

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, sep } from "node:path";

function arg(name, fallback = "") {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

const version = arg("version");
const target = arg("target");
const platform = arg("platform");
const arch = arg("arch");
const out = arg("out", "dist");
const unsigned = process.argv.includes("--unsigned");

if (!version || !target || !platform || !arch) {
  console.error("usage: collect-assets.mjs --version <v> --target <triple> --platform <key> --arch <label> --out <dir>");
  process.exit(1);
}

const bundleRoot = join("src-tauri", "target", target, "release", "bundle");
const base = `Suoji_${version}_${arch}`;

/** Walk a directory, returning every regular file outside .app bundles. */
function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap((name) => {
    const path = join(dir, name);
    if (path.includes(`.app${sep}`)) return [];
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

/** Release asset name for a bundle file, or null when it is not shipped. */
function assetName(file) {
  if (file.endsWith(".nsis.zip")) return `${base}-setup.nsis.zip`;
  if (file.endsWith(".app.tar.gz")) return `${base}.app.tar.gz`;
  if (file.endsWith(".AppImage.tar.gz")) return `${base}.AppImage.tar.gz`;
  if (file.endsWith(".AppImage")) return `${base}.AppImage`;
  if (file.endsWith(".dmg")) return `${base}.dmg`;
  if (file.endsWith(".deb")) return `${base}.deb`;
  if (file.endsWith(".exe")) return `${base}-setup.exe`;
  return null;
}

const files = walk(bundleRoot).filter((file) => !file.endsWith(".sig"));
if (files.length === 0) {
  console.error(`no bundles under ${bundleRoot}`);
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// The plugin can only replace a Windows installer, a macOS app bundle or a Linux
// AppImage: a .deb or .dmg is installed by the package manager and is never the
// payload, even when the CLI signed it.
const PAYLOAD_PRIORITY = [".AppImage.tar.gz", ".AppImage", ".app.tar.gz", ".nsis.zip", ".exe"];

const shipped = [];
const signed = [];

for (const file of files) {
  const name = assetName(file);
  if (!name) continue;
  cpSync(file, join(out, name));
  shipped.push(name);

  const sig = `${file}.sig`;
  if (!existsSync(sig)) continue;
  cpSync(sig, join(out, `${name}.sig`));
  signed.push({ file, name, signature: readFileSync(sig, "utf8").trim() });
}

const payload = signed
  .map((entry) => ({ entry, rank: PAYLOAD_PRIORITY.findIndex((ext) => entry.file.endsWith(ext)) }))
  .filter((candidate) => candidate.rank !== -1)
  .sort((a, b) => a.rank - b.rank)[0]?.entry;

if (!unsigned && !payload) {
  console.error(`nothing was signed for ${platform} under ${bundleRoot}`);
  process.exit(1);
}

if (payload) {
  writeFileSync(
    join(out, `meta-${platform}.json`),
    JSON.stringify({ platform, asset: payload.name, signature: payload.signature }, null, 2)
  );
}

// Windows also ships the bare executable: copy it next to the installer.
if (platform.startsWith("windows")) {
  const exe = join("src-tauri", "target", target, "release", "suoji.exe");
  const name = `${base}-portable.exe`;
  cpSync(exe, join(out, name));
  shipped.push(name);
}

console.log(`${platform}: ${shipped.join(", ")}`);
console.log(`${platform}: updater payload = ${payload?.name || "(none)"}`);
