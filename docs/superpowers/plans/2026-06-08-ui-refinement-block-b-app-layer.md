# UI 精致化 · Block B（应用层精修）实现 Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `apps/web` 各面套上「精修扁平暖纸」—— 书架改大封面书墙（BookCard 重设计 + 封面骨架）、字阶/8pt 间距/eyebrow+发丝线落到各页、所有数据 loading 改暖 shimmer 骨架。

**Architecture:** 纯前端表现层改造，复用已合入 main 的 Block A 设计系统（圆角组件、暖聚焦环、扁平 dialog/dropdown/select、胶囊 badge、暖 shimmer `Skeleton`）。`apps/web` 无 jest，验证靠 `pnpm --filter @qriter/web typecheck` + `pnpm --filter @qriter/web build`。

**Tech Stack:** Next.js 16（App Router）· Tailwind v4 工具类 · next-intl · @qriter/design。

**前置 spec：** `docs/superpowers/specs/2026-06-08-ui-refinement-flat-design.md`（§1 字阶 / §2 8pt / §4 书卡封面 / §6 骨架）。Block A 已在 main。

**关键约定：**
- **绝不** `git add .claude/settings.json`。当前分支 main —— 执行时先开 feature 分支（subagent-driven 会处理）。
- 缩进 2 空格、双引号；commit conventional（type 英文 / body 中文）+ `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`。
- **所有用户可见串走 next-intl key，禁裸串**（i18n-page 约定）；新增 key 改 `apps/web/messages/{zh,en}.json` 两侧，`pnpm sync:locales -- --check` 必过。
- `Book` 类型**无 `coverUrl` 字段**（AI 封面生成 + 字段是下游非目标）。BookCard 通过**前向兼容 cast** 读取 `coverUrl`：有则显示图、无则平涂回退。字段一落地即生效，无需改 schema / books.ts。
- 字阶 / 8pt 是**用法层**（Tailwind 工具类），不再动 design token。

---

## 文件结构

- Modify `apps/web/src/lib/book-spine.tsx` — 渐变书脊色 → 平涂封面色（扁平）
- Modify `apps/web/src/components/app/book-card.tsx` — **重设计**：大封面 2:3 + coverUrl/回退 + 竖排右上书名 + scrim + 状态点 + 悬停
- Modify `apps/web/src/components/app/book-grid.tsx` — 列数自适应 + 封面骨架 + 2:3 新建卡 + 空态
- Modify `apps/web/src/app/(app)/page.tsx` — 书架页 eyebrow + 发丝线 + 字阶 + 8pt
- Modify `apps/web/messages/zh.json` / `apps/web/messages/en.json` — `shelf.eyebrow`
- Modify `apps/web/src/components/app/top-bar.tsx` — 品牌标记 + 间距
- Modify `apps/web/src/components/app/account-menu.tsx` — 头像暖底
- Modify `apps/web/src/app/(auth)/login/page.tsx`、`apps/web/src/components/auth/brand-panel.tsx` — 登录前字阶/间距精修
- Modify `apps/web/src/app/(app)/books/[id]/page.tsx`、`stats/page.tsx`、`settings/model/page.tsx`、`settings/account/page.tsx` — 字阶/间距 + 工作台 stub 数据骨架

---

## Task 1：book-spine —— 平涂封面色（扁平）

**Files:** Modify `apps/web/src/lib/book-spine.tsx`

§4 回退封面是平涂色块（不要渐变，扁平）。把 `bookSpineColor`（返回 `linear-gradient`）改为 `bookCoverColor`（返回平涂 `hsl`），暖区确定性取色。

- [ ] **Step 1: 重写文件**

```tsx
/**
 * 按书名确定性生成「平涂封面底色」（无封面图时的回退色块）。
 * 暖纸文学色域内取色（陶土→沙金暖区），同名同色；纯扁平、无渐变。
 */
export function bookCoverColor(title: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = (hash * 31 + title.charCodeAt(i)) >>> 0;
  }
  // 色相限定 18°(赤褐)~42°(沙金) 暖区，避免冷色破坏暖纸基调
  const hue = 18 + (hash % 24);
  return `hsl(${hue} 44% 52%)`;
}
```
> 函数从 `bookSpineColor` 重命名为 `bookCoverColor`（唯一引用方是 BookCard，Task 2 一并改导入）。

