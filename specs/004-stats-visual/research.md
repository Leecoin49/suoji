# Research — 004-stats-visual

**Date**: 2026-11-09 | **Plan**: [plan.md](./plan.md) | **Spec**: [spec.md](./spec.md)

本 feature 没有 `NEEDS CLARIFICATION`（4 个用户选择 + 1 个推定结论已在 spec 的 Clarifications 闭合）。研究只回答「在既有约束下怎么做」，每个结论都附「被否决的方案与理由」，方便日后回看为什么没选另一条路。

---

## R1 热力图的排版方式

**Decision**：用 CSS Grid 的列优先流式布局——容器 `display:grid; grid-template-rows: repeat(7, var(--cell)); grid-auto-flow: column; grid-auto-columns: var(--cell); gap: 3px`，格子按日期顺序（周一→周日，逐列推进）平铺。列宽/格高按周数取三档：周数 ≤5 → 22px、≤8 → 18px、其余 → 14px。

**Rationale**：
- 列优先流式正好对应「一周一列、周一到周日 7 行」，不需要手算 `row/column` 坐标，也不需要给每个格子塞 `grid-row`。
- 首末列的空白格天然通过「不在区间内的不渲染，但位置要占」实现——用占位 `div`（`visibility:hidden`）比用 `grid-column-start` 计算简单得多。
- 三档尺寸让 7 天档（1 列）不至于出现一个孤零零的小方块：1 列时 22px 偏小，但配合居左对齐与图例可读；90 天档 13 列 × 14px ≈ 220px，不横向滚动（FR-018）。

**Alternatives considered**：
- **绝对定位逐格摆放**：要自己算 x/y、自己处理 gap、焦点环会互相重叠，月标签还得再套一层坐标。否决。
- **每个日期一个「周」容器 + flex**：需要先手算每周从周几开始、补几个空格，逻辑会漏 `start` 不在周一时的情况，且与 `bucketize` 的桶序重复。否决。
- **固定 7 列（周为行）**：与用户选的 GitHub 形状相反（GitHub 是周为列），且列数随区间变化更符合「一段时间」的语义。否决。

---

## R2 五档色阶怎么取

**Decision**：全部由既有 accent token 的不透明度派生，不新增颜色：

| 档 | 件数 | 类名 |
|---|---|---|
| 0 | 0 | `bg-line-soft`（中性，白卡上可见边界） |
| 1 | 1 | `bg-accent/20` |
| 2 | 2–3 | `bg-accent/40` |
| 3 | 4–6 | `bg-accent/65` |
| 4 | ≥7 | `bg-accent` |

**Rationale**：`--color-accent: #b8543a` 在 `--color-card: #ffffff` 上以 20/40/65/100% 叠加，明度差足够分档（相邻档亮度差 15–25%），符合 GitHub 贡献图「同色系四档 + 中性零档」的读法。用 opacity 而不是新色值，是为了不破坏「颜色只用既有语义 token」这条自定约束（FR-016），也让日后换主色时色阶自动跟随。

**Alternatives considered**：
- **新增 4 个 `--color-heat-1..4`**：最省事，但违反 FR-016 与 SC-010 的「0 新 token」，且在深浅色主题切换时需要成对维护。否决。
- **用 `accent-soft` 做低档**：`#faede7` 与白卡对比过低（ΔL < 5%），0 档与 1 档会分不清。否决。
- **五档用五个不同色相**：与「单色系克制」的视觉基调冲突。否决。

---

## R3 「今天」与「峰值」怎么标

**Decision**：
- 今天：`ring-1 ring-ink/55 ring-offset-1 ring-offset-card`（方形外环，与格子同形）。
- 峰值（件数最多的日子，含并列）：格子右上角 4px 圆点 `absolute right-0.5 top-0.5 h-1 w-1 rounded-full bg-ink/55`。
- 图例区各给一个 12px 的示例方块 + 文案（`stats.heatToday` / `stats.heatPeak`）。

**Rationale**：FR-006 与 SC-006 要求「不只靠颜色」。环是外扩的轮廓、点是内部的形状，两者在灰度与色盲模拟下都能与「颜色深浅」区分开；且 14px 格子里仍能容纳。

**Alternatives considered**：
- **今天用加粗描边、峰值用加粗描边**：两个都是描边，色盲下无法区分（SC-006 会挂）。否决。
- **峰值用文字角标（如 `！`）**：14px 格里塞不下，且与 003 柱图的峰值徽标风格不一致。否决。
- **峰值用更深的色阶**：等于把「档位」和「最值」两个信息压在同一个通道上，FR-006 明确禁止。否决。

---

## R4 键盘怎么走

