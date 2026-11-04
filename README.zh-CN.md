<div align="center">

  <h1>琐记 · Suoji</h1>

  <p><strong>只干一件事的桌面小应用：让琐事不会无声溜走。</strong></p>
  <p>本地优先 · 无账号 · 无联网 · 一个 SQLite 文件</p>

  <p>
    <a href="https://github.com/Leecoin49/suoji/actions/workflows/ci.yml"><img src="https://github.com/Leecoin49/suoji/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
    <a href="https://github.com/Leecoin49/suoji/releases"><img src="https://img.shields.io/github/v/release/Leecoin49/suoji?display_name=tag" alt="Release" /></a>
    <img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="License" />
    <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-0078D4?logo=windows&logoColor=white" alt="Platform" />
    <img src="https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white" alt="Tauri 2" />
    <img src="https://img.shields.io/badge/Vue-3-42B883?logo=vue.js&logoColor=white" alt="Vue 3" />
  </p>

  <p>
    <a href="README.md">English</a> | 中文
  </p>

  <p>
    <img src="docs/screenshots/day.zh.png" alt="今天" width="420" />
    <img src="docs/screenshots/history.zh.png" alt="记录" width="420" />
  </p>

</div>

## 为什么做它

大多数待办应用都在同两个瞬间失效：想到一件事的那十秒（干脆不记了），
以及晚上要把昨天在脑子里重新过一遍的时候。

琐记只围绕这两个瞬间。它刻意做小：每个功能要么让**记录更快**，
要么让**每天回顾更省事**，否则就不进。

普通待办里没有的那一件事：**没有什么会悄悄溜走**。没做完的每天零点自动顺延，
并且留下痕迹——被往后挪了几次（`挪过 5 次`）、已经挂了多久（`挂了 12 天`）。
默默烂掉的事会自己浮上来，而不是等你想起来去找它。

## 功能

### 一句话记下来

任何地方按 `Ctrl+Alt+Space` 唤出，敲一行，回车。没有项目、没有标签、没有日期选择器——
默认进收件箱。

剩下的事交给一套纯文本小语法（中英文都认）：

| 你写 | 结果 |
| --- | --- |
| `交周报 @明天` | 落到明天 |
| `跟产品对齐 @15:30` | 今天 15:30，单独一组 |
| `补报销单 @周五` | 那周的周五 |
| `@10-25` `@10/25` `@后天` | 指定日期都认 |
| `回王姐消息!` | 结尾感叹号 = 今天就做 |

### 日子自己会顺延

- 没做完的，零点自动滚到新的一天——是后台动作，不是你要做的家务。
- 每次顺延累加**挪动次数**；`first_seen_date` 算出**挂了几天**的徽标。
- 早上给的是「今天该做的几件」，不是一屏看不到头的待办。

### 两次轻提醒，一次收工结账

- 早晚各一次提醒，时间自己定（默认 09:00 / 18:30）。
- 提醒只在设定时间之后的 2 小时内触发，错过的不会在深夜补发。
- 傍晚收工：把剩下的逐条过一遍——明天 / 收件箱 / 不做了——最后留一句给明天
  （**明日签**），第二天开机会在水面上等着你。

### 做完的事不会消失

- 今天勾掉的仍然可见，收在可展开的「今天已经做掉」里。
- 记录浮层能翻最近 7 / 30 / 90 天，按日分组，带完成时间、备注、以及被挪过几次。
- 勾错了？一键退回今天。

### 内建双语

- 界面**中英双语**，在设置里切换，托盘菜单与提醒文案立即跟随。
- 所有文案集中在 `src/lib/i18n.ts`（界面）与 `src-tauri/src/i18n.rs`（托盘、通知），
  加一门语言是改数据，不是重构。

### 天生本地

- 无账号、无服务器、无遥测。唯一的网络请求是查更新（可在设置里关掉）。
- 一个 SQLite 文件：`%APPDATA%\com.tool.suoji\suoji.db`——复制它就是备份。
- 关窗口收进托盘，提醒照常；托盘菜单里可以退出。
- 自带使用说明（标题栏 `?`），第一次启动自动打开。

## 安装