- [ ] **Step 2: 暂不 commit（与 Task 2 同一 commit）**

改完先**不要 commit**：此刻 `book-card.tsx` 仍 import 旧 `bookSpineColor`，单独 commit 会让 typecheck 红。本文件与 Task 2 的 `book-card.tsx` **一起在 Task 2 提交**（那时 typecheck 绿）。直接进 Task 2。

---

## Task 2：BookCard 重设计（大封面书墙单元）

**Files:** Modify `apps/web/src/components/app/book-card.tsx`

§4：2:3 大封面前置；可选 coverUrl（有图显示 / 无图平涂回退）；真文字衬线竖排书名从右上角起 + 顶部 scrim；状态点变色；元信息加大；悬停封面微提亮 + 陶土发丝环 + ⋯ 淡入（不位移、无投影）。

- [ ] **Step 1: 整文件重写**

```tsx
"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@qriter/design";
import type { Book, BookStatus } from "@qriter/types";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { bookCoverColor } from "@/lib/book-spine";

/** Book 可能带下游 AI 生成的封面图 URL（字段尚未进 schema，前向兼容读取）。 */
type BookWithCover = Book & { coverUrl?: string | null };

/** 状态点颜色：草稿暖灰 / 写作中陶土 / 完结墨绿。 */
const STATUS_DOT: Record<BookStatus, string> = {
  draft: "#b39a78",
  writing: "var(--primary)",
  done: "var(--success)",
};

/** 把 ISO 时间转成「N 天前」类相对文案（zh/en 由 locale 决定）。 */
function relativeTime(iso: string, locale: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const mins = Math.round(diffMs / 60000);
  if (Math.abs(mins) < 60) return rtf.format(mins, "minute");
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, "hour");
  return rtf.format(Math.round(hours / 24), "day");
}

/** 单本书 = 一张 2:3 封面（图或平涂回退）+ 竖排右上书名 + 下方状态点·时间。 */
export function BookCard({
  book,
  locale,
  onEdit,
  onDelete,
}: {
  book: Book;
  locale: string;
  onEdit: (book: Book) => void;
  onDelete: (book: Book) => void;
}) {
  const router = useRouter();
  const t = useTranslations("book");
  const coverUrl = (book as BookWithCover).coverUrl ?? undefined;
  const goWorkspace = () => router.push(`/books/${book.id}`);

  return (
    <div className="group flex flex-col gap-2.5">
      {/* 封面：2:3，整块可点；扁平（发丝内描边，无投影），悬停微提亮 + 陶土环 */}
      <div
        role="button"
        tabIndex={0}
        aria-label={book.title}
        onClick={goWorkspace}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            goWorkspace();
          }
        }}
        className="relative aspect-[2/3] cursor-pointer overflow-hidden rounded-[4px] ring-1 ring-black/10 transition duration-150 group-hover:ring-primary/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {coverUrl ? (
          // biome-ignore lint/performance/noImgElement: 书封为任意外链/动态 URL，不走 next/image 优化管线
          <img
            src={coverUrl}
            alt=""
            className="h-full w-full object-cover transition duration-150 group-hover:brightness-[1.06]"
          />
        ) : (
          <div
            className="h-full w-full transition duration-150 group-hover:brightness-[1.06]"
            style={{ background: bookCoverColor(book.title) }}
          />
        )}

        {/* 顶部渐变 scrim：保证竖排书名压在任何图上可读 */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-black/45 to-transparent" />

        {/* 竖排书名：从右上角起 */}
        <div className="pointer-events-none absolute top-3 right-3 max-h-[84%] overflow-hidden font-serif text-[15px] font-semibold tracking-[3px] text-[#fbf3e6] [writing-mode:vertical-rl] [text-shadow:0_1px_4px_rgba(0,0,0,0.55)]">
          {book.title}
        </div>

        {/* ⋯ 操作菜单（左上，hover/focus 显） */}
        <div className="absolute top-1.5 left-1.5 opacity-0 transition duration-150 group-hover:opacity-100 focus-within:opacity-100">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={t("bookActions", { title: book.title })}
                onClick={(e) => e.stopPropagation()}
                className="rounded-md px-1.5 text-[16px] leading-none text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]"
              >
                ⋯
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              onClick={(e) => e.stopPropagation()}
            >
              <DropdownMenuItem onSelect={() => onEdit(book)}>
                {t("edit")}
              </DropdownMenuItem>
              <DropdownMenuItem destructive onSelect={() => onDelete(book)}>
                {t("delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* 封面下方：状态点 + 状态 · 相对时间（元信息加大） */}
      <div className="flex items-center gap-1.5 px-0.5 text-[11px] text-muted-foreground">
        <span
          className="size-1.5 shrink-0 rounded-full"
          style={{ background: STATUS_DOT[book.status] }}
          aria-hidden
        />
        <span>{t(`status.${book.status}`)}</span>
        <span aria-hidden>·</span>
        <span className="tabular-nums">
          {relativeTime(book.updatedAt, locale)}
        </span>
      </div>
    </div>
  );
}
```
> 变化要点：横向卡 → 竖封面墙单元；`bookSpineColor`→`bookCoverColor`；书名竖排右上 + scrim；状态点按 `STATUS_DOT`；去 `shadow-sm/hover:shadow-md`（扁平）；悬停 brightness + `ring-primary/55`。`Badge` 不再用（状态改 dot+文字），故去掉 `Badge` import。简介不在卡上显示（封面墙）。

