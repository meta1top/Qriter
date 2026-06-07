# 设计 token + 暖色主题 + 组件补齐 实现 Plan（地基块 / 设计语言 §12-①）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `@qriter/design` 的主题 token 换成「暖纸文学」色板（light + dark）、注册 serif/sans/mono 字体变量，并补齐布局/agent 后续要用的 10 个组件（Badge / Separator / Skeleton / Avatar / ScrollArea / Tabs / Dialog / Sheet / Toast(Sonner) / Resizable）。

**Architecture:** 纯前端设计系统层，只动 `packages/design`（+ 两个新依赖）。token 改 `src/styles/globals.css` 的 `:root`/`.dark` 变量值（变量名不动，`@theme inline` 映射与现有 `apple/`/`ui/` 组件零改套用）。新组件走 shadcn new-york 风格，从已装的统一包 `radix-ui` 引原语（与现有 `progress.tsx`/`tooltip.tsx` 一致），`cn` 取自 `../../lib/utils`，图标用 `lucide-react`。

**Tech Stack:** React 19 · Tailwind v4（CSS `@theme`，无 config 文件）· radix-ui（统一包）· class-variance-authority · lucide-react · sonner · react-resizable-panels · Biome。

**前置阅读：** 已评审设计 spec `docs/superpowers/specs/2026-06-07-ui-design-language-design.md`（§2 设计语言 = 本 plan 的事实来源）。

**重要：无 jest（`packages/**` 被 jest 排除）。** 每个任务的验证 = `pnpm --filter @qriter/design typecheck` + Biome；最后一个任务做 `pnpm --filter @qriter/web build` 冒烟（确认组件在 Next RSC 下能编译）。不写 jest 单测（无 runner）。

---

## 文件结构

**修改**
- `packages/design/src/styles/globals.css` — `@theme` 增字体变量；`:root`/`.dark` 换暖色板（Task 1/2）
- `packages/design/package.json` — 加 `sonner`、`react-resizable-panels`（Task 3）
- `packages/design/src/index.ts` — 导出新组件（Task 14 统一收口）

**新建**（`packages/design/src/components/ui/`）
- `badge.tsx`、`separator.tsx`、`skeleton.tsx`、`avatar.tsx`、`scroll-area.tsx`、`tabs.tsx`、`dialog.tsx`、`sheet.tsx`、`sonner.tsx`、`resizable.tsx`

---

## Task 1：暖纸文学色板（:root + .dark）

**Files:** Modify `packages/design/src/styles/globals.css`

- [ ] **Step 1: 换 `:root`（light）变量值**

把 `:root { ... }` 整块的颜色变量替换为（保留 `--radius: 0.5rem;` 在最前）：
```css
:root {
  --radius: 0.5rem;
  --background: #f3ece1;
  --foreground: #2b2620;
  --card: #fffefb;
  --card-foreground: #2b2620;
  --popover: #fffefb;
  --popover-foreground: #2b2620;
  --primary: #b5654a;
  --primary-foreground: #fffefb;
  --secondary: #efe6d8;
  --secondary-foreground: #3a332a;
  --muted: #efe6d8;
  --muted-foreground: #9c8f7a;
  --accent: #f0e7dc;
  --accent-foreground: #2b2620;
  --success: #3f6b54;
  --success-foreground: #fffefb;
  --destructive: #c0432f;
  --destructive-foreground: #fffefb;
  --border: #e8ddcb;
  --input: #e8ddcb;
  --ring: #b5654a;
  --chart-1: #b5654a;
  --chart-2: #caa07e;
  --chart-3: #6f7d5e;
  --chart-4: #cba14e;
  --chart-5: #3b5a72;
  --sidebar: #efe6d8;
  --sidebar-foreground: #3a332a;
  --sidebar-primary: #b5654a;
  --sidebar-primary-foreground: #fffefb;
  --sidebar-accent: #e8ddcb;
  --sidebar-accent-foreground: #2b2620;
  --sidebar-border: #e6dccb;
  --sidebar-ring: #b5654a;
}
```

