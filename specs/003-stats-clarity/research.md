# Research: 复盘面板的可读性重做

Phase 0 产出。每条给出**决定 / 理由 / 备选方案**，并落到具体数值，避免实现期二次决策。

---

## R1 时间分布的图形形态 → CSS 竖柱 + 绝对定位刻度线

- **决定**：用 flex 容器画竖柱（每桶一个 `<button>`，高度按 `count / maxCount` 的百分比），叠加 3 条绝对定位的横向刻度线（0 / 中值 / 最大值），柱宽 `flex-1`、间距 1px，容器高 96px（`h-24`）。0 件桶渲染 2px 的 `bg-line` 底线，非 0 桶最小高度 4px。
- **理由**：桶数最多 90（天桶），最少 13（月桶），这个密度用布局而不是坐标绘制就够；百分比高度让窄窗口自适应，不需要 `ResizeObserver`；颜色/圆角全部复用既有 token（`bg-accent/70`、`bg-accent/20`、`border-line-soft`），满足 SC-011 的「新增颜色 token 0 个」。刻度数字用既有 `text-[11px]`，不新增字号档。
- **备选**：
  - 内联 SVG：需要手算坐标、文本度量随字体变化，且交互（hover/focus）仍要自己写，等于把复杂度翻倍而收益为零。
  - 图表库（Chart.js/ECharts）：违反宪法 III 与「栈冻结」，且 SC-010 要求依赖 diff 为 0。
  - 保持横条（现状 `h-[6px]`）：30 根等高细条读不出形状，正是本次要修的问题。
  - 迷你折线：0 值会被折线连成「谷底」而误导为「那天效率低」，且 90 点折线在 96px 高度内不可辨。

## R2 悬停提示 → 自绘提示框（受控位置 + 键盘同源）

- **决定**：在图形容器内渲染一个绝对定位的 `<div>`，内容 = 「起止日期 / 件数 / 占比」三段。位置默认在柱子上方居中，超出容器左右边界时按 `clamp` 收进边界；同一时刻只显示一个（`hoveredKey` 与 `focusedKey` 合并为一个 `activeKey`，focus 优先）。
- **理由**：原生 `title` 有约 1 秒延迟、样式不可控、键盘不可达、在 WebView2 里位置随机，无法满足 SC-003（逐桶都能读到三段信息）与 FR-006。自绘框 20 行代码即可，且可同时承担 `aria-label` 的视觉呈现。
- **备选**：原生 `title`（达不到验收标准）；`<details>` 展开（会改变布局高度，破坏「图高度固定」）；第三方 popover（新依赖）。

## R3 下钻状态归属 → 组件内 `ref<Filter | null>`

- **决定**：筛选状态是 `StatsSheet.vue` 内的一个 `ref`，类型 `{ key: string; start: string; end: string; label: string }`。在四个时机重置：`load()` 成功后、`pickPreset()`、`onEdit()`（改日期）、应用自定义区间时。点同一桶 = 取消。
- **理由**：只有这一个组件用得到，且 spec 明确要求「刷新/重开回到默认、不持久化」（数据影响段）。放 store 会顺带引入「跨面板残留筛选」的 bug 面。
- **备选**：Pinia store（跨组件共享，但无人消费）；持久化到 `meta`（违反 0 写入与宪法 II）；URL query（桌面应用无路由）。

## R4 明细分组与折叠默认值 → 最近 5 天展开、组内 10 条

- **决定**：明细按 `doneAt.slice(0, 10)` 分组，组按日期倒序；默认展开**最近 5 个有数据的组**（spec D4 允许 3–7，取 5），其余折叠成一个「还有 N 天」按钮；组内超过 10 条时折叠为「展开其余 N 条」。展开状态用 `Set<string>` + 一个「已展开其余组」布尔。
- **理由**：与「最近发生了什么」的使用情境一致，首屏 DOM 规模可控（5 组 × 10 条 = 50 行）；200 条明细的区间不会一次性铺满。
- **备选**：全部展开（滚动长度失控，正是现状问题）；全部折叠（用户要多点一次才能看到任何条目）；虚拟滚动（新依赖，且 200 条不需要）。

## R5 结论句的拼装位置 → 纯函数给结构，组件按 key 拼文本

- **决定**：`stats.ts` 新增 `conclusionOf(view)`，返回结构化对象
  `{ done: number; compare: { state: "up"|"down"|"flat"|"none"; delta: number }; peak: { date: string; count: number } | null; gapDays: number }`。
  组件用 6 个 key 与一个连接符 key 拼成一句：主句 + `stats.conclusionJoin`（zh「，」/ en `"; "`）+ 节奏分句。
