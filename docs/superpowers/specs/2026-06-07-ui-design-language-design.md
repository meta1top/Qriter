# Qriter UI 设计语言 + 布局系统 — 设计 Spec

- 日期：2026-06-07
- 状态：已评审（视觉 companion 逐屏确认），待拆实现 plan
- 范围：qriter 前端（`apps/web` + `@qriter/design`）的**视觉设计语言**（色彩 / 字体 / 间距 / 圆角 / 暗色 / 组件补齐）与**布局系统**（登录前布局、登录后 app shell、信息架构、SSR 鉴权门、全局页面感知 agent 聊天）。这是一份**设计/布局 spec**，不含编辑器引擎选型、agent 图逻辑、书/章 CRUD 接口（均为下游单独事项，见 §11）。

## 1. 设计目标

一套**精致、适合写作 / 创作 / 文档**的 UI。气质取向「暖纸文学（Literary Warm）」：米白纸感暖底 + 陶土赤褐点缀 + 宋体衬线标题，兼顾书卷气与现代可读性。整套基调在视觉 companion 中逐屏选定（方向 B / 陶土赤褐 / 宋体标题+黑体正文 / 左导航+悬浮 agent / 书架→工作台两级 / 登录前品牌左表单右 / agent overlay）。

## 2. 设计语言

### 2.1 色板（light）

| 角色 | 值 | 用途 |
|------|----|------|
| `background` | `#f3ece1` | 页底（暖米白纸） |
| `card` / `surface` | `#fffefb` | 卡面 / 编辑器 canvas |
| `foreground` | `#2b2620` | 标题墨字 |
| `text-body` | `#3a332a` | 正文 |
| `muted-foreground` | `#9c8f7a` | 弱化文字 / 元信息 |
| `border` | `#e8ddcb` | 主描边 |
| `border-soft` | `#ece1cf` / `#e6dccb` | 卡 / 分隔 |
| `primary`（陶土赤褐） | `#b5654a` | 主按钮 / 激活态 / 链接 |
| `primary-foreground` | `#fffefb` | 主色上文字 |
| `accent-text` | `#a4543b` | 浅底上的点缀文字 |
| `accent-tint` | `rgba(181,101,74,.12)` | 标签 / chip 底 |
| `secondary`（墨绿） | `#3f6b54`（深 `#2f6b4f`） | 上下文/在线点、成功态、第二点缀 |
| `ring` | `#b5654a` | 焦点环 |
| `sidebar` | `#efe6d8` | 工作台左栏 / 暖 rail |
| `sidebar-border` | `#e6dccb` | |
| `chart-1..5` | 暖系（赤褐/陶土/沙金/墨绿/黛蓝） | 统计图表 |

### 2.2 色板（dark，暖炭灰，非纯黑）

| 角色 | 值 |
|------|----|
| `background` | `#1c1916` |
| `card` / `surface` | `#24201c` |
| `foreground` | `#ece6dc` |
| `text-body` | `#d8cfc1` |
| `muted-foreground` | `#9a8f7e` |
| `border` | `#34302a` |
| `primary` | `#c97a5e`（暗底略提亮） |
| `primary-foreground` | `#1c1916` |
| `accent-tint` | `rgba(201,122,94,.16)` |
| `secondary` | `#6f9b80` |
| `sidebar` | `#211d19` |

> 落地：替换 `packages/design/src/styles/globals.css` 的 `:root` / `.dark` CSS 变量为上表（保留现有 `@theme inline` 变量名映射，使 `apple/` 组件零改动套用新色）。现有无闪烁主题脚本（`themeScript`）继续用。

### 2.3 字体

- `--font-serif`：`"Songti SC","Noto Serif SC","Source Han Serif SC",Georgia,"Times New Roman",serif` —— 标题、书名、品牌、章节标题、编辑性大标。
- `--font-sans`：`-apple-system,"SF Pro Text","PingFang SC","Microsoft YaHei",system-ui,sans-serif` —— 正文、UI、控件、编辑器正文。
- `--font-mono`：`"SF Mono",ui-monospace,"JetBrains Mono",monospace` —— 字数/代码等。
- 类型阶梯（serif=S / sans=N）：display 28/600 S · h1 22/600 S · h2 18/600 S · h3 15/600 N · body 14–16/1.8–1.9 N · small 12 N · caption 10.5 大写间距 N。
- **编辑器正文**：sans，16px，行高 1.9，舒适字宽（max-width ~36em 居中），段距宽松。