- [ ] **Step 2: 换 `.dark`（暖炭灰）变量值**

把 `.dark { ... }` 整块替换为：
```css
.dark {
  --background: #1c1916;
  --foreground: #ece6dc;
  --card: #24201c;
  --card-foreground: #ece6dc;
  --popover: #24201c;
  --popover-foreground: #ece6dc;
  --primary: #c97a5e;
  --primary-foreground: #1c1916;
  --secondary: #2b2620;
  --secondary-foreground: #ece6dc;
  --muted: #2b2620;
  --muted-foreground: #9a8f7e;
  --accent: #2e2925;
  --accent-foreground: #ece6dc;
  --success: #6f9b80;
  --success-foreground: #1c1916;
  --destructive: #d2664f;
  --destructive-foreground: #1c1916;
  --border: #34302a;
  --input: #34302a;
  --ring: #c97a5e;
  --chart-1: #c97a5e;
  --chart-2: #d3a883;
  --chart-3: #8a9676;
  --chart-4: #d4b06a;
  --chart-5: #6f8aa3;
  --sidebar: #211d19;
  --sidebar-foreground: #d8cfc1;
  --sidebar-primary: #c97a5e;
  --sidebar-primary-foreground: #1c1916;
  --sidebar-accent: #2e2925;
  --sidebar-accent-foreground: #ece6dc;
  --sidebar-border: #34302a;
  --sidebar-ring: #c97a5e;
}
```

- [ ] **Step 3: `@theme inline` 增 success 映射**

在 `@theme inline { ... }` 块内（chart 变量附近）追加两行，让 `bg-success` / `text-success-foreground` 工具类可用：
```css
  --color-success: var(--success);
  --color-success-foreground: var(--success-foreground);
```

- [ ] **Step 4: 验证 + Commit**

Run: `pnpm --filter @qriter/design typecheck`（CSS 改动不影响 ts，但确认无连带破坏）
Expected: 通过。
Run（可选肉眼）：`pnpm --filter @qriter/web dev` 起来看登录页是否变暖底；不便起则跳过，留到 Task 14 build 冒烟。
```bash
git add packages/design/src/styles/globals.css
git commit -m "feat(design): 暖纸文学色板（light + dark token）"
```
> 不要 stage `.claude/settings.json`。

---

## Task 2：字体变量（serif 标题 / sans 正文 / mono）

**Files:** Modify `packages/design/src/styles/globals.css`

- [ ] **Step 1: `@theme inline` 增字体 token**

在 `@theme inline { ... }` 块内追加：
```css
  --font-sans: -apple-system, "SF Pro Text", "PingFang SC", "Microsoft YaHei",
    system-ui, sans-serif;
  --font-serif: "Songti SC", "Noto Serif SC", "Source Han Serif SC", Georgia,
    "Times New Roman", serif;
  --font-mono: "SF Mono", ui-monospace, "JetBrains Mono", monospace;
```
（Tailwind v4 会据此生成 `font-sans` / `font-serif` / `font-mono` 工具类，组件用 `font-serif` 给标题。）

- [ ] **Step 2: base 层把 body 设为 sans**

在 `@layer base { body { ... } }` 内追加一行 `font-family: var(--font-sans);`，使全局正文默认黑体：
```css
  body {
    background-color: var(--background);
    color: var(--foreground);
    font-family: var(--font-sans);
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }
```

- [ ] **Step 3: 验证 + Commit**

Run: `pnpm --filter @qriter/design typecheck`
Expected: 通过。
```bash
git add packages/design/src/styles/globals.css
git commit -m "feat(design): 注册 serif/sans/mono 字体变量，body 默认 sans"
```

---

## Task 3：安装 sonner + react-resizable-panels

**Files:** Modify `packages/design/package.json`

- [ ] **Step 1: 安装**

