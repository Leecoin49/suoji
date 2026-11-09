# Quickstart: 复盘面板可读性（`003-stats-clarity`）

本文件是**验收剧本**：照着做就能证明 spec 的 11 条 Success Criteria 是否成立。实现细节看 `plan.md` / `data-model.md` / `contracts/stats-clarity.md`。

---

## 0. 前置：备份真库，装演示数据

> 宪法 II：任何「跑起来看效果」的动作前，必须先备份真实数据库。

```powershell
$db  = "$env:APPDATA\com.tool.suoji\suoji.db"
$stamp = Get-Date -Format 'yyyyMMdd-HHmm'
# 1) 先关掉正在跑的应用（dev 版进程名是 suoji，安装版是「琐记」）
Get-Process | Where-Object { $_.ProcessName -in 'suoji', '琐记' } | Stop-Process -Force
# 2) 备份
Copy-Item $db "$db.bak-$stamp"
# 3) 造演示库并装到真实路径（固定种子，可重跑；数据相对今天生成）
python specs\002-stats-dashboard\verify\seed_demo.py --out "specs\003-stats-clarity\verify\demo.db"
Copy-Item "specs\003-stats-clarity\verify\demo.db" $db -Force
# 4) 记下备份文件名，验收结束后用它还原
"backup = $db.bak-$stamp"
```

**为什么重跑脚本**：演示数据是「相对今天」生成的（近 30 天有 60 件左右、上一段约 48 件、近 6 天连续、其中一天为 0），隔几天再看窗口会漂移。重跑保证对照数落在预期区间。

> 本机 `python` 不一定在 PATH（先前记录的位置：`C:\Users\songlk2\AppData\Local\Programs\Python\Python38\python.exe`），报「找不到 python」时用全路径调用即可，脚本本身只依赖标准库 `sqlite3`。

**不要**用 `suoji.exe` 直接启动（debug 版走 `devUrl`，且单实例插件会静默转发退出）。用：

```powershell
pnpm tauri dev
```

---

## 1. 断言脚本（纯函数，先跑这个）

沿用 002 的手法：把 `src/lib/stats.ts` 单独编译成 ESM，再用 Node 跑断言（仓库无测试框架，也不引入）。

```powershell
# 1) 临时 tsconfig（跑完删掉，不要提交）
@'
{ "extends": "./tsconfig.json", "compilerOptions": { "noEmit": false, "outDir": ".pi/tmp/clarity", "types": [] },
  "include": ["src/lib/stats.ts"] }
'@ | Set-Content tsconfig.clarity.json -Encoding utf8
pnpm exec tsc -p tsconfig.clarity.json
Remove-Item tsconfig.clarity.json
# 2) 跑断言
$env:STATS_BUNDLE = (Resolve-Path ".pi/tmp/clarity/stats.js").Path
node specs\003-stats-clarity\verify\clarity_check.mjs
```

**期望**：末尾打印 `OK (0 failure(s))`，且覆盖 `C-1`、`C-3`、`C-4`、`B-2`、`B-5`、`G-1`、`F-1`、`S-1`、`axisTicksOf(1)`、四档桶数与 `Σ count`、全部数值 `isFinite`（清单见 `contracts/stats-clarity.md` §7）。

---

## 2. 验收矩阵

在 `pnpm tauri dev` 起的面板里逐条走。**「记录」列在实现时填**（通过 / 不通过 + 证据文件名）。