- [ ] **Step 2: 类型检查 + Commit**

Run: `pnpm --filter @qriter/web typecheck`
Expected: 通过（`bookCoverColor` 已由 Task 1 提供；`Badge`/`bookSpineColor`/`tShelf` 未再引用，无残留）。
```bash
# 与 Task 1 的 book-spine.tsx 一起提交，保证此 commit typecheck 绿
git add apps/web/src/lib/book-spine.tsx apps/web/src/components/app/book-card.tsx
git commit -m "feat(web): BookCard 重设计为大封面书墙（2:3 + coverUrl/回退 + 竖排右上书名 + 状态点）+ 平涂封面色

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3：BookGrid —— 封面网格 + 封面骨架 + 新建卡

**Files:** Modify `apps/web/src/components/app/book-grid.tsx`

§2/§4/§6：列数自适应放宽（封面更窄→更多列）、8pt 间距、loading 改 2:3 封面骨架（暖 shimmer）、新建卡改 2:3。

- [ ] **Step 1: 改 GRID_CLASS + 骨架 + 新建卡**

把 `GRID_CLASS` 改为封面网格（minmax 150px 多列、行距更松）：
```tsx
/** 自适应封面网格：窄封面多列，8pt 行列距（骨架与列表共用）。 */
const GRID_CLASS =
  "grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-5 gap-y-7";
```

loading 分支改 2:3 封面骨架（`Skeleton` 已是暖 shimmer）：
```tsx
  if (isLoading) {
    return (
      <div className={GRID_CLASS}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex flex-col gap-2.5">
            <Skeleton className="aspect-[2/3] rounded-[4px]" />
            <Skeleton className="h-3 w-2/3 rounded-full" />
          </div>
        ))}
      </div>
    );
  }
```

列表里的「新建书籍」卡改 2:3 虚线占位（与封面同形）：
```tsx
          <button
            type="button"
            onClick={openCreate}
            className="flex aspect-[2/3] flex-col items-center justify-center gap-2 rounded-[4px] border-2 border-dashed border-border text-muted-foreground transition hover:border-primary hover:text-primary"
          >
            <span className="text-2xl font-light">＋</span>
            <span className="text-xs">{t("newBook")}</span>
          </button>
```
> `BookCard` 调用、空态、弹窗编排不变。空态按钮已是 `rounded-lg bg-primary`（Block A 后视觉一致），保留。

- [ ] **Step 2: 类型检查 + Commit**

Run: `pnpm --filter @qriter/web typecheck`
Expected: 通过。
```bash
git add apps/web/src/components/app/book-grid.tsx
git commit -m "feat(web): BookGrid 封面网格 + 2:3 封面骨架（暖 shimmer）+ 2:3 新建卡

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4：书架页 eyebrow + 发丝线 + 字阶 + 8pt

