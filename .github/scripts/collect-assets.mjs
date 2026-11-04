// Rename the bundles of one matrix leg into stable, ASCII release asset names and
// record which of them is the file the updater should download.
//
//   node .github/scripts/collect-assets.mjs \
//     --version 0.1.1 --target x86_64-pc-windows-msvc \
//     --platform windows-x86_64 --arch x64 --out dist
//
// productName is non-ASCII (琐记) and GitHub mangles those file names on the
// Windows runner, so every asset is renamed to Suoji_<version>_<arch><ext>.

import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

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

/** Walk a directory, returning every regular file. */
function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const files = walk(bundleRoot);
if (files.length === 0) {
  console.error(`no bundles under ${bundleRoot}`);
  process.exit(1);
}

/** Map a bundle file to its release asset name, or null when it is not shipped. */
function assetName(file) {
  const base = `Suoji_${version}_${arch}`;
  if (file.endsWith(".app.tar.gz")) return `${base}.app.tar.gz`;
  if (file.endsWith(".AppImage")) return `${base}.AppImage`;
  if (file.endsWith(".dmg")) return `${base}.dmg`;
  if (file.endsWith(".deb")) return `${base}.deb`;
  if (file.endsWith(".exe") && !file.endsWith(".sig")) return `${base}-setup.exe`;
  return null;
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const shipped = [];
let updaterAsset = "";

for (const file of files) {
  if (file.endsWith(".sig")) continue;
  const name = assetName(file);
  if (!name) continue;
  cpSync(file, join(out, name));
  shipped.push(name);

  // Windows installs the .exe, macOS the .app.tar.gz, Linux the .AppImage.
  const isUpdater = name.endsWith("-setup.exe") || name.endsWith(".app.tar.gz") || name.endsWith(".AppImage");
  if (isUpdater) {
    if (unsigned) continue;
    updaterAsset = name;
    const sig = `${file}.sig`;
    try {
      const signature = readFileSync(sig, "utf8").trim();
      cpSync(sig, join(out, `${name}.sig`));
      writeFileSync(
        join(out, `meta-${platform}.json`),
        JSON.stringify({ platform, asset: name, signature }, null, 2)
      );
    } catch {
      console.error(`missing signature for ${file}`);
      process.exit(1);
    }
  }
}

if (!updaterAsset && !unsigned) {
  console.error(`no updater artifact found for ${platform} under ${bundleRoot}`);
  process.exit(1);
}

// Windows also ships the bare executable: copy it next to the installer.
if (platform.startsWith("windows")) {
  const exe = join("src-tauri", "target", target, "release", "suoji.exe");
  const name = `Suoji_${version}_${arch}-portable.exe`;
  cpSync(exe, join(out, name));
  shipped.push(name);
}

console.log(`${platform}: ${shipped.join(", ")}`);
console.log(`${platform}: updater payload = ${updaterAsset}`);
