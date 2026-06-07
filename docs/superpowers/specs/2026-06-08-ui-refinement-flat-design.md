# Qriter UI 精致化 —— 扁平暖纸精修 设计 Spec

- 日期：2026-06-08
- 状态：已评审（视觉 companion 逐维确认），待拆实现 plan
- 关系：**精修 / 修订** `docs/superpowers/specs/2026-06-07-ui-design-language-design.md`（暖纸文学设计语言）。色板 / 字体家族 / 信息架构沿用；本 spec 在其上把「执行做精致」，并**修订其阴影方向**（原 §2.4 的「3 级暖色阴影」→ 现 **纯扁平·零阴影**）。
- 范围：`packages/design`（token + 组件）与 `apps/web`（书架 / 书卡 / 登录前 / 顶栏 / 弹窗 / 各页）的视觉精修。不含新业务功能。
- 气质定调：**精修的扁平**（refined flat / minimal warm）—— 干净、克制、像 Linear/Notion 那种「flat 但贵」，靠排版、间距、色调阶梯、发丝描边出精致，**不靠阴影 / 渐变 / 纸纹**。

## 0. 起因

实现后的 UI「整体不够精致、很粗糙」。经视觉 companion 把「精致」拆成 6 个维度逐维确认，结论汇总如下。核心方向修正：用户**只要扁平**（否掉了拟物的纸纹 / 渐变 / 厚阴影）。

## 1. 字体排版（① 采纳）

字体家族不变（宋体标题 `--font-serif` + 黑体正文 `--font-sans`）。动「层级与节奏」：

- **字阶拉开**，建立刻意的模块化阶梯（示例值，落地时定为 token）：
  - eyebrow/caption 10–10.5（大写间距 letter-spacing ~2–2.5px、`text-transform:uppercase`、`muted`）
  - 区块标题（如「我的书架」）serif 20–21 / 600 / letter-spacing ~1px
  - 书名 serif 18 / 600 / letter-spacing ~1–1.5px
  - 正文 sans 15.5–16 / 行高 1.9 / 限字宽 ~30em（写作阅读体验权重高）
  - 元信息 caption sans 10.5–11 / `muted` / **等宽数字 `font-variant-numeric:tabular-nums`**
- **衬线标题**：适度加字距；区块标题下可加一条**发丝分隔线**；顶部可置 **eyebrow 小标**（大写间距）。
- 字重对比：display/标题 serif 600 ↔ 正文 sans 400 ↔ 元信息 muted。

## 2. 间距节奏（② 采纳）

- 统一 **8pt 阶梯**：`4 / 8 / 12 / 16 / 24 / 32 / 48`（落为 spacing token / 约定）。
- 放宽呼吸：页边距 24→40、区块标题与内容 24→32、卡间距 16→24、卡内距 16→22。
- 网格列更宽、留白更足、列数随屏自适应（`minmax`）。

## 3. 色彩 · 质感 · 阴影（③ 采纳：纯扁平）

**这是对 2026-06-07 spec §2.4 的修订。** 不再用阴影 / 渐变 / 纸纹表达层次，改用：

- **零阴影**：卡、面板默认无 `box-shadow`。
- **色调阶梯分层**（层级靠底色深浅，不靠投影）：
  - 页底略压暗（示例 `#f1eae0`，比原 `#f3ece1` 沉一档，让白卡更跳）
  - 二级面 / 输入区 / 侧栏：暖灰（示例 `#f6f0e6`）
  - 卡面 / 主面：近纯白（示例 `#fffdf8`）
- **发丝描边**统一收细、对齐像素（示例 `#e6dabf`；扁平靠边框立形）。
- **浮层（弹窗 / 下拉）**：用**背景 dim 遮罩**（`--overlay`，示例 `rgba(28,25,22,.45)`）与主面区分，**不用投影**。
- 落地：在 `packages/design/src/styles/globals.css` 调 `:root`/`.dark` —— 引入「页底 / 二级面 / 卡面」三档色调 + 收细 border；移除组件默认 shadow（或将 shadow token 置空/极弱）。dark 同理给三档暖炭灰阶梯。

## 4. 书卡 · 封面（④ 采纳，v6）

书架核心单元 = **大封面前置的书墙**：

- **封面**：2:3 竖图，承载 **AI 生成的封面图**（真实图片）。较小、一行多本（示例 7 列、`minmax` 自适应，窄屏降列）。圆角 4 + 一道极淡内描边（`inset 0 0 0 1px rgba(0,0,0,.08–.1)`）定边，**无投影**。
- **书名**：真文字（**非** AI 烫进图里）、**衬线、竖排**（`writing-mode:vertical-rl`）、从封面**右上角**起、留足边距（示例 top 13 / right 12）；顶部一道**渐变 scrim**（`linear-gradient(180deg, rgba(22,15,9,.5), transparent)` 覆盖上 ~50%）+ `text-shadow`，保证压在任何图上可读；色 `#fbf3e6`，字距 ~3px。
- **元信息**（封面下方）：状态 · 章节，字号加大（~10.5px），**状态点变色** —— 草稿灰 `#b39a78` / 写作中陶土 `#b5654a` / 完结墨绿 `#3f6b54`。
- **无封面回退**：平涂陶土色块（`--primary`）+ 同款竖排右上书名 +「封面生成中…」小字。
- **＋新建**：一张 2:3 虚线占位卡；点开建书。
- **悬停**（见 §6）：封面微提亮 + 陶土发丝环 + 右上 ⋯ 操作入口淡入，**不位移、无投影**。
- **依赖（下游，非本 spec）**：AI 封面生成 + `Book.coverUrl` 字段是单独事项。本 spec 定**显示**：`BookCard` 接受可选 `coverUrl`，有图显示图、无图走回退。字段一落地即接。