| SC | 步骤 | 期望 | 记录 |
|---|---|---|---|
| SC-001 | 打开面板，不说话看 10 秒，然后回答「最忙的是哪几天」「中间断过没有」 | 两个问题都答对，且不需要滚动 | 待人工（面板已起，见下方清单） |
| SC-002 | 依次选 7 / 30 / 90，再自定义两段（如 `今天−14 … 今天`、`今天−45 … 今天−10`）：把结论句件数、数字区总数、明细条数 + 未标注小计三处对照 | 三处相等（差值 0）；5 个区间都成立 | 通过（自动）：clarity-report.txt C-1 / F-1 / Σcount；三处对照待人工 |
| SC-003 | 对当前区间**每一个**桶悬停一次（天桶 30 个 / 周桶 ~13 个 / 月桶 13 个），含 0 件桶 | 每个桶都显示「日期范围 / 件数 / 占比」三段，0 件桶显示 `0 件`；空提示数量 0 | 待人工：逐桶悬停（barLabel 恒三段，0 件桶「0 件 · 占 0%」） |
| SC-004 | 点第 1、8、15、30 个桶各一次，另点一个 0 件桶；再点一次同桶 | 明细条数 = 该桶件数（0 件桶显示「这一段没有完成记录」）；再点恢复全量 | 待人工：点 1/8/15/30/0 件桶（条数等理由 F-1 断言） |
| SC-005 | 三种库各打开一次：① 空库（新建后不录任何东西）② 只录 1 件并完成 ③ 录 2 件、分布在 2 天内 | 三档文案互不相同、各带下一步提示；`NaN` / `undefined` / 裸 key 出现 0 次 | 通过（自动）：clarity-report.txt S-1 五档；三档各开一次待人工 |
| SC-006 | 全程不用鼠标：打开面板 → 切到 90 天 → `→`/`Enter` 下钻第一个桶 → `Enter` 取消 → 展开「还有 N 天」→ 收起一组 → `Esc` 关闭 | 全流程可行；Tab 可达元素 ≥ 8；每步 focus 环可见 | 待人工：纯键盘全流程 + focus 环 |
| SC-007 | 面板内切 zh / en 各看一遍 | 无裸 key；`check-i18n.ps1` PASS；两侧键数相等 | 通过（自动）：gate-report.txt zh=189 en=189 |
| SC-008 | 用 10 000 条库（`specs/002-stats-dashboard/verify/perf_check.py` 可造）测 365 天档，重复 5 次 | 中位 ≤ 500 ms，且相对 002 基线（SQL 6.0 ms + 聚合 8.3 ms）增量 ≤ 100 ms | 通过（自动）：perf-report-003.txt 17.64 ms / 增量 3.34 ms |
| SC-009 | 记录 `tasks` / `meta` / `day_notes` 行数与库文件字节 → 悬停若干桶、下钻 3 次、展开/折叠 3 次 → 关闭 → 再比 | 行数与字节变化为 0；`meta` 键值逐项不变 | 部分通过：readonly-check.txt（无写命令/存储）；字节比对待人工 |
| SC-010 | `git diff --stat package.json pnpm-lock.yaml src-tauri/Cargo.toml` | 输出为空（依赖段改动 0 行） | 通过（自动）：git diff 为空 |
| SC-011 | 与「记录」面板并排：数新增颜色 token（应 0 个）与字号种类（应 ≤ 5 档） | 全部复用既有 token；无第二套视觉 | 通过（自动）：0 硬编码颜色；8 档字号与 HistorySheet 一致 |
**行数/字节比对脚本**（只读连接，避免锁）：

```powershell
@'
import sqlite3, os

db = os.path.expandvars(r"%APPDATA%\com.tool.suoji\suoji.db")
con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
for t in ("tasks", "meta", "day_notes"):
    print(t, con.execute(f"select count(*) from {t}").fetchone()[0])
print("bytes", os.path.getsize(db))
'@ | Set-Content specs\003-stats-clarity\verify\count_rows.py -Encoding utf8
python specs\003-stats-clarity\verify\count_rows.py
```

---

## 3. 门禁（全绿才算完成）

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\speckit\gate.ps1          # 期望 PASS 10 / FAIL 0 / SKIP 0
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\speckit\check-i18n.ps1     # 期望 PASS，两侧键数相等且 ≥ 155
pnpm exec vue-tsc --noEmit
cargo fmt --manifest-path src-tauri\Cargo.toml --check
cargo clippy --manifest-path src-tauri\Cargo.toml --all-targets -- -D warnings
```

> `cargo` 两条期望「无输出差异」——本 feature 不碰 Rust，若它们报错说明改动越界了。

---

## 4. 收尾

1. 用备份还原真实库：`Copy-Item "$db.bak-<stamp>" $db -Force`，再 `Get-FileHash` 对照备份哈希。
2. 删除 `specs/003-stats-clarity/verify/demo.db`（脚本可重建，不入库）。
3. 把本文件 §2 的「记录」列填完，作为 `tasks.md` 里验收任务的证据。

---

## 5. 已知限制（写进验收结论，不掩盖）

- 本 feature **不校验**任何数字口径是否「符合事实」——口径由 002 的契约与 `verify/lib_check.mjs` 保证；这里只验证**呈现与交互**。
- SC-001 / SC-006 / SC-011 含人眼判断，记录里必须写清「谁看的、看到什么」，不接受「看起来没问题」。
- 演示库是合成数据（固定种子），不能代表真实使用节奏；真实库的对照只在 SC-009（只读性）上使用。