Run（仓库根）：`pnpm --filter @qriter/design add sonner react-resizable-panels`
Expected: 两者出现在 `packages/design/package.json` 的 `dependencies`，`pnpm-lock.yaml` 更新。

- [ ] **Step 2: Commit**

```bash
git add packages/design/package.json pnpm-lock.yaml
git commit -m "build(design): 添加 sonner + react-resizable-panels"
```

---

## Task 4：Badge

**Files:** Create `packages/design/src/components/ui/badge.tsx`

- [ ] **Step 1: 写组件**

```tsx
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 gap-1 transition-colors overflow-hidden",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        success: "border-transparent bg-success text-success-foreground",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground",
        outline: "text-foreground border-border",
        soft: "border-transparent bg-primary/12 text-primary",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span";
  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
```
> `soft` variant 即 spec 里 `accent-tint` 标签（连载中/草稿）。`@radix-ui/react-slot` 已装。

- [ ] **Step 2: 验证 + Commit**

Run: `pnpm --filter @qriter/design typecheck && pnpm exec biome check packages/design/src/components/ui/badge.tsx`
Expected: 通过 / 无 lint。
```bash
git add packages/design/src/components/ui/badge.tsx
git commit -m "feat(design): Badge 组件（含 soft 标签变体）"
```

---

## Task 5：Separator

**Files:** Create `packages/design/src/components/ui/separator.tsx`

- [ ] **Step 1: 写组件**

```tsx
"use client";

import { Separator as SeparatorPrimitive } from "radix-ui";
import type * as React from "react";

import { cn } from "../../lib/utils";

function Separator({
  className,
  orientation = "horizontal",
  decorative = true,
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      data-slot="separator"
      decorative={decorative}
      orientation={orientation}
      className={cn(
        "bg-border shrink-0 data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px",
        className,
      )}
      {...props}
    />
  );
}

export { Separator };
```

- [ ] **Step 2: 验证 + Commit**

Run: `pnpm --filter @qriter/design typecheck && pnpm exec biome check packages/design/src/components/ui/separator.tsx`
Expected: 通过。
```bash
git add packages/design/src/components/ui/separator.tsx
git commit -m "feat(design): Separator 组件"
```

---

## Task 6：Skeleton

**Files:** Create `packages/design/src/components/ui/skeleton.tsx`

- [ ] **Step 1: 写组件**

```tsx
import type * as React from "react";

import { cn } from "../../lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("bg-muted animate-pulse rounded-md", className)}
      {...props}
    />
  );
}

export { Skeleton };
```

- [ ] **Step 2: 验证 + Commit**

Run: `pnpm --filter @qriter/design typecheck && pnpm exec biome check packages/design/src/components/ui/skeleton.tsx`
Expected: 通过。
```bash
git add packages/design/src/components/ui/skeleton.tsx
git commit -m "feat(design): Skeleton 组件"
```

---

## Task 7：Avatar

**Files:** Create `packages/design/src/components/ui/avatar.tsx`

- [ ] **Step 1: 写组件**

```tsx
"use client";

import { Avatar as AvatarPrimitive } from "radix-ui";
import type * as React from "react";

import { cn } from "../../lib/utils";

function Avatar({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Root>) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn(
        "relative flex size-8 shrink-0 overflow-hidden rounded-full",
        className,
      )}
      {...props}
    />
  );
}

function AvatarImage({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn("aspect-square size-full", className)}
      {...props}
    />
  );
}

function AvatarFallback({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        "bg-muted text-muted-foreground flex size-full items-center justify-center rounded-full text-sm",
        className,
      )}
      {...props}
    />
  );
}

export { Avatar, AvatarImage, AvatarFallback };
```

- [ ] **Step 2: 验证 + Commit**

Run: `pnpm --filter @qriter/design typecheck && pnpm exec biome check packages/design/src/components/ui/avatar.tsx`
Expected: 通过。
```bash
git add packages/design/src/components/ui/avatar.tsx
git commit -m "feat(design): Avatar 组件"
```

