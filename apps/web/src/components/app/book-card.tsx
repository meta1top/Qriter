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
        className="relative aspect-2/3 cursor-pointer overflow-hidden rounded-[4px] ring-1 ring-black/10 transition duration-150 group-hover:ring-primary/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {coverUrl ? (
          // biome-ignore lint/performance/noImgElement: 书封为任意外链/动态 URL，不走 next/image 优化管线
          <img
            src={coverUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition duration-150 group-hover:brightness-[1.06]"
          />
        ) : (
          <div
            className="h-full w-full transition duration-150 group-hover:brightness-[1.06]"
            style={{ background: bookCoverColor(book.title) }}
          />
        )}

        {/* 顶部渐变 scrim：保证竖排书名压在任何图上可读 */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-linear-to-b from-black/45 to-transparent" />

        {/* 竖排书名：从右上角起 */}
        <div className="pointer-events-none absolute top-3 right-3 max-h-[84%] overflow-hidden font-serif text-[15px] font-semibold tracking-[3px] text-[#fbf3e6] [writing-mode:vertical-rl] [text-shadow:0_1px_4px_rgba(0,0,0,0.55)]">
          {book.title}
        </div>

        {/* ⋯ 操作菜单（左上，hover/focus 显） */}
        <div className="absolute top-1.5 left-1.5 opacity-0 transition duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
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