**Decision**：roving tabindex（只有 `activeDate` 那一格 `tabindex=0`，其余 `-1`），顺序 = `heatDatesOf(grid)` 返回的时间升序（列优先）；`← / →` 移动 ±1 天，`↑ / ↓` 移动 ±7 天，`Home / End` 跳到区间首末，`Enter / Space` 交给原生 `<button>` 的 click（不自己处理，避免双触发）。越界时停在边界不循环。

**Rationale**：与 003 柱图完全一致的交互心智（003 已验收 SC-005 用 Tab + ←→ + Enter）。纯函数 `heatMove(dates, current, key)` 让边界行为可断言，不必靠手点。

**Alternatives considered**：
- **全部格子 `tabindex=0`**：90 天档等于 90 个 tab 停靠点，Tab 出面板要按 90 次。否决。
- **方向键循环（末尾回到开头）**：容易误触，且与日历的空间隐喻矛盾。否决。
- **`↑/↓` 按「同星期跨周」实现为 ±7**：等价且更简单，采用。

---

## R5 动效怎么做才「克制」

**Decision**：新增 `.fade-swap { animation: fade-swap 150ms ease-out both }`（只动 opacity，不动位移），由结果容器的 `:key="applied.start + applied.end"` 触发重挂载；悬停/焦点用 `transition-colors duration-100`。同时在 `src/style.css` 追加：

```css
@media (prefers-reduced-motion: reduce) {
  .rise, .sheet-up, .fade-swap { animation: none !important; }
  *, *::before, *::after { transition-duration: 0.01ms !important; }
}
```

**Rationale**：FR-014 要求 150ms（上限 200）且切换时容器高度不变；只动 opacity 就天然不改变布局高度。全局 reduce 规则是标准做法（一次写好，所有浮层受益），也是 FR-015 唯一可靠的实现方式——逐个组件加 `motion-reduce:` 变体迟早漏。

**Alternatives considered**：
- **复用既有 `.rise`（0.22s + 6px 位移）**：220ms 超出 SC-007 的 150±50ms 区间，且位移会造成「整块上浮」的廉价感。否决。
- **逐格/逐柱入场动画**：与 D4 的克制基调冲突，90 天档会让切换显得晃。否决。
- **CSS `@starting-style` + transition**：WebView2 支持情况不稳，且需要给容器一个 `transition-behavior: allow-discrete`；收益不抵风险。否决。

---

## R6 四张指标卡怎么排

**Decision**：`grid grid-cols-2 min-[620px]:grid-cols-4 gap-2`，每张卡 `rounded-xl bg-card px-3 py-2.5`（卡内无阴影，靠背景差与内边距分块，符合 Linear 的「少用边框」）。主数值 `font-display text-[19px] tabular-nums`，标签 `text-[11px] text-ink-faint`，补充说明 `text-[10.5px] leading-4 text-ink-faint`。

**Rationale**：窗口默认 760（内容 712）→ 四张各 ≈168px，同排成立；最小窗宽 520（内容 472）→ `min-[620px]` 不触发，自动 2×2，与 FR-010 的「窄窗口折成 2×2」一致。用 `min-[…]` 任意断点而不是 `sm:`（640px），是因为 640 会让默认窗口也在临界点附近抖动。

**Alternatives considered**：
- **`sm:grid-cols-4`（640px）**：默认窗口 760 能触发，但缩小到 600 时突然折行，视觉跳变大。否决。
- **永远 2×2**：默认窗口下浪费横向空间，且四张卡的信息本可以一眼扫完。否决。
- **横排 + 竖分隔线**：与「不用分隔线建层级」的基调冲突。否决。

---

## R7 为什么不用图表库 / Canvas / SVG

**Decision**：热力图用 CSS Grid + 既有语义色；柱图沿用 003 的 CSS 柱实现。

**Rationale**：
- 数据规模上限是 90 个格子 / 13 根柱子 / 53 根柱子，CSS 足够；
- 图表库（ECharts / Chart.js）最小 gzip 也 >90KB，直接击穿 SC-011（+8 kB）与 SC-010（0 新依赖），并与宪法「栈冻结」冲突；
- Canvas 要自己处理 DPR、主题切换、无障碍（canvas 内的格子无法被 Tab 到），等于把已解决的问题重做一遍；
- SVG 每个格子手写坐标，收益（更细的圆角控制）抵不上维护成本。

**Alternatives considered**：三者均已在上段给出否决理由；另有「用 emoji 色块拼」——不可控且不专业，否决。

---

## 遗留问题

无。所有 Technical Context 的未知项已闭合，规格中的 18 条 FR 均已在上述决策里找到落点。