---

## Task 8：ScrollArea

**Files:** Create `packages/design/src/components/ui/scroll-area.tsx`

- [ ] **Step 1: 写组件**

```tsx
"use client";

import { ScrollArea as ScrollAreaPrimitive } from "radix-ui";
import type * as React from "react";

import { cn } from "../../lib/utils";

function ScrollArea({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.Root>) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      className={cn("relative", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        className="focus-visible:ring-ring/50 size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px]"
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}

function ScrollBar({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>) {
  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      data-slot="scroll-area-scrollbar"
      orientation={orientation}
      className={cn(
        "flex touch-none p-px transition-colors select-none",
        orientation === "vertical" &&
          "h-full w-2 border-l border-l-transparent",
        orientation === "horizontal" &&
          "h-2 flex-col border-t border-t-transparent",
        className,
      )}
      {...props}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb
        data-slot="scroll-area-thumb"
        className="bg-border relative flex-1 rounded-full"
      />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  );
}

export { ScrollArea, ScrollBar };
```

- [ ] **Step 2: 验证 + Commit**

Run: `pnpm --filter @qriter/design typecheck && pnpm exec biome check packages/design/src/components/ui/scroll-area.tsx`
Expected: 通过。
```bash
git add packages/design/src/components/ui/scroll-area.tsx
git commit -m "feat(design): ScrollArea 组件"
```

---

## Task 9：Tabs

**Files:** Create `packages/design/src/components/ui/tabs.tsx`

- [ ] **Step 1: 写组件**

```tsx
"use client";

import { Tabs as TabsPrimitive } from "radix-ui";
import type * as React from "react";

import { cn } from "../../lib/utils";

function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  );
}

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "bg-muted text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-lg p-[3px]",
        className,
      )}
      {...props}
    />
  );
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "data-[state=active]:bg-card data-[state=active]:text-foreground focus-visible:ring-ring/50 inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2.5 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 data-[state=active]:shadow-sm",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
```

- [ ] **Step 2: 验证 + Commit**

Run: `pnpm --filter @qriter/design typecheck && pnpm exec biome check packages/design/src/components/ui/tabs.tsx`
Expected: 通过。
```bash
git add packages/design/src/components/ui/tabs.tsx
git commit -m "feat(design): Tabs 组件"
```

---

## Task 10：Dialog

**Files:** Create `packages/design/src/components/ui/dialog.tsx`

- [ ] **Step 1: 写组件**

```tsx
"use client";

import { XIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import type * as React from "react";

import { cn } from "../../lib/utils";

function Dialog(props: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger(
  props: React.ComponentProps<typeof DialogPrimitive.Trigger>,
) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal(
  props: React.ComponentProps<typeof DialogPrimitive.Portal>,
) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose(
  props: React.ComponentProps<typeof DialogPrimitive.Close>,
) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/40",
        className,
      )}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "bg-card data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-xl border p-6 shadow-lg duration-200 sm:max-w-lg",
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:pointer-events-none">
          <XIcon className="size-4" />
          <span className="sr-only">关闭</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("font-serif text-lg leading-none font-semibold", className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
```
> 标题用 `font-serif`（贴 spec 的宋体标题）。动画类来自 `tw-animate-css`（已在 web globals 引）。

- [ ] **Step 2: 验证 + Commit**

Run: `pnpm --filter @qriter/design typecheck && pnpm exec biome check packages/design/src/components/ui/dialog.tsx`
Expected: 通过。
```bash
git add packages/design/src/components/ui/dialog.tsx
git commit -m "feat(design): Dialog 组件"
```

---

## Task 11：Sheet（侧滑抽屉）

**Files:** Create `packages/design/src/components/ui/sheet.tsx`

- [ ] **Step 1: 写组件**

