# Contributing to Suoji

Suoji does one thing: make sure small things do not slip away silently. That
scope is the design constraint - every change is judged by two questions. Does
it make capturing faster? Does it make the daily review cheaper?

English | [中文](CONTRIBUTING.zh-CN.md)

## Where to start

- **Bugs** - open an issue with the bug template. Version, Windows build and
  reproduction steps, please.
- **Ideas** - use the feature request template. Describe what the current flow
  costs you, not just the feature you want.
- **Code** - fixes and small polish are always welcome. Anything that adds a
  screen, a setting or a dependency should start as an issue so we can agree on
  the scope first.

## Development setup

### Requirements

| Tool | Version | Notes |
| --- | --- | --- |
| Node.js | >= 22 | matches `.nvmrc` and CI |
| pnpm | 8+ | `corepack enable` works too |
| Rust | >= 1.88 | stable, `x86_64-pc-windows-msvc` on Windows |
| WebView2 | anything recent | ships with Windows 10/11 |
| VS Build Tools | 2019+ | with "Desktop development with C++" |

### Run it locally

```bash
pnpm install
make dev        # same as: pnpm tauri dev
```

`pnpm dev` only starts Vite, without the Rust backend. Use `make dev` unless you
are purely tweaking styles.

The dev build shares one database with the installed app
(`%APPDATA%\com.tool.suoji\suoji.db`). Suoji is single-instance: quit the running
copy, or temporarily change `identifier` in `src-tauri/tauri.conf.json`, to run
both side by side.

### Checks

```bash
make check      # vue-tsc + cargo fmt --check + cargo clippy -D warnings
make fmt        # format Rust
```

This is exactly what CI runs on `windows-latest`. A red check is a blocked PR.

## Project layout

```
src/                     Vue 3 front end
  components/            TitleBar, CaptureBar, TaskRow, plus close-out/history/help/settings sheets
  lib/api.ts             Typed wrappers for every Tauri command
  lib/i18n.ts            All user-visible strings, zh and en
  lib/parse.ts           The "one line" syntax (@date, @time, trailing !)
  stores/day.ts          Pinia: today, inbox, history, settings
src-tauri/src/
  main.rs                Entry point, just calls lib::run
  lib.rs                 Wiring: plugins, tray, hotkey, autostart, command registry
  commands.rs            Every command behind the invoke handler
  i18n.rs                Tray and notification strings for both locales
  ui.rs                  Tray menu and locale switching
  db.rs                  SQLite connection, schema and migrations
  model.rs               Serde types shared with the front end
  schedule.rs            The 30s heartbeat: midnight rollover and two reminders
scripts/                 Icon generation and screenshot helpers
```

## Conventions

### Branch names

`feat/<short>`, `fix/<short>`, `docs/<short>`. One topic per branch.

### Keep the diff tight

No drive-by reformatting, no unrelated dependency bumps, no renaming files this
change does not need. Open a separate issue for anything else you spot.

### Commits

- Imperative subject, at most 72 characters: `fix: keep hotkey registered after saving settings`
- Body explains **why**. Do not restate the diff.
- Reference issues with `Close #12`.

English only, even when the discussion happened in Chinese.

### Strings and translations

Nothing user-visible is hardcoded. Add a key to **both** `dict.zh` and `dict.en`
in `src/lib/i18n.ts` (and to `src-tauri/src/i18n.rs` for tray or notification
text), then use `t("your.key")`. The app ships bilingual; a string that exists in
only one language is a bug.

### Data and migrations

The database file is the user's only copy. Schema changes must be additive and
idempotent (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN` guarded by
an existence check) because there is no import/export yet. A migration must never
delete or rewrite existing rows.

### Tests

There is no test harness yet. Until there is, every PR must state how it was
verified: commands run, steps clicked, and a screenshot for UI changes.

Anything beyond a typo goes through the spec flow in `AGENTS.md`: a
`specs/<NNN>-<slug>/spec.md` that says what must **not** change, then code. Before
opening a PR, run the gate (Windows has no `make`, so call the script):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/speckit/gate.ps1
```

### Docs

Behaviour changes update three places: `README.md`, `README.zh-CN.md`, and the
in-app help (`src/lib/i18n.ts` -> `helpContent`). The help sheet is the one users
actually read.

## Releases and update signing

The app updates itself through `tauri-plugin-updater`. Two things must line up:

1. **The public key** in `src-tauri/tauri.conf.json` (`plugins.updater.pubkey`).
2. **The private key** used to sign the bundle, via `TAURI_SIGNING_PRIVATE_KEY`
   (a path or the key string) and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.

Generate a keypair once - keep the private key out of the repository:

```bash
pnpm tauri signer generate -w ~/.tauri/suoji-updater.key
```

Shift the public key into `plugins.updater.pubkey` (base64 of the `.key.pub`
contents) and store the private key as the repository secret
`TAURI_SIGNING_PRIVATE_KEY`. Either paste the key itself, or paste a base64 copy;
`.github/workflows/release.yml` accepts both and decodes it before the build.

Pushing a `v*` tag is the whole release:

```bash
# bump the version in package.json, src-tauri/Cargo.toml and tauri.conf.json
git commit -am "chore: bump to 0.1.2"
git tag v0.1.2 && git push origin main v0.1.2
```

CI builds six legs - Windows x64/arm64, macOS Intel/Apple Silicon, Linux x64/arm64
(the same matrix dbx ships). Each leg runs `tauri build` with
`createUpdaterArtifacts`, then `.github/scripts/collect-assets.mjs` renames its
bundles to ASCII (`Suoji_<version>_<arch>-setup.exe`, `-portable.exe`, `.dmg`,
`.AppImage`, `.deb`) and records the signature. The publish job merges those
records into `latest.json`, the file installed apps poll - a release without it is
a release nobody updates to.

Write what changed in `release-notes/<version>.md` before tagging. That file
becomes both the GitHub release body and the text the in-app update panel shows -
English first, then a `---`, then the Chinese version.

## Sending a PR

1. Fork, branch, keep the diff focused.
2. Run `make check`.
3. Fill in the PR template; attach a screenshot for UI changes.
4. One review plus green CI is enough to merge.

## Especially welcome

- Extending the one-line syntax (dates, repeating items), together with the help
  text for it.
- Accessibility and full keyboard-only flows.
- Polish for either language - both are first class, neither is finished.
- macOS / Linux build support.

## Community

- Issues: https://github.com/Leecoin49/suoji/issues
- Security: see [SECURITY.md](SECURITY.md) - please do not open a public issue.