## 5. 组件细节（⑤ 采纳）

`@qriter/design` 组件调到贴合扁平暖纸：

- **输入框**：`#fffdf8` 底 + 发丝边（`#e6dabf`）+ 圆角 8 + 略高（h ~40）；聚焦 → border 换陶土 `#b5654a` + **3px 暖色环** `box-shadow:0 0 0 3px rgba(181,101,74,.15)`（替代默认偏冷的环）；placeholder `muted`。
- **按钮**：主钮陶土实底 `#b5654a` + 字距 + 圆角 8，hover → `#a4543b`；描边钮更暖更细的边（`#ddccab`），hover → 暖色淡底 `rgba(181,101,74,.07)`；ghost hover 极淡暖底。全部无阴影。
- **状态标签 Badge**：胶囊（radius full）+ **dot + 文字**、按状态变色（灰/陶土/墨绿三套 tint），不再一律灰底。
- **弹窗 Dialog**：dim 遮罩 + 扁平面（`#fffdf8` + 发丝边）+ 衬线标题，无投影。
- **下拉 DropdownMenu**：发丝边 + hover 暖色淡底；菜单浮层同样 dim/扁平（不靠厚阴影）。

## 6. 微交互 · 动效（⑥ 采纳 A + 骨架规则）

克制：无浮夸 / 弹跳，不靠阴影位移，统一 **150–180ms ease-out**，尊重 `prefers-reduced-motion`。

- **书卡悬停**：封面 `filter:brightness(1.06)` + 陶土发丝环（`inset 0 0 0 1px rgba(181,101,74,.55)`）+ ⋯ 淡入；**不 translate、无投影**。
- **按钮**：仅颜色过渡 150ms。**输入**：陶土聚焦环（§5，键盘可见、无障碍）。
- **弹窗**：dim 淡入 + 面板 fade + 微缩放（.98→1）180ms。**下拉/菜单**：fade + 2px 位移淡入。
- **加载规则（重要）**：**所有「数据 loading」一律用骨架图**（书架网格、书详情、统计、设置、任何内容拉取）—— 暖色 shimmer 骨架（`linear-gradient` 横移），真图/真数据就绪后**淡入**替换。**spinner 仅用于动作态**（如「登录中 / 提交中」按钮内联），**不用于内容加载**。
- **toast**（sonner）：自下淡入。

## 7. 影响面（落地参考）

**`packages/design`**
- `src/styles/globals.css`：三档色调阶梯（页底/二级面/卡面）+ 收细 border + 移除默认 shadow（flat）+ 字阶/字距/行高约定 + spacing 8pt + 聚焦环 token + `--overlay`。
- 组件：`input` / `button`（apple + ui）/ `badge`（dot + 状态变色）/ `dialog`（dim+扁平）/ `dropdown-menu` / `skeleton`（暖 shimmer）/ `sonner` 精修。

**`apps/web`**
- `components/app/book-card.tsx`：**重设计**（封面前置 + coverUrl/回退 + 竖排右上书名 + scrim + 状态点 + 悬停）。
- `components/app/book-grid.tsx`：列数自适应放宽、间距 8pt、**loading → 骨架封面网格**（替代当前 Skeleton 矩形，做成 2:3 封面骨架）。
- `components/app/{top-bar,account-menu}.tsx`、`app/(app)/page.tsx`（书架：eyebrow + 发丝线 + 间距）。
- `components/auth/brand-panel.tsx` + `app/(auth)/login`、`auth/google`：套精修字体/间距/组件（split-brand 保留）。
- 弹窗（book-form / book-delete）：套扁平 Dialog + 组件精修。
- 各 stub 页（books/[id]、stats、settings）：套字体/间距精修；数据态用骨架。
- 全站把「内容 loading」改骨架；spinner 仅留动作态。

## 8. 实现拆分建议（writing-plans 时定）

两块自然边界，可一份 plan 串行、或两份：
- **A · 设计系统精修**（`packages/design`）：token（色调阶梯/字阶/间距/聚焦环/overlay/flat）+ 组件（input/button/badge/dialog/dropdown/skeleton/toaster）。地基，先行。
- **B · 应用层精修**（`apps/web`）：BookCard 重设计 + BookGrid 骨架/列数 + 顶栏/书架/登录前/弹窗/各页套用 + loading 骨架化。依赖 A。

## 9. 非目标 / 下游

- AI 封面**生成**功能 + `Book.coverUrl` 字段（本 spec 只定**显示** + 回退）。
- 工作台编辑器、AgentDock（属原 §12 block ④⑤，未实现）。
- 新业务逻辑 / 接口。
- 文案 i18n 沿用既有约定（精修若新增可见串走 key）。

## 10. 成功标准

- 全站统一为「精修扁平暖纸」：零阴影、色调阶梯分层、发丝描边、8pt 间距、刻意字阶。
- 书架是「大封面书墙」：AI 封面 + 竖排右上书名 + 状态点；无封面优雅回退。
- 组件（输入/按钮/标签/弹窗/下拉）贴合扁平暖纸，聚焦态暖色环、无障碍可见。
- 动效克制统一（150–180ms）；**所有数据加载走骨架**，spinner 仅动作态。
- `pnpm --filter @qriter/web build` 通过；设计系统改动不破坏既有 `apple/`/`ui/` 组件套用。
