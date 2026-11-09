# Quickstart — 004-stats-visual

**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Contract**: [contracts/heat-grid.md](./contracts/heat-grid.md)

这份指南只做一件事：证明「视觉重排」既好看、又没弄坏数字。**所有数字口径由 002/003 的断言守着，本 feature 新增的断言只管排版与档位。**

---

## 0. 前置

```powershell
cd D:\Users\songlk2\Desktop\Tool\suoji
pnpm install                       # 应无改动（SC-010）
git status --short src-tauri package.json pnpm-lock.yaml   # 应为空
```

数据准备（沿用 003 的演示库；**不要**动用户真实库）：

```powershell
# 若真实库已被 003 的演示库占用，先备份再换，收尾时按 demo-note.txt 还原
$appdata = "$env:APPDATA\com.tool.suoji"
Copy-Item "$appdata\suoji.db" "$appdata\suoji.db.bak-$(Get-Date -Format yyyyMMdd-HHmm)" -Force
python specs\002-stats-dashboard\verify\seed_demo.py --out specs\004-stats-visual\verify\demo.db
Copy-Item specs\004-stats-visual\verify\demo.db "$appdata\suoji.db" -Force
```

启动应用（窗口 760×780，面板从标题栏的图表图标进入）：

```powershell
pnpm tauri dev
```

> 注意：直接运行 `target\debug\suoji.exe` 会静默退出（debug 构建需要 vite 的 1420 端口，且被单实例插件转发）。

---

## 1. 断言（纯函数）

> 仓库无测试框架（宪法：「测试框架」是另一个 feature），沿用 002/003 的做法：`tsc` 编到临时目录，再用 `node` 跑断言。

**002 回归**（46 条）：

```powershell
'{"extends":"./tsconfig.json","compilerOptions":{"noEmit":false,"outDir":".pi/tmp/statsbuild","types":[]},"include":["src/lib/stats.ts"]}' |
  Set-Content -Encoding UTF8 tsconfig.statsverify.json
pnpm exec tsc -p tsconfig.statsverify.json
$env:STATS_BUNDLE = (Resolve-Path .pi\tmp\statsbuild\stats.js).Path
node specs\002-stats-dashboard\verify\lib_check.mjs
Remove-Item tsconfig.statsverify.json
```

**003 回归**：同上换 `include: ["src/lib/stats.ts"]` 与 `outDir: ".pi/tmp/claritybuild"`，然后
`node specs\003-stats-clarity\verify\clarity_check.mjs`。

**004 新增**：

```powershell
'{"extends":"./tsconfig.json","compilerOptions":{"noEmit":false,"outDir":".pi/tmp/visualbuild","types":[]},"include":["src/lib/stats.ts"]}' |
  Set-Content -Encoding UTF8 tsconfig.visualverify.json
pnpm exec tsc -p tsconfig.visualverify.json
$env:STATS_BUNDLE = (Resolve-Path .pi\tmp\visualbuild\stats.js).Path
node specs\004-stats-visual\verify\visual_check.mjs    # 期望 OK (0 failure(s))
Remove-Item tsconfig.visualverify.json
```

三份报告落 `specs/004-stats-visual/verify/`：`regress-002.txt`、`regress-003.txt`、`visual-report.txt`。

---

## 2. 人工验收矩阵