去 [Releases](https://github.com/Leocoin49/suoji/releases) 下最新一版。六个平台，跟 dbx 同一套发布矩阵：

| 平台 | 文件 |
| --- | --- |
| Windows 10/11 x64 | `Suoji_<版本>_x64-setup.exe`（装到当前用户，不要管理员），`Suoji_<版本>_x64-portable.exe` |
| Windows 10/11 arm64 | `Suoji_<版本>_arm64-setup.exe`，`Suoji_<版本>_arm64-portable.exe` |
| macOS 10.15+ 苹果芯片 | `Suoji_<版本>_arm64.dmg` |
| macOS 10.15+ Intel | `Suoji_<版本>_x64.dmg` |
| Linux x64 | `Suoji_<版本>_amd64.AppImage`，`Suoji_<版本>_amd64.deb` |
| Linux arm64 | `Suoji_<版本>_arm64.AppImage`，`Suoji_<版本>_arm64.deb` |

Windows 上装完应用名是「琐记」。Windows 自带 WebView2；Linux 版需要系统里有 `libwebkit2gtk-4.1`。
## 更新

应用自带更新中心：**设置 → 更新**，或标题栏的下载图标。

- 每天检查一次（可关），发现新版本会安静地后台下载。
- 标题栏图标上出现小圆点，表示已经下好；不点「重启并更新」就不会装。
- 面板里能看到这版的更新说明；不想装的版本可以永久跳过。
- 每个发布都带 minisign 签名，装之前会验签，被篡改的包会直接拒绝。

应用读取的清单是最新 Release 上的 `latest.json`，由 `.github/workflows/release.yml` 生成。
更新地址和公钥在 `src-tauri/tauri.conf.json` 的 `plugins.updater` 里。

## 本地开发

### 环境要求

| 工具 | 版本 |
| --- | --- |
| Node.js | >= 22（见 `.nvmrc`） |
| pnpm | 8+（也可以用 `corepack enable`） |
| Rust | >= 1.88（stable） |
| VS Build Tools | 2019+，勾选「使用 C++ 的桌面开发」 |
| WebView2 | 任意较新版本 |

### 运行

```bash
pnpm install
make dev          # 或：pnpm tauri dev
```

`pnpm dev` 只起 Vite 前端。应用是单实例的：要么先关掉正在运行的实例，
要么临时改掉 `src-tauri/tauri.conf.json` 里的 `identifier`，两个就能并存
（不同 identifier 各自一个库）。

### 打包

```bash
make build        # 类型检查 + 前端构建
make package      # 完整桌面构建（当前平台的全部 bundle）
```

产物在 `src-tauri/target/release/` 与 `src-tauri/target/release/bundle/<nsis|dmg|deb|appimage>/`。加 `--target` 可以构建别的平台的包，例如 `pnpm tauri build --target aarch64-apple-darwin`。

打更新包需要签名私钥；没有私钥也能构建，但不会产出 `*.sig`，CI 也生成不了 `latest.json`：

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = "D:\path\to\updater.key"   # 也可以是密钥字符串本身
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""                  # 免密密钥留空
make package
```

> [!NOTE]
> NSIS 打包器首次运行会从 GitHub 下载工具链。网络受限时，先设 `HTTPS_PROXY` /
> `HTTP_PROXY` 再 `make package`。

> [!NOTE]
> Windows 上只打 NSIS 安装包（`src-tauri/tauri.windows.conf.json`）。MSI/WiX
> 无法编码中文产品名「琐记」，两者装出来是同一个应用。macOS 与 Linux 仍然构建全部 bundle。

### 检查

```bash
make check        # vue-tsc + cargo fmt --check + cargo clippy -D warnings
make fmt          # 格式化 Rust
```

### 截图用的演示数据

```powershell
# 关掉应用，往一个一次性的预览库灌数据（identifier 用 com.tool.suoji.preview）
sqlite3 "$env:APPDATA\com.tool.suoji\suoji.db" ".read scripts/demo-seed.sql"
```

`scripts/demo-seed.sql` 是英文任务文案，`scripts/demo-seed.zh.sql` 是中文的，
两种语言的截图都能出。

`scripts/screenshot.ps1 -Pid2 <pid> -Out day.png` 用 `PrintWindow` 在后台截图，
不会抢你的焦点。

## 数据放在哪

```
%APPDATA%\com.tool.suoji\suoji.db
```

一个标准 SQLite 文件。复制它就是备份，删掉它就是重来。运行时唯一会联网的地方是查更新
（设置里可以关），任务内容不会离开这台机器。

## 技术栈

| 层 | 选择 |
| --- | --- |
| 外壳 | Tauri 2（Rust） |
| 界面 | Vue 3 + TypeScript + Vite |
| 样式 | Tailwind CSS 4 |
| 状态 | Pinia |
| 存储 | rusqlite（bundled）里的 SQLite |
| 多语言 | 手写 `ref` + 字典，不引 i18n 运行时 |
| 图标 | lucide-vue-next |
| 日期 | dayjs |

## 项目结构

```
src/                    Vue 前端
  components/           TitleBar、CaptureBar、TaskRow，以及结账/记录/帮助/设置四个浮层
  lib/api.ts            所有 Tauri 命令的类型化封装
  lib/i18n.ts           全部界面文案，中英各一份
  lib/parse.ts          「一句话语法」解析器
  stores/day.ts         Pinia store
src-tauri/src/
  lib.rs                插件、托盘、全局快捷键、开机自启、命令注册
  commands.rs           全部 IPC 命令
  i18n.rs               托盘与通知文案
  ui.rs                 托盘菜单与语言切换
  db.rs                 连接、建表、meta/设置
  model.rs              与前端共享的 serde 类型
  schedule.rs           30 秒心跳：零点顺延 + 两次提醒
scripts/                图标生成、截图脚本、演示数据
docs/screenshots/       README 图片
```

## 文档

- [`CONTRIBUTING.md`](CONTRIBUTING.md) · [`CONTRIBUTING.zh-CN.md`](CONTRIBUTING.zh-CN.md)
- [`SECURITY.md`](SECURITY.md)
- 应用内帮助：标题栏 `?`（源码：`src/lib/i18n.ts` 的 `helpContent`）

## 参与

欢迎 issue 和 PR——请先读 [`CONTRIBUTING.zh-CN.md`](CONTRIBUTING.zh-CN.md)，
一次只做一件事。提交说明请用英文。

## 许可证

[Apache License 2.0](LICENSE)，随附组件见 [`NOTICE`](NOTICE)。