```tsx
"use client";

import { XIcon } from "lucide-react";
import { Dialog as SheetPrimitive } from "radix-ui";
import type * as React from "react";

import { cn } from "../../lib/utils";

function Sheet(props: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger(
  props: React.ComponentProps<typeof SheetPrimitive.Trigger>,
) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose(props: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetContent({
  className,
  children,
  side = "right",
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: "top" | "right" | "bottom" | "left";
}) {
  return (
    <SheetPrimitive.Portal data-slot="sheet-portal">
      <SheetPrimitive.Overlay
        data-slot="sheet-overlay"
        className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/40"
      />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          "bg-card data-[state=open]:animate-in data-[state=closed]:animate-out fixed z-50 flex flex-col gap-4 shadow-lg transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500",
          side === "right" &&
            "data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm",
          side === "left" &&
            "data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm",
          side === "top" &&
            "data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top inset-x-0 top-0 h-auto border-b",
          side === "bottom" &&
            "data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom inset-x-0 bottom-0 h-auto border-t",
          className,
        )}
        {...props}
      >
        {children}
        <SheetPrimitive.Close className="ring-offset-background focus:ring-ring absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:pointer-events-none">
          <XIcon className="size-4" />
          <span className="sr-only">关闭</span>
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-1.5 p-4", className)}
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  );
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("text-foreground font-serif font-semibold", className)}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
```
> Sheet 用 radix Dialog 原语 + side 变体（agent 抽屉/移动端章节栏会用）。

- [ ] **Step 2: 验证 + Commit**

Run: `pnpm --filter @qriter/design typecheck && pnpm exec biome check packages/design/src/components/ui/sheet.tsx`
Expected: 通过。
```bash
git add packages/design/src/components/ui/sheet.tsx
git commit -m "feat(design): Sheet 侧滑抽屉组件"
```

---

## Task 12：Toast（Sonner）

**Files:** Create `packages/design/src/components/ui/sonner.tsx`

- [ ] **Step 1: 写组件**

```tsx
"use client";

import { Toaster as Sonner, type ToasterProps, toast } from "sonner";

function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="system"
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
}

export { Toaster, toast };
```
> 直接用 sonner 的 `theme="system"` 跟随明暗；用 CSS 变量套暖色 token。`toast` 函数透出供业务调用。

- [ ] **Step 2: 验证 + Commit**

Run: `pnpm --filter @qriter/design typecheck && pnpm exec biome check packages/design/src/components/ui/sonner.tsx`
Expected: 通过（若 `React.CSSProperties` 报未导入，在顶部加 `import type * as React from "react";`）。
```bash
git add packages/design/src/components/ui/sonner.tsx
git commit -m "feat(design): Toaster + toast（sonner）"
```

---

## Task 13：Resizable（工作台分栏）

**Files:** Create `packages/design/src/components/ui/resizable.tsx`

- [ ] **Step 1: 写组件**

```tsx
"use client";

import { GripVerticalIcon } from "lucide-react";
import type * as React from "react";
import * as ResizablePrimitive from "react-resizable-panels";

import { cn } from "../../lib/utils";

function ResizablePanelGroup({
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.PanelGroup>) {
  return (
    <ResizablePrimitive.PanelGroup
      data-slot="resizable-panel-group"
      className={cn(
        "flex h-full w-full data-[panel-group-direction=vertical]:flex-col",
        className,
      )}
      {...props}
    />
  );
}

function ResizablePanel(
  props: React.ComponentProps<typeof ResizablePrimitive.Panel>,
) {
  return <ResizablePrimitive.Panel data-slot="resizable-panel" {...props} />;
}

function ResizableHandle({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.PanelResizeHandle> & {
  withHandle?: boolean;
}) {
  return (
    <ResizablePrimitive.PanelResizeHandle
      data-slot="resizable-handle"
      className={cn(
        "bg-border focus-visible:ring-ring relative flex w-px items-center justify-center after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:ring-1 focus-visible:outline-none data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full data-[panel-group-direction=vertical]:after:left-0 data-[panel-group-direction=vertical]:after:h-1 data-[panel-group-direction=vertical]:after:w-full data-[panel-group-direction=vertical]:after:translate-x-0 data-[panel-group-direction=vertical]:after:-translate-y-1/2",
        className,
      )}
      {...props}
    >
      {withHandle && (
        <div className="bg-border z-10 flex h-4 w-3 items-center justify-center rounded-xs border">
          <GripVerticalIcon className="size-2.5" />
        </div>
      )}
    </ResizablePrimitive.PanelResizeHandle>
  );
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
```

