"use client";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  toast,
} from "@qriter/design";
import type { Book } from "@qriter/types";
import { useTranslations } from "next-intl";
import { useDeleteBook } from "@/rest/books";

/** 删除书籍的二次确认弹窗，book 为 null 时关闭。 */
export function BookDeleteDialog({
  book,
  onOpenChange,
}: {
  book: Book | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("book");
  const del = useDeleteBook();

  const onConfirm = async () => {
    if (!book) return;
    try {
      await del.mutateAsync(book.id);
      toast.success(t("deleted"));
      onOpenChange(false);
    } catch {
      toast.error(t("deleteFailed"));
    }
  };

  return (
    <Dialog open={book != null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-serif">
            {book ? t("deleteTitle", { title: book.title }) : ""}
          </DialogTitle>
          <DialogDescription>{t("deleteConfirm")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={del.isPending}
          >
            {t("confirmDelete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
