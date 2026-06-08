"use client";

import { Skeleton } from "@qriter/design";
import type { Book } from "@qriter/types";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useAppLocale } from "@/components/intl-provider";
import { useBooks } from "@/rest/books";
import { BookCard } from "./book-card";
import { BookDeleteDialog } from "./book-delete-dialog";
import { BookFormDialog } from "./book-form-dialog";

/** 自适应封面网格：窄封面多列，8pt 行列距（骨架与列表共用）。 */
const GRID_CLASS =
  "grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-5 gap-y-7";

/** 书架主区域：书籍网格 + 新建卡 + 空态 + 骨架 + 弹窗编排。 */
export function BookGrid() {
  const t = useTranslations("shelf");
  const { locale } = useAppLocale();
  const { data: books, isLoading, isError } = useBooks();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Book | null>(null);
  const [deleting, setDeleting] = useState<Book | null>(null);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (book: Book) => {
    setEditing(book);
    setFormOpen(true);
  };

  if (isLoading) {
    return (
      <div className={GRID_CLASS}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex flex-col gap-2.5">
            <Skeleton className="aspect-2/3 rounded-[4px]" />
            <Skeleton className="h-3 w-2/3 rounded-full" />
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return <p className="text-sm text-destructive">{t("loadFailed")}</p>;
  }

  const list = books ?? [];

  return (
    <>
      {list.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-20 text-center">
          <p className="text-muted-foreground">{t("empty")}</p>
          <button
            type="button"
            onClick={openCreate}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            {t("createFirst")}
          </button>
        </div>
      ) : (
        <div className={GRID_CLASS}>
          {list.map((book) => (
            <BookCard
              key={book.id}
              book={book}
              locale={locale}
              onEdit={openEdit}
              onDelete={setDeleting}
            />
          ))}
          <button
            type="button"
            onClick={openCreate}
            className="flex aspect-2/3 flex-col items-center justify-center gap-2 rounded-[4px] border-2 border-dashed border-border text-muted-foreground transition hover:border-primary hover:text-primary"
          >
            <span className="text-2xl font-light">＋</span>
            <span className="text-xs">{t("newBook")}</span>
          </button>
        </div>
      )}

      <BookFormDialog
        open={formOpen}
        book={editing}
        onOpenChange={setFormOpen}
      />
      <BookDeleteDialog
        book={deleting}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      />
    </>
  );
}
