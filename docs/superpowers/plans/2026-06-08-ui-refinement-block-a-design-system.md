# UI 精致化 · Block A（设计系统精修）实现 Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `@qriter/design` 的 token 与基础组件调成「精修扁平暖纸」—— 色调阶梯、纯扁平零阴影、圆角化、暖色聚焦环、暖 shimmer 骨架。

**Architecture:** 改 `packages/design/src/styles/globals.css`（色调 token + shimmer keyframe）+ 7 个组件 className（input/button/badge/dialog/dropdown/skeleton/sonner）。组件被 `apps/web` 以**源码**消费（exports 指 src + transpilePackages），故验证靠 `pnpm --filter @qriter/design typecheck` + `pnpm --filter @qriter/web build`（无 jest）。

**Tech Stack:** Tailwind v4（`@theme inline` + CSS 变量）· cva · radix-ui · sonner。

**前置 spec：** `docs/superpowers/specs/2026-06-08-ui-refinement-flat-design.md`（§3 色彩质感、§5 组件、§6 动效骨架）。这是 Block A；Block B（apps/web 应用层）依赖本块落地后再出 plan。

**关键约定：**
- **绝不** `git add .claude/settings.json`。逐文件 add。
- 当前分支 main —— 执行时先开 feature 分支（subagent-driven-development 会处理）。
- 缩进 2 空格、双引号（Biome）；commit 用 conventional commits（type 英文 / body 中文），结尾带 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`。
- 改的是「精修」，**保持现有组件 API / 导出不变**，只动 className / token / 动画。`apple/` 与 `ui/` 组件继续被业务零改套用。

---

## 文件结构

- Modify `packages/design/src/styles/globals.css` — 色调阶梯 token（light/dark）+ shimmer keyframe/utility
- Modify `packages/design/src/components/ui/skeleton.tsx` — 暖 shimmer 替代 pulse
- Modify `packages/design/src/components/apple/input.tsx` — 圆角 + 3px 暖聚焦环
- Modify `packages/design/src/components/ui/button.tsx` — 去 shadow（扁平）
- Modify `packages/design/src/components/apple/button.tsx` — 圆角
- Modify `packages/design/src/components/ui/badge.tsx` — 胶囊（rounded-full）
- Modify `packages/design/src/components/ui/dialog.tsx` — 去 shadow-lg（扁平）
- Modify `packages/design/src/components/ui/dropdown-menu.tsx` — 去 shadow + 圆角 + 暖 hover
- Modify `packages/design/src/components/ui/sonner.tsx` — 扁平 toast（去默认阴影变量）

---

## Task 1：globals.css —— 色调阶梯 token + shimmer

**Files:** Modify `packages/design/src/styles/globals.css`

§3 色调阶梯：页底略压暗、卡面近纯白、发丝边收细暖化（layer 用底色深浅区分，不靠投影）。§6：骨架用暖 shimmer。

- [ ] **Step 1: 改 light 三档色调 + 发丝边**

把 `:root` 内这三个值改掉（其余不动）：
```css
  --background: #f1eae0;   /* 原 #f3ece1：页底略压暗一档，让白卡更跳 */
  --card: #fffdf8;         /* 原 #fffefb：卡面近纯白、略暖 */
  --popover: #fffdf8;      /* 原 #fffefb：与 card 同步 */
```
并把边框收细暖化：
```css
  --border: #e6dabf;       /* 原 #e8ddcb：发丝边收细暖化 */
  --input: #e6dabf;        /* 原 #e8ddcb：与 border 同步 */
```
> 二级面（输入区/侧栏）沿用既有 `--secondary`/`--muted`/`--sidebar`（#efe6d8 一档），三档阶梯即「页底 #f1eae0 → 二级面 #efe6d8/#f6f0e6 系 → 卡面 #fffdf8」。本 task 不新增 token，避免牵动过多组件。

- [ ] **Step 2: dark 同步收细边（保持暖炭灰）**

`.dark` 内边框略收细（其余不动）：
```css
  --border: #322e28;       /* 原 #34302a：暗色发丝边略收细 */
  --input: #322e28;        /* 原 #34302a */
```

- [ ] **Step 3: 加 shimmer keyframe + utility（暖色微光骨架）**

在文件**末尾**（`@layer base { … }` 之后）追加：
```css
@keyframes qr-shimmer {
  0% {
    background-position: -150% 0;
  }
  100% {
    background-position: 150% 0;
  }
}