- **理由**：中英句式不同（「比上一段多 12 件」 vs `"12 more than the previous stretch"`），把整句塞进 i18n 就会产生 4 种比较态 × 2 种节奏态 × 2 种语言 = 16 条 key；结构化后每段一条 key，加语言只是加一列。纯函数也让 SC-002 的自洽性可以被脚本断言。
- **备选**：整句 key（key 爆炸、易漏）；在组件里直接 `if` 拼中文（违反宪法 V，且 en 会漂移）。

## R6 键盘与焦点 → 柱子用 roving tabindex，而非 90 次 Tab

- **决定**：
  - 面板内原生可聚焦元素（预设按钮、日期输入、关闭按钮、折叠按钮、脚注开关）照常 Tab。
  - 图形容器内**只有一根柱子** `tabindex="0"`（`activeBarIndex`），其余 `tabindex="-1"`；`ArrowLeft` / `ArrowRight` / `Home` / `End` 移动焦点，`Enter` / `Space` 触发下钻。进入图形时默认焦点在「最大值桶」或第一个非 0 桶。
  - focus 环统一定义为组件内常量 `focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-1 focus-visible:ring-offset-card"`，所有可聚焦元素引用它（新增样式 token 0 个，符合 SC-011）。
  - 打开面板后 `nextTick` 把焦点放到第一个预设按钮；Esc 由 `App.vue` 既有分支关闭（本 feature 不改）。
- **理由**：90 根柱各占一个 Tab 位是糟糕的可访问性实践；roving tabindex 是图形列表的标准做法，也让 SC-006「仅键盘完成下钻」变得可达。
- **备选**：全部 `tabindex="0"`（Tab 陷阱感）；`tabindex="-1"` 全集（键盘用户无法进入图形）；`aria-activedescendant` 列表模式（需额外维护 id 映射，收益不明显）。

## R7 稀疏分档判据 → 四档，按优先级短路

- **决定**：`sparsityOf(view)` 返回 `"none" | "undatedOnly" | "one" | "few" | "ok"`，优先级从高到低：
  1. `none`：`doneTotal === 0 && undated === 0`
  2. `undatedOnly`：`doneTotal === 0 && undated > 0`（该区间只有未标注完成时刻的记录）
  3. `one`：`doneTotal === 1`
  4. `few`：`doneTotal > 1` 但「有数据的天数」< 3
  5. `ok`：其余
  推后区为空的提示复用既有 `stats.rolledEmpty`（不新增 key）。
- **理由**：这四种是用户真实会遇到的状态，且每种都需要不同的「下一步动作」提示；把 `history.emptyTitle` 借来用（002 的做法）正是「粗糙」的一部分（spec FR-010 明令禁止）。
- **备选**：只做「空/非空」两档（少了引导价值）；按件数连续分档（文案维护成本高，收益低）。

## R8 性能预算与实现约束

- **决定**：渲染节点上限 = 90 个柱子 + 5 组展开（≤ 50 行）；所有派生值用 `computed`（`view` / `groups` / `filteredDone` / `active`），模板内不做计算，不引入 `watch` 链；不新增 `setTimeout`/`requestAnimationFrame` 节流（无用）。
- **理由**：002 实测端到端约 30 ms（SQL 6.0 ms + 聚合 8.3 ms + 其余），SC-008 允许 +100 ms；本 feature 的增量主要是多算一次分组与结论，O(entries) 级别，不会成为瓶颈。
- **备选**：虚拟列表（新依赖 + 复杂度）；Web Worker（跨线程序列化成本更大）。

## R9 视觉一致性约束

- **决定**：只使用既有 token：`bg-paper` / `bg-card` / `bg-paper-deep` / `text-ink` / `text-ink-soft` / `text-ink-faint` / `border-line` / `border-line-soft` / `bg-accent`（含 `/70`、`/40`、`/20` 透明度）/ `bg-accent-soft` / `text-accent` / `bg-warn-soft` / `text-warn`；字号只用 `text-[11px]`、`text-[11.5px]`、`text-[13px]`、`text-[19px]`、`text-[26px]` 这 5 档（刻度用 11px）。
- **理由**：SC-011 要求新增颜色 token 为 0、字号种类 ≤ 5；与「记录」面板并排放置时不能像两个产品。
- **备选**：为图表引入一套语义色（如 `chart-1/2/3`）——会破坏 002 已建立的单一强调色（`accent` = 「做过的事」），且需要改 `src/style.css`。

---

## 未解决项

无。spec 的 `NEEDS CLARIFICATION` 为 0，本阶段也未产生新的技术未决项；`quickstart.md` 用演示库（`verify/seed_demo.py`，248 条）覆盖 SC-001…SC-009，SC-010/SC-011 由 `git diff` 与 token 清单静态核验。