**Files:** Modify `apps/web/src/app/(app)/page.tsx`、`apps/web/messages/zh.json`、`apps/web/messages/en.json`

§1/§2：eyebrow 小标（大写间距）+ 标题下发丝线 + 拉开字阶 + 放宽间距、容器更宽（容多列封面）。

- [ ] **Step 1: i18n 加 `shelf.eyebrow`**

`apps/web/messages/zh.json` 的 `shelf` 节点加：`"eyebrow": "书架"`。
`apps/web/messages/en.json` 的 `shelf` 节点加：`"eyebrow": "Bookshelf"`（CSS `uppercase` 渲染）。

- [ ] **Step 2: 重写书架页**

```tsx
"use client";

import { useTranslations } from "next-intl";
import { BookGrid } from "@/components/app/book-grid";

/** 登录后首页 = 书架。 */
export default function ShelfPage() {
  const t = useTranslations("shelf");
  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <div className="mb-8 border-b border-border/70 pb-4">
        <div className="mb-1.5 text-[10px] font-semibold tracking-[2.5px] text-muted-foreground/80 uppercase">
          {t("eyebrow")}
        </div>
        <h1 className="font-serif text-[26px] font-semibold tracking-[0.5px] text-foreground">
          {t("title")}
        </h1>
      </div>
      <BookGrid />
    </div>
  );
}
```

- [ ] **Step 3: 校验 + 类型 + Commit**

Run: `pnpm sync:locales -- --check && pnpm --filter @qriter/web typecheck`
Expected: i18n 对齐；类型通过。
```bash
git add "apps/web/src/app/(app)/page.tsx" apps/web/messages/zh.json apps/web/messages/en.json
git commit -m "feat(web): 书架页 eyebrow + 发丝线 + 字阶/8pt 精修

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5：TopBar + AccountMenu 精修

**Files:** Modify `apps/web/src/components/app/top-bar.tsx`、`apps/web/src/components/app/account-menu.tsx`

§5：顶栏加品牌小标记 + 字距 + 8pt 边距；头像暖底。

- [ ] **Step 1: TopBar**

```tsx
import Link from "next/link";
import { AccountMenu } from "./account-menu";

/** 登录后顶栏：左品牌标记 + 宋体品牌（回书架）+ 右账号菜单。 */
export function TopBar() {
  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-card px-8">
      <Link href="/" className="flex items-center gap-2">
        <span className="size-2 rounded-[2px] bg-primary" aria-hidden />
        <span className="font-serif text-xl font-semibold tracking-[0.5px] text-foreground">
          Qriter
        </span>
      </Link>
      <AccountMenu />
    </header>
  );
}
```

- [ ] **Step 2: AccountMenu 头像暖底**

把 `AvatarFallback` 加暖底 className（其余不动）：
```tsx
          <Avatar>
            <AvatarFallback className="bg-secondary text-[13px] font-medium text-secondary-foreground">
              {initial}
            </AvatarFallback>
          </Avatar>
```

- [ ] **Step 3: 类型 + Commit**

Run: `pnpm --filter @qriter/web typecheck`
Expected: 通过。
```bash
git add apps/web/src/components/app/top-bar.tsx apps/web/src/components/app/account-menu.tsx
git commit -m "feat(web): TopBar 品牌标记 + 字距/边距，AccountMenu 头像暖底

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6：登录前 split-brand 字阶/间距精修

**Files:** Modify `apps/web/src/app/(auth)/login/page.tsx`、`apps/web/src/components/auth/brand-panel.tsx`

§5：登录表单的 Input/Button 已由 Block A 精修（圆角 + 暖聚焦环 + 扁平），本 task 只调登录页**标题字阶**与品牌墙**排版**。

- [ ] **Step 1: 登录标题字阶**

`login/page.tsx` 的标题块（`<h1>` 那段）改为更大字阶 + 字距：
```tsx
      <div className="flex flex-col gap-1.5">
        <h1 className="font-serif text-[26px] font-semibold tracking-[0.5px] text-foreground">
          {t("loginTitle")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("loginSubtitle")}</p>
      </div>
```
（仅改外层 `gap-1`→`gap-1.5` 与 `<h1>` 的 `text-2xl tracking-tight`→`text-[26px] tracking-[0.5px]`；表单与按钮不动。）