- [ ] **Step 2: 验证 + Commit**

Run: `pnpm --filter @qriter/design typecheck && pnpm exec biome check packages/design/src/components/ui/resizable.tsx`
Expected: 通过。
```bash
git add packages/design/src/components/ui/resizable.tsx
git commit -m "feat(design): Resizable 分栏组件"
```

---

## Task 14：导出收口 + 全量验证

**Files:** Modify `packages/design/src/index.ts`

- [ ] **Step 1: 追加导出**

在 `packages/design/src/index.ts` 末尾（`export * from "./hooks";` 之前的组件区）追加：
```ts
export { Avatar, AvatarFallback, AvatarImage } from "./components/ui/avatar";
export { Badge, badgeVariants } from "./components/ui/badge";
export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "./components/ui/dialog";
export {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "./components/ui/resizable";
export { ScrollArea, ScrollBar } from "./components/ui/scroll-area";
export { Separator } from "./components/ui/separator";
export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./components/ui/sheet";
export { Skeleton } from "./components/ui/skeleton";
export { toast, Toaster } from "./components/ui/sonner";
export {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "./components/ui/tabs";
```

- [ ] **Step 2: 全量类型检查**

Run: `pnpm typecheck`
Expected: 全包通过（含 @qriter/design、@qriter/web）。

- [ ] **Step 3: 格式化**

Run: `pnpm check:format`
Expected: 自动修复 import 排序/格式；无残留报错。

- [ ] **Step 4: Next 构建冒烟（关键：确认组件在 RSC 下能编译）**

Run: `pnpm --filter @qriter/web build`
Expected: 构建成功（新组件被 transpilePackages 纳入；`"use client"` 指令正确，无 RSC 报错）。
> 若某组件报「需要 client」: 确认该文件首行有 `"use client"`（除 Badge/Skeleton 纯展示外都应有）。

- [ ] **Step 5: Commit**

```bash
git add packages/design/src/index.ts
git commit -m "feat(design): 导出 10 个补齐组件（Badge/Separator/Skeleton/Avatar/ScrollArea/Tabs/Dialog/Sheet/Toaster/Resizable）"
```

---

## 自检（spec §2 覆盖对照）

- §2.1 light 色板 → Task 1 ✅；§2.2 dark → Task 1 ✅；§2.3 字体变量 → Task 2 ✅
- §2.4 圆角/间距/阴影：沿用现有 `--radius` token + 组件内 Tailwind 类，无单独 token 任务（设计 spec 未要求新 radius 标度）✅
- §2.5 组件补齐：Dialog(T10)/Sheet(T11)/Tabs(T9)/Avatar(T7)/ScrollArea(T8)/Skeleton(T6)/Toast(T12)/Resizable(T13)/Badge(T4)/Separator(T5) ✅；Tooltip/DropdownMenu/Form 已存在
- **不在本 plan**（§12 后续块）：app-shell 布局组件、路由组鉴权门、agent dock、书架/工作台/统计/设置页 —— 那些属布局块，依赖本块产物。
- 验证现实：`packages/**` 无 jest，故以 `typecheck` + Biome + `apps/web build` 冒烟为门，不写 jest 单测（诚实标注）。
- 类型一致性：组件均 shadcn new-york 标准签名，`radix-ui` 统一包引法与现有 `progress.tsx`/`tooltip.tsx` 一致；index 导出名与各文件 `export` 对齐。
