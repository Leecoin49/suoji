# 参与琐记贡献

琐记是一个只做一件事的小应用：让琐事不会无声溜走。这个定位本身就是设计约束——
任何改动都用两个问题来评判：它让"记下来"更快了吗？它让"每天回顾"更省事了吗？

English | [中文](CONTRIBUTING.zh-CN.md)

## 从哪里开始

- **提 Bug** — 用 Bug 模板开 issue，写清版本、系统、复现步骤。
- **提想法** — 用功能请求模板。说清楚现在这套流程让你付出了什么代价，而不只是你想要什么功能。
- **提代码** — Bug 修复和小打磨的 PR 永远欢迎。凡是新增页面、新增设置项、新增依赖的，
  请先开 issue 对齐范围。

## 开发环境

### 环境要求

| 工具 | 版本 | 说明 |
| --- | --- | --- |
| Node.js | >= 22 | `.nvmrc` 与 CI 保持一致 |
| pnpm | 8+ | 也可以用 `corepack enable` |
| Rust | >= 1.88 | stable，Windows 上是 `x86_64-pc-windows-msvc` |
| WebView2 | 任意较新版本 | Win10/11 自带 |
| VS Build Tools | 2019+ | 勾选"使用 C++ 的桌面开发" |

### 本地运行

```bash
pnpm install
make dev        # 或：pnpm tauri dev
```

`pnpm dev` 只起 Vite 前端，没有 Rust 后端，所以除了调样式，请用 `make dev`。

开发版和已安装版共用同一个数据库（`%APPDATA%\com.tool.suoji\suoji.db`）。
应用是单实例的：要么先关掉正在运行的实例，要么临时把
`src-tauri/tauri.conf.json` 里的 `identifier` 改掉，两个就能并存。

### 检查

```bash
make check      # vue-tsc + cargo fmt --check + cargo clippy -D warnings
make fmt        # 格式化 Rust 代码
```

CI 在 `windows-latest` 上跑的就是这两条。检查不过的 PR 不合并。

## 项目结构

```
src/                     Vue 3 前端
  components/            TitleBar、CaptureBar、TaskRow，以及结账/记录/帮助/设置四个浮层  lib/api.ts             所有 Tauri 命令的类型化封装
  lib/i18n.ts            全部界面文案，中英各一份
  lib/parse.ts           「一句话语法」解析器（@日期、@时间、结尾 !）
  stores/day.ts          Pinia：今天、收件箱、记录、设置
src-tauri/src/
  main.rs                入口，只负责调用 lib::run
  lib.rs                 应用装配：插件、托盘、快捷键、开机自启、命令注册
  commands.rs            全部命令实现（invoke handler）
  i18n.rs                托盘与通知的中英文案
  ui.rs                  托盘菜单与语言切换
  db.rs                  SQLite 连接与建表/迁移
  model.rs               与前端共享的 serde 类型
  schedule.rs            30 秒一次的心跳：零点顺延与两次提醒
scripts/                 图标生成，以及生成文档截图用的脚本
```

## 开发约定

### 分支命名

`feat/<简短描述>`、`fix/<简短描述>`、`docs/<简短描述>`。一个分支只做一件事。

### 控制改动范围

不要顺手全量格式化，不要夹带无关依赖升级，不要重命名这次改动用不到的文件。
发现别的问题请另开 issue。

### 提交说明

- 祈使句标题，不超过 72 字符，且**用英文**：`fix: keep hotkey registered after saving settings`
- 正文解释**为什么**，不要复述 diff 已经说了的内容。
- 用 `Close #12` 关联 issue。

### 文案与翻译

界面上的字符串一律不硬编码。在 `src/lib/i18n.ts` 的 `dict.zh` 和 `dict.en` 里
**同时**加键（托盘/通知文案在 `src-tauri/src/i18n.rs` 里成对加），然后用 `t("your.key")`。
应用是中英双语的，只存在于一种语言里的字符串算 bug。

### 数据与迁移

数据库是用户的唯一副本。任何表结构改动都必须是增量且可重复执行的
（`CREATE TABLE IF NOT EXISTS`、带存在性判断的 `ALTER TABLE ... ADD COLUMN`），
因为目前还没有导入导出功能。迁移里绝不能删除或改写用户数据行。

### 测试

目前还没有测试框架。在此之前，PR 必须说明验证方式：跑了什么命令、点了哪些步骤；
涉及 UI 的必须附截图。

超出 typo 级别的改动要走 `AGENTS.md` 里的规格流程：先有一份写明**不许变什么**的
`specs/<NNN>-<slug>/spec.md`，再动代码。提 PR 之前跑闸门（Windows 没有 `make`，
直接调脚本）：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/speckit/gate.ps1
```

### 文档

用户可见的行为变化要同时更新三处：`README.md`、`README.zh-CN.md`，以及应用内帮助
（`src/lib/i18n.ts` 里的 `helpContent`）。用户真正会看的是应用内的那份。

## 发布与更新签名

应用通过 `tauri-plugin-updater` 自己更新，要两件事对上：

1. `src-tauri/tauri.conf.json` 里 `plugins.updater.pubkey` 的**公钥**。
2. 打包时用于签名的**私钥**：环境变量 `TAURI_SIGNING_PRIVATE_KEY`（路径或密钥字符串）
   与 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`。

密钥对只生成一次，私钥不要进仓库：

```bash
pnpm tauri signer generate -w ~/.tauri/suoji-updater.key
```

把公钥（`.key.pub` 内容做 base64）填进 `plugins.updater.pubkey`，私钥存进仓库 secret
`TAURI_SIGNING_PRIVATE_KEY`。直接粘密钥本身或粘一份 base64 副本都行，
`.github/workflows/release.yml` 两种都认，会在构建前解开。

推一个 `v*` tag 就是一次完整发布：

```bash
# 先在 package.json、src-tauri/Cargo.toml、tauri.conf.json 里改版本号
git commit -am "chore: bump to 0.1.2"
git tag v0.1.2 && git push origin main v0.1.2
```

CI 会同时构建六个平台——Windows x64/arm64、macOS Intel/苹果芯片、Linux x64/arm64（跟 dbx 同一套矩阵）。
每条腿都带 `createUpdaterArtifacts`，.github/scripts/collect-assets.mjs 负责把产物改成 ASCII 名
（`Suoji_<版本>_<架构>-setup.exe`、`-portable.exe`、`.dmg`、`.AppImage`、`.deb`）并记下签名；
publish 作业把这些记录合成 `latest.json`——它就是已安装的应用会去拉的那份清单，少它等于这次发布没人能更新。

打 tag 之前，先在新文件 `release-notes/<版本>.md` 里写这版改了什么。它同时是 GitHub release
正文和应用内更新面板里显示的文案——先英文，一行 `---`，再中文。

## 提 PR

1. Fork、开分支，保持 diff 聚焦。
2. 跑 `make check`。
3. 填 PR 模板，UI 改动附截图。
4. 一次 review 通过 + CI 绿即可合并。

## 欢迎的贡献类型

- 扩充「一句话语法」（日期、重复事项），同时更新帮助页文案。
- 无障碍与纯键盘操作流程。
- 中英文文案打磨——两种语言都是一等公民，也都还没打磨完。
- macOS / Linux 构建适配。

## 社区

- Issue：https://github.com/Leecoin49/suoji/issues
- 安全报告：见 [SECURITY.md](SECURITY.md)，不要开公开 issue。