- [ ] **Step 2: 品牌墙排版**

`brand-panel.tsx` 把品牌字距与 slogan 行高微调（暖渐变保留）：
```tsx
      <div className="font-serif text-[32px] font-semibold tracking-[1px]">
        Qriter
      </div>
      <p className="mt-1 max-w-[16rem] font-serif text-[15px] leading-[1.9] text-[#4a3d2f]">
        {t("brandSlogan")}
      </p>
```
（`text-3xl tracking-tight`→`text-[32px] tracking-[1px]`；slogan `text-base leading-relaxed`→`text-[15px] leading-[1.9]` + `mt-1`。）

- [ ] **Step 3: 类型 + Commit**

Run: `pnpm --filter @qriter/web typecheck`
Expected: 通过。
```bash
git add "apps/web/src/app/(auth)/login/page.tsx" apps/web/src/components/auth/brand-panel.tsx
git commit -m "feat(web): 登录前 split-brand 字阶/排版精修（组件由 Block A 已精修）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7：弹窗精修（book-form 间距/标题）

**Files:** Modify `apps/web/src/components/app/book-form-dialog.tsx`

§5：Dialog/Input/Select/Button 已由 Block A 精修（扁平 + 圆角 + 暖）。本 task 仅把表单**字段标签字阶**与**间距**调到与精修一致；`book-delete-dialog.tsx` 完全继承 Block A，无需改。

- [ ] **Step 1: 字段标签 caption 化**

把三处字段 `<label>` 的样式统一为更小、字距、弱化的 caption（示例改 title 字段，其余两处同样处理）：把 `className="text-foreground"` 改为 `className="text-[12px] font-medium tracking-[0.3px] text-foreground/85"`，并把每个字段容器 `gap-1.5` 保留。`DialogTitle` 已 `font-serif`，加字阶：`className="font-serif text-[18px] tracking-[0.5px]"`。

具体：`DialogTitle` 那行
```tsx
          <DialogTitle className="font-serif text-[18px] tracking-[0.5px]">
            {book ? t("editTitle") : t("createTitle")}
          </DialogTitle>
```
三个字段 label（`bf-title` / `bf-description` / `bf-status`）的 className 由 `text-foreground` 改为：
```
"text-[12px] font-medium tracking-[0.3px] text-foreground/85"
```

- [ ] **Step 2: 类型 + Commit**

Run: `pnpm --filter @qriter/web typecheck`
Expected: 通过。
```bash
git add apps/web/src/components/app/book-form-dialog.tsx
git commit -m "feat(web): 书籍弹窗标签 caption 化 + 标题字阶（弹窗外观由 Block A 扁平化）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8：stub 页字阶/间距 + 工作台数据骨架

**Files:** Modify `apps/web/src/app/(app)/books/[id]/page.tsx`、`apps/web/src/app/(app)/stats/page.tsx`、`apps/web/src/app/(app)/settings/model/page.tsx`、`apps/web/src/app/(app)/settings/account/page.tsx`

§6：工作台 stub 数据态用骨架（`useBooks` 加载时）；各 stub 页套字阶/间距。

- [ ] **Step 1: 工作台 stub 加载骨架**

`books/[id]/page.tsx` 重写（`useBooks` 加载时显示骨架，替代直接渲染）：
```tsx
"use client";

import { Button, Skeleton } from "@qriter/design";
import { useRouter } from "next/navigation";
import { use } from "react";
import { useTranslations } from "next-intl";
import { useBooks } from "@/rest/books";

/** 工作台占位页（block ④ 填充为三栏编辑器）。 */
export default function WorkspaceStubPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const t = useTranslations("workspace");
  const { data: books, isLoading } = useBooks();
  const book = books?.find((b) => b.id === id);

  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 px-8 py-24 text-center">
      {isLoading ? (
        <Skeleton className="h-8 w-48 rounded-md" />
      ) : (
        <h1 className="font-serif text-[26px] font-semibold tracking-[0.5px] text-foreground">
          {book?.title ?? t("notFound")}
        </h1>
      )}
      <p className="text-muted-foreground">{t("comingSoon")}</p>
      <Button variant="outline" onClick={() => router.push("/")}>
        ‹ {t("backToShelf")}
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: 三个 settings/stats stub 字阶/间距**

`stats/page.tsx`、`settings/model/page.tsx`、`settings/account/page.tsx` 三页同形，各把容器与文字调为统一精修（以 stats 为例，其余把 `t("stats")` 换成 `t("modelSettings")` / `t("accountSettings")`）：
```tsx
"use client";