@utility skeleton-shimmer {
  background-image: linear-gradient(
    100deg,
    color-mix(in oklab, var(--muted) 70%, var(--card)) 30%,
    color-mix(in oklab, var(--card) 92%, white) 50%,
    color-mix(in oklab, var(--muted) 70%, var(--card)) 70%
  );
  background-size: 220% 100%;
  animation: qr-shimmer 1.5s ease-in-out infinite;
}
```
> Tailwind v4 的 `@utility` 定义一个可被 `className` 直接用的工具类 `skeleton-shimmer`（Task 2 用）。暖色取自 `--muted`/`--card`，自动适配 light/dark。

- [ ] **Step 4: 验证 + Commit**

Run: `pnpm --filter @qriter/design typecheck`
Expected: 通过（CSS 改动不影响 TS；此步主要确认包可编译）。
```bash
git add packages/design/src/styles/globals.css
git commit -m "feat(design): 色调阶梯 token（页底压暗/卡面纯白/发丝边收细）+ 暖 shimmer 工具类

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2：Skeleton —— 暖 shimmer 替代 pulse

**Files:** Modify `packages/design/src/components/ui/skeleton.tsx`

§6：数据 loading 全走骨架；骨架用暖色 shimmer（横移），不用灰 pulse。

- [ ] **Step 1: 换 className**

把当前：
```tsx
className={cn("bg-muted animate-pulse rounded-md", className)}
```
改为（用 Task 1 的 `skeleton-shimmer` 工具类，圆角默认收敛到 `rounded-md`，调用方可覆盖成 `rounded` 等）：
```tsx
className={cn("skeleton-shimmer rounded-md", className)}
```
> 去掉 `bg-muted animate-pulse`（被 shimmer 取代）。`data-slot="skeleton"` 不动。

- [ ] **Step 2: 验证 + Commit**

Run: `pnpm --filter @qriter/design typecheck`
Expected: 通过。
```bash
git add packages/design/src/components/ui/skeleton.tsx
git commit -m "feat(design): Skeleton 改暖色 shimmer（替代灰 pulse）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3：Input —— 圆角 + 3px 暖聚焦环

**Files:** Modify `packages/design/src/components/apple/input.tsx`

§5：发丝边 + 圆角 8 + 聚焦换陶土暖色 + 3px 暖环（替代当前 2px /25 环）。

- [ ] **Step 1: 改 className**

`apple/input.tsx` 的 `className` 当前为（一行）：
```
"h-10 rounded-none border-input bg-card text-[14px] shadow-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground/75 hover:border-muted-foreground/40 focus-visible:border-primary/70 focus-visible:ring-2 focus-visible:ring-ring/25 focus-visible:ring-offset-0 aria-invalid:border-destructive aria-invalid:bg-destructive/5 aria-invalid:focus-visible:border-destructive aria-invalid:focus-visible:ring-destructive/20"
```
改为（`rounded-none → rounded-lg`，聚焦 `ring-2 ring-ring/25 → ring-[3px] ring-primary/15`，边框聚焦提到 `primary`）：
```
"h-10 rounded-lg border-input bg-card text-[14px] shadow-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground/70 hover:border-muted-foreground/40 focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/15 focus-visible:ring-offset-0 aria-invalid:border-destructive aria-invalid:bg-destructive/5 aria-invalid:focus-visible:border-destructive aria-invalid:focus-visible:ring-destructive/20"
```

- [ ] **Step 2: 验证 + Commit**

Run: `pnpm --filter @qriter/design typecheck`
Expected: 通过。
```bash
git add packages/design/src/components/apple/input.tsx
git commit -m "feat(design): Input 圆角化 + 陶土 3px 暖聚焦环

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4：Button —— 去 shadow（扁平）+ 圆角

**Files:** Modify `packages/design/src/components/ui/button.tsx`、`packages/design/src/components/apple/button.tsx`

§3/§5：纯扁平（按钮去阴影）；圆角化。

- [ ] **Step 1: ui/button 变体去 shadow**

`ui/button.tsx` 的 `buttonVariants` 各 variant 去掉 `shadow` / `shadow-sm`，hover 暖化：
```ts
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary/90 dark:bg-secondary dark:text-secondary-foreground dark:hover:bg-secondary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-input bg-transparent hover:bg-primary/[0.07] hover:border-muted-foreground/40",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-primary/[0.07] hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
```
> 仅去 `shadow*` + outline 改透明底/暖 hover + ghost 暖 hover。其余结构不动。base 串里的 `rounded-none` 与 `size` 里的 `rounded-none` 保持（apple wrapper 会覆盖成圆角；ui 直用场景维持方角即可）。