| SC | 场景 | 期望 | 结果 |
|---|---|---|---|
| SC-001 | 打开面板，不再动手 | 10 秒内能指出「最忙哪天」「断没断」（结论句 + 峰值点 + 空档） | ⚠️ 待真人（需开面板看 10 秒；实现已给出结论句 + 峰值点 + 空档天数三处锚点） |
| SC-002 | 看列密度 | 能指出「哪一周最密」 | ✅ 通过（数据层）—— `verify/visual-report.txt` 的 35 周网格、每周 7 格、`monthTicksOf` 月标签均按列；最密一周可由悬停提示 `hoverCount` 直接读出 |
| SC-003 | 760×780 窗口 | 四张指标卡首屏内读完，无需滚动 | ⚠️ 待真人（760×780 下四卡 `min-[620px]:grid-cols-4` 触发，height 一致；需目视确认无换行） |
| SC-004 | 连续切 7→30→90 各 3 次 | 高度 0 跳变、0 空白闪烁（录屏复核） | ⚠️ 待真人（录屏项）；实现上结果容器 `:key` 绑定区间 + `.fade-swap` 仅 opacity，布局不参与动画 |
| SC-005 | 纯键盘：Tab 进面板 → 方向键移格 → Enter 下钻 → Enter 取消 | ≤10 秒完成 | ⚠️ 待真人（计时项）；断言已覆盖 `heatMove` 的 ←/→/↑/↓/Home/End/越界 clamp（`visual-report.txt` A-38…A-52） |
| SC-006 | 灰度/色盲模拟截图 | 「今天（环）」「峰值（点）」「0 件（中性）」三者可区分 | ✅ 通过（结构层）—— 今天用 `ring-1 ring-ink/55` 环、峰值用 4px 圆点（浅档 `bg-ink/60`、深档 `bg-card/90`）、0 件为 `bg-line-soft`；三者不依赖色相 |
| SC-007 | DevTools Performance 或录屏 | 切换淡入 150±50ms；系统开「减少动态效果」后 0ms | ⚠️ 待真人（DevTools/录屏）；`.fade-swap` 为 150ms、`prefers-reduced-motion` 媒体查询把 animation/transition 归零 |
| SC-008 | 003 的 11 条 SC 复跑 | 全部仍通过（明细分组/脚注/稀疏五档/推后榜） | ✅ 通过 —— `verify/regression-004.txt`：002 `fixture_check.py` 6 例全 OK、003 `clarity_check.mjs` `OK (0 failure(s))`、性能 17.25 ms ≤ 500 ms |
| SC-009 | 打开面板→切区间→悬停→下钻→关闭 | 库文件 SHA256 前后一致 | ⚠️ 待真人（面板侧）；本次只做了静态核验（`verify/readonly-004.txt`：`api.*` 仅 1 处、写关键词 0 命中、demo 库扫描前后哈希一致），应用在 T001 后未再启动 |
| SC-010 | `git diff --stat package.json pnpm-lock.yaml src-tauri/Cargo.toml` | 三行均空 | ✅ 通过 —— `git diff --stat package.json pnpm-lock.yaml src-tauri/Cargo.toml` 三行全空 |
| SC-011 | `pnpm build` | JS 体积增幅 ≤ +8 kB（003 基线 219.34 kB） | ✅ 通过 —— JS 219341 → 226992（+7651 B = 7.47 KiB < 8192），见 `verify/build-report-004.txt` |

SC-009 的哈希比对：

```powershell
$p = "$env:APPDATA\com.tool.suoji\suoji.db"
function Hash($path) {
  $fs = [IO.File]::Open($path, 'Open', 'Read', 'ReadWrite')
  try { (Get-FileHash -InputStream $fs -Algorithm SHA256).Hash } finally { $fs.Close() }
}
Hash $p          # 打开面板前
# … 打开面板、切 7/30/90、悬停、下钻、关闭 …
Hash $p          # 应与之完全一致
```

---

## 3. 门禁

| 门禁 | 命令 | 期望 |
|---|---|---|
| 双语 | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/speckit/check-i18n.ps1` | `PASS dict zh=203 en=203` |
| 类型与构建 | `pnpm build` | vue-tsc 无错，体积 ≤ +8 kB |
| 只读扫描 | `Select-String -Path src\components\StatsSheet.vue -Pattern 'api\.|localStorage|invoke\('` | 只命中 `api.getStats` |
| Rust 未动 | `cargo fmt --manifest-path src-tauri/Cargo.toml --check` | 无差异（越界哨兵） |
| 规格闸门 | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/speckit/gate.ps1` | `PASS 10 / FAIL 0 / SKIP 0` |

---

## 4. 收尾

```powershell
# 还原用户真实库（见 003 的 verify/demo-note.txt：目标是 bak-20261106-1730）
$appdata = "$env:APPDATA\com.tool.suoji"
Stop-Process -Name suoji -Force -ErrorAction SilentlyContinue   # 应用的进程名是 suoji（dev）/ 琐记（安装版）
Copy-Item "$appdata\suoji.db.bak-20261106-1730" "$appdata\suoji.db" -Force
Remove-Item specs\004-stats-visual\verify\demo.db -ErrorAction SilentlyContinue
```

`verify/` 只留报告（`*-report.txt`），不留 `.db`（演示库可用脚本重造）。

---

## 5. 已知限制

- **只测窗口内视觉**：760×780 与最小 520×560 两个尺寸各看一次，不做移动端。
- **不测深色模式**：应用当前只有纸感浅色主题。
- **不测真实用户库规模以外的极端数据**：演示库 288 条足以覆盖 90 天档；10 000 条的性能数据沿用 003 的 `perf-report-003.txt`。
- **SC-006 的色盲核对**：用灰度截图 + 形状判断，不做专业色觉模拟工具测量。
- **跨零点**：`today` 在面板打开时取一次，跨零点不自动刷新（与 002/003 一致）。
