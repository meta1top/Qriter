"use client";

import {
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@qriter/design";
import type { Book } from "@qriter/types";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { bookSpineColor } from "@/lib/book-spine";

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

/** 单本书的卡片：封面色块 + 标题 + 简介 + 状态 + 相对时间 + 操作菜单。 */
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
  const tShelf = useTranslations("shelf");

  const goWorkspace = () => router.push(`/books/${book.id}`);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={goWorkspace}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          goWorkspace();
        }
      }}
      className="group relative flex cursor-pointer flex-col gap-3 rounded-xl border border-border bg-card p-4 text-left shadow-sm transition hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <div
          className="h-14 w-10 shrink-0 rounded-sm shadow-inner"
          style={{ background: bookSpineColor(book.title) }}
          aria-hidden
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={t("bookActions", { title: book.title })}
              onClick={(e) => e.stopPropagation()}
              className="rounded p-1 text-muted-foreground opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100"
            >
              ⋯
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onSelect={() => onEdit(book)}>
              {t("edit")}
            </DropdownMenuItem>
            <DropdownMenuItem destructive onSelect={() => onDelete(book)}>
              {t("delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex flex-col gap-1">
        <h3 className="font-serif text-lg font-semibold text-foreground">
          {book.title}
        </h3>
        {book.description ? (
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {book.description}
          </p>
        ) : null}
      </div>

      <div className="mt-auto flex items-center gap-2">
        <Badge variant="secondary">{t(`status.${book.status}`)}</Badge>
        <span className="text-xs text-muted-foreground">
          {tShelf("updatedAt", { time: relativeTime(book.updatedAt, locale) })}
        </span>
      </div>
    </div>
  );
}