### 2.4 圆角 / 间距 / 阴影 / 动效

- 圆角：沿用现有 token 阶梯（base `0.5rem`）。卡 lg ~`0.75rem`、按钮 md、chip/标签 full。
- 间距：8pt 网格。
- 阴影：3 级暖色低透阴影（`rgba(120,90,40,.06/.10/.18)`）；悬浮 agent 面板用最高级。
- 动效：150–200ms ease；agent 悬浮↔停靠过渡、面板展开/收起；页面切换克制无花哨。

### 2.5 组件清单

- **已有**（`@qriter/design`）：Button、Card、Input、Select、Alert、DropdownMenu、Form、Label、Progress、Tooltip。
- **需补**：Dialog、Sheet/Drawer、Tabs、Avatar、ScrollArea、Skeleton、Toast（Sonner）、Resizable（工作台分栏）、Badge/Tag、Separator、Command（搜书，可选）。
- **应用级**（`apps/web`）：`AppShell`、`TopBar`、`AccountMenu`、`BrandPanel`(auth)、`BookGrid`/`BookCard`、`ChapterNav`、`EditorCanvas`、`AgentDock`（含 `AgentLauncher` 悬浮球 + `AgentPanel`）。

## 3. 信息架构（两级）

- **书架（登录后首页 `/`）** —— 列出所有书。选一本 → 进入工作台。
- **工作台（`/books/[id]`）** —— 每本书的深层模式（章节 + 编辑器 + agent 右栏）。**与书架不同级**，由选书进入、可返回。
- **全局**：`统计 /stats`、`模型设置 /settings/model`、`账号设置 /settings/account` —— 收进**右上账号菜单**，无全局左栏。

## 4. 鉴权门：SSR 路由组（替换客户端 AuthGuard）

把现有客户端 `AuthGuard`（profile react-query 门）改为 **App Router 路由组 + 服务端组件 SSR 门**，服务端权威、无闪烁：

- `app/(auth)/layout.tsx`（server component）：读 `qriter_token` cookie → 服务端 `fetch(${NEST_INTERNAL_URL}/api/auth/profile, { Authorization: Bearer })` → **拿到 profile 则 `redirect("/")`**；否则渲染品牌-split chrome + children。承载 `(auth)/login`、`(auth)/auth/google`（回调）。
- `app/(app)/layout.tsx`（server component）：同样 SSR 取 profile → **无 profile 则 `redirect("/login")`**；有则渲染 shell（顶栏 + 内容 slot + 挂 `AgentDock`），并把 user 经 context 提供给客户端。承载 `(app)/`（书架）、`(app)/books/[id]`（工作台）、`(app)/stats`、`(app)/settings/*`。
- 服务端组件用 `cookies()` 可读 httpOnly cookie，故 SSR 取 profile 成立。现有客户端 `AuthGuard` 移除（或降级为极薄兜底）。现有 `apps/web/src/app/{login,auth/google}/` 迁入 `(auth)/`，`page.tsx` 首页迁入 `(app)/`。

> 与本会话已落地的 cookie + proxy 鉴权一致：cookie 仍 httpOnly，profile 经同一 Nest 端点。

## 5. 登录前布局（`(auth)`）

- **品牌左 + 表单右**（split）：
  - 左 ~44%：暖渐变品牌墙（`#efe6d8 → #caa07e → #b5654a`），「Qriter」大宋体 + 文学 slogan（如「落笔之前，先与 agent 聊聊。」）。
  - 右：表单卡（邮箱 / 密码 + 「登录」陶土主按钮 + 「使用 Google 登录」描边按钮）。
- `(auth)/layout` = 品牌墙 + 右侧 slot（共享 chrome）；`login` / `auth/google` 渲染进右侧。
- **Google 回调态**：`(auth)/auth/google` 复用同布局，右侧换「登录中…」转圈；换码成功 → `router.replace("/")`（写 cookie 由既有 route handler 负责）。
- 移动端：品牌墙收为顶部窄条，表单占主。

## 6. 登录后 shell（`(app)`）