import { useTranslations } from "next-intl";

export default function StatsStubPage() {
  const t = useTranslations("account");
  return (
    <div className="mx-auto max-w-3xl px-8 py-24 text-center">
      <div className="mb-2 text-[10px] font-semibold tracking-[2.5px] text-muted-foreground/80 uppercase">
        {t("stats")}
      </div>
      <p className="font-serif text-[20px] tracking-[0.5px] text-foreground/80">
        coming soon
      </p>
    </div>
  );
}
```
> 「coming soon」是占位非业务文案，保留英文字面（与原 stub 一致，不新增 i18n key）。eyebrow 用已有 `account.*` key。

- [ ] **Step 3: 类型 + Commit**

Run: `pnpm --filter @qriter/web typecheck`
Expected: 通过。
```bash
git add "apps/web/src/app/(app)/books/[id]/page.tsx" "apps/web/src/app/(app)/stats/page.tsx" "apps/web/src/app/(app)/settings/model/page.tsx" "apps/web/src/app/(app)/settings/account/page.tsx"
git commit -m "feat(web): stub 页字阶/间距精修 + 工作台数据骨架

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9：全量验证门 + 收尾

**Files:** —（验证）

- [ ] **Step 1: 格式 + 类型 + 围栏 + i18n**

Run: `pnpm check:format && pnpm typecheck && pnpm check && pnpm sync:locales -- --check`
Expected: Biome 无残留；类型全通过；6 围栏 0 finding（本块只动 apps/web 前端，不碰围栏覆盖的 server/libs 服务层）；i18n `Done (missing=0, asymmetric=0)`。

- [ ] **Step 2: web build 冒烟（前端无 jest，build 即冒烟）**

Run: `pnpm --filter @qriter/web build`
Expected: `next build` 成功，(app)/(auth) 全路由编译通过（含 `<img>`、`[writing-mode:vertical-rl]` 等任意值类、新封面骨架）。
> 若报 `.next` 缓存损坏（adapterFn/missing export），`rm -rf apps/web/.next` 后重跑。

- [ ] **Step 3: 收尾 Commit（若 check:format 有改动）**

```bash
git add -u apps/web
git commit -m "chore(web): 应用层精修格式化收尾

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## 自检（spec 覆盖对照）

- §4 大封面 2:3 + coverUrl/回退 + 竖排右上书名 + scrim + 状态点 + 元信息加大 + 扁平悬停：Task 1（封面色）+ Task 2（BookCard）✅
- §4 无封面回退（平涂 + 竖排书名）：Task 2（无 coverUrl 分支 + bookCoverColor）✅
- §4 ＋新建 2:3 占位：Task 3 ✅
- §6 数据 loading 骨架（封面骨架网格 + 工作台 stub 骨架）= 暖 shimmer：Task 3 + Task 8 ✅；spinner 仅动作态（登录中按钮）= 登录页未改，仍内联 `submitting` 文案，符合 ✅
- §1 字阶（eyebrow / 标题 / caption 标签 / tabular-nums 元信息）：Task 2/4/6/7/8 ✅
- §2 8pt 间距 + 容器放宽 + 发丝线：Task 3/4/5/6/8 ✅
- §5 组件（input/button/dialog/dropdown/select/badge→dot）：Block A 已交付，本块套用 + 局部字阶：Task 2/5/6/7 ✅
- §7 影响面（BookCard/BookGrid/TopBar/AccountMenu/书架/登录前/弹窗/各页/骨架）：Task 1–8 全覆盖 ✅
- i18n 无裸串：新增 `shelf.eyebrow` 走 key（Task 4）；stub 的「coming soon」沿用既有占位英文（非新增业务串）✅

> 边界：`Book.coverUrl` 字段 + AI 封面生成属下游（非本块）；BookCard 已前向兼容（cast 读取，有则显示）。编辑器引擎、AgentDock 不在本块。