- [ ] **Step 2: apple/button 圆角**

`apple/button.tsx` 的 `className` 把 `rounded-none → rounded-lg`：
```
"h-10 rounded-lg px-4 text-[14px] font-semibold tracking-[0.01em] transition-[filter,box-shadow,background-color] duration-150 ease-out focus-visible:ring-2 focus-visible:ring-ring/35 focus-visible:ring-offset-0 active:brightness-95"
```

- [ ] **Step 3: 验证 + Commit**

Run: `pnpm --filter @qriter/design typecheck`
Expected: 通过。
```bash
git add packages/design/src/components/ui/button.tsx packages/design/src/components/apple/button.tsx
git commit -m "feat(design): Button 去阴影扁平化 + 圆角 + 暖 hover

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5：Badge —— 胶囊化（状态标签）

**Files:** Modify `packages/design/src/components/ui/badge.tsx`

§5：状态标签胶囊（dot + 文字在调用处组合，本组件给胶囊底）。

- [ ] **Step 1: rounded-md → rounded-full**

`badgeVariants` 第一参（base）把 `rounded-md` 改 `rounded-full`，并把 `px-2 py-0.5` 放宽一点点：
```ts
const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full border px-2.5 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 gap-1 transition-colors overflow-hidden",
```
其余 variants（含 `soft`）不动。
> 状态点（dot）+ 按状态变色（草稿灰/写作中陶土/完结墨绿）在 Block B 的 BookCard 调用处用 `soft`/自定义 className 组合，不在本组件写死。

- [ ] **Step 2: 验证 + Commit**

Run: `pnpm --filter @qriter/design typecheck`
Expected: 通过。
```bash
git add packages/design/src/components/ui/badge.tsx
git commit -m "feat(design): Badge 胶囊化（rounded-full）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6：Dialog —— 去 shadow-lg（扁平 + dim 遮罩）

**Files:** Modify `packages/design/src/components/ui/dialog.tsx`

§3/§5：弹窗扁平面 + dim 遮罩区分（不用厚投影）。Overlay 已用 `bg-overlay`（`--overlay`），只需去面板阴影。

- [ ] **Step 1: DialogContent 去 shadow-lg**

`DialogContent` 的 className 里把 `shadow-lg` 删掉（其余动画/布局不动）：当前包含
```
... rounded-xl border p-6 shadow-lg duration-200 sm:max-w-lg
```
改为
```
... rounded-xl border p-6 duration-200 sm:max-w-lg
```
> 面板靠 `bg-card`（纯白卡面）+ `border`（发丝边）+ 背景 `bg-overlay` dim 立起来，无投影。`DialogTitle` 已是 `font-serif`，符合精修。

- [ ] **Step 2: 验证 + Commit**

Run: `pnpm --filter @qriter/design typecheck`
Expected: 通过。
```bash
git add packages/design/src/components/ui/dialog.tsx
git commit -m "feat(design): Dialog 去面板阴影（扁平 + dim 遮罩）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7：DropdownMenu —— 去 shadow + 圆角 + 暖 hover

**Files:** Modify `packages/design/src/components/ui/dropdown-menu.tsx`

§5：下拉发丝边 + hover 暖色淡底；扁平（去 shadow）+ 圆角。

- [ ] **Step 1: Content / SubContent 去 shadow + 圆角**

`DropdownMenuContent` 与 `DropdownMenuSubContent` 两处 className 完全相同的片段：
```
"z-50 min-w-[8rem] overflow-hidden rounded-none border border-border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-in ..."
```
把 `rounded-none → rounded-lg`、删 `shadow-md`（两处都改）：
```
"z-50 min-w-[8rem] overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground data-[state=open]:animate-in ..."
```
> 浮层靠发丝边 `border-border` 立形（扁平，无投影）。

- [ ] **Step 2: 各 Item 圆角 + 暖 hover**

`DropdownMenuItem` / `DropdownMenuCheckboxItem` / `DropdownMenuRadioItem` / `DropdownMenuSubTrigger` 里把 `rounded-none → rounded-md`，并把 `focus:bg-accent` 暖化为 `focus:bg-primary/[0.08]`（`focus:text-accent-foreground` 保留 → 改 `focus:text-foreground`）。例如 `DropdownMenuItem`：
```
"relative flex cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none transition-colors focus:bg-primary/[0.08] focus:text-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
```
`destructive` 分支不动（`focus:bg-destructive focus:text-destructive-foreground`）。其余三个 item 同理把 `rounded-none → rounded-md`、`focus:bg-accent → focus:bg-primary/[0.08]`、`focus:text-accent-foreground → focus:text-foreground`。`SubTrigger` 的 `data-[state=open]:bg-accent` 也同步改 `data-[state=open]:bg-primary/[0.08]`。

- [ ] **Step 3: 验证 + Commit**

Run: `pnpm --filter @qriter/design typecheck`
Expected: 通过。
```bash
git add packages/design/src/components/ui/dropdown-menu.tsx
git commit -m "feat(design): DropdownMenu 扁平（去阴影）+ 圆角 + 暖色 hover

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8：Sonner —— 扁平 toast