### 6.1 书架（`/`）

- **顶栏**：左「Qriter」衬线品牌；中/右「搜书…」+ 右上**头像账号菜单**（统计 / 模型设置 / 账号设置 / 退出，DropdownMenu）。
- **内容**：`BookGrid` —— 自适应书卡网格。`BookCard`：书脊渐变封面 + 衬线书名 + 元信息（章数 · 字数）+ 状态标签（连载中/草稿/完结，`accent-tint` chip）+ 行内操作（开书 / 编辑 / 统计）。含「＋ 新建书籍」虚线卡。
- **悬浮 agent**：右下陶土悬浮球 ✦（见 §7）。

### 6.2 工作台（`/books/[id]`）

- **顶栏**：`‹ 书架`（返回）+ 书名（衬线）+ 当前章。
- **三栏**（`Resizable`）：
  - 左 `ChapterNav`：本书章节列表（激活态陶土）+「＋ 新章」。
  - 中 `EditorCanvas`：暖纸 canvas，衬线章节标题 + 黑体正文，居中舒适字宽（§2.3）。
  - 右 `AgentDock`：agent 停靠态（见 §7）。
- 编辑器引擎选型不在本 spec（§11）。

## 7. Agent 聊天（页面感知 + 悬浮↔停靠）

单一全局 `AgentDock`（挂在 `(app)/layout`），随路由切换形态：

- **收起**：右下陶土悬浮球 ✦，全局在场。
- **非工作台页（书架/统计…）展开**：**悬浮 overlay 面板**（右下、浮于内容上，不挤内容）。头部上下文 chip（`● 书架`，墨绿点）+ 页面快捷动作 chips（书架：开新书 / 看统计 / 整理书架）+ 消息流 + 输入。
- **工作台**：agent **停靠成右栏**（悬浮球"落位"为 docked 面板）。上下文 chip（`● 第一章`）+ 快捷动作（续写 / 改写选段 / 取名 / 设定）+ 输入。
- **页面感知**：当前路由 + 路由实体（书 id / 章节 / 选中文本）作为上下文传给 agent，使其优先相应操作；快捷动作按页面 keyed（书架级 vs 工作台级 vs 选段级）。
- 形态切换有 150–200ms 过渡。

## 8. 暗色

全站支持 §2.2 暖炭灰暗色；沿用现有无闪烁主题脚本。品牌墙暗色用更深暖渐变。图表色暗色微调保对比。

## 9. 响应式

桌面优先（写作工具）。断点收窄：工作台三栏 → 章节栏可收起为抽屉、agent 由停靠回落为悬浮；书架网格列数自适应；登录前品牌墙收顶部窄条。

## 10. 成功标准

- 全站套用暖纸文学 token（light+dark），`apple/` 组件零改套用。
- 登录前/后均 SSR 鉴权门，无登录态闪烁。
- 书架→工作台两级跑通，全局设置在账号菜单。
- agent 全局在场、页面感知、悬浮↔停靠形态切换顺滑。

## 11. 非目标 / 下游事项

- **编辑器引擎选型**（TipTap / Lexical / ProseMirror）—— 工作台落地时单独决策；本 spec 只定 canvas 视觉与排版。
- agent 图/工具逻辑、WS 流式接线（已有 ws-ticket 基建）。
- 书 / 章 / 统计的后端接口与数据真实化。
- i18n 文案（沿用既有 next-intl 约定，所有可见串走 key）。

## 12. 实现拆分建议（后续各自 spec→plan）

1. **设计 token + 主题**（暖色 light/dark）+ 组件补齐（Dialog/Sheet/Tabs/Avatar/ScrollArea/Skeleton/Toast/Resizable/Badge）。
2. **鉴权门路由组**（SSR `(auth)`/`(app)`）+ 登录前品牌-split 布局（迁移 login/callback，移除客户端 AuthGuard）。
3. **登录后 shell**（TopBar + AccountMenu + 书架 home + BookGrid/BookCard）。
4. **工作台布局**（`books/[id]`：ChapterNav + EditorCanvas 壳 + AgentDock 区）—— 编辑器引擎 TBD。
5. **AgentDock**（悬浮↔停靠、页面感知快捷动作、上下文接线）。
6. **统计 + 设置页**。