**Files:** Modify `packages/design/src/components/ui/sonner.tsx`

§5/§6：toast 扁平（发丝边 + 卡面，不用厚阴影），自下淡入（sonner 默认动画即可）。

- [ ] **Step 1: 用卡面 token + 关阴影**

把 `style` 的 CSS 变量改为卡面/发丝边，并显式压低阴影：
```tsx
      style={
        {
          "--normal-bg": "var(--card)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "0.625rem",
        } as React.CSSProperties
      }
```
并给组件加 `toastOptions` 关掉默认 box-shadow（保持扁平）：在 `<Sonner ... />` 上加
```tsx
      toastOptions={{ style: { boxShadow: "none" } }}
```
> sonner 自身有进出场动画（自下淡入），无需额外配置。

- [ ] **Step 2: 验证 + Commit**

Run: `pnpm --filter @qriter/design typecheck`
Expected: 通过。
```bash
git add packages/design/src/components/ui/sonner.tsx
git commit -m "feat(design): Toaster 扁平化（卡面 + 发丝边 + 去阴影）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9：集成冒烟（web build）+ 收尾

**Files:** —（验证）

设计组件被 `apps/web` 以源码消费，web build 即集成冒烟。

- [ ] **Step 1: 全量 typecheck + 围栏 + 格式**

Run: `pnpm typecheck && pnpm check:format`
Expected: 全包类型通过；Biome 无残留（若 check:format 改了空白/排序，纳入收尾 commit）。

- [ ] **Step 2: web build 冒烟（验证 design 源码在 Next 下编译 + 新 token/工具类生效）**

Run: `pnpm --filter @qriter/web build`
Expected: `next build` 成功（含 `skeleton-shimmer` 工具类、改后的组件类名编译通过）。
> 若 build 报 `.next` 缓存损坏类错误（adapterFn/missing export），`rm -rf apps/web/.next` 后重跑。

- [ ] **Step 3: 收尾 Commit（若 check:format 有改动）**

```bash
git add -u packages/design
git commit -m "chore(design): 精修格式化收尾

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## 自检（spec 覆盖对照）

- §3 色调阶梯（页底压暗 / 卡面纯白 / 发丝边收细）+ 纯扁平零阴影：Task 1（token）+ Task 4/6/7/8（去各组件 shadow）✅
- §3 浮层 dim 遮罩：Dialog overlay 已 `bg-overlay`，Task 6 去面板阴影 ✅；下拉靠发丝边（无 dim，Task 7 扁平）✅
- §5 输入暖色 3px 聚焦环 + 圆角：Task 3 ✅
- §5 按钮陶土实底 + 暖 hover + 圆角 + 扁平：Task 4 ✅
- §5 状态标签胶囊：Task 5 ✅（dot/变色在 Block B 调用处组合）
- §5 弹窗扁平 + 衬线标题：Task 6 ✅（标题已 font-serif）
- §5 下拉发丝边 + 暖 hover + 扁平：Task 7 ✅
- §6 数据 loading 骨架 = 暖 shimmer：Task 1（keyframe/utility）+ Task 2（Skeleton）✅；toast 扁平：Task 8 ✅
- §1 字阶 / §2 8pt 间距：**属应用层用法（Block B）**，本块不动 token（Tailwind 默认 spacing 已 8pt 兼容）—— 见 Block B。

> 边界：字体字阶、间距节奏、BookCard 重设计、骨架在各页的接入、登录前/书架/弹窗的套用都在 **Block B（apps/web）**，本块只交付「设计系统地基」。Block B 在本块合入后另出 plan（届时 BookCard 等引用本块的圆角/聚焦环/badge/skeleton 真实形态）。
