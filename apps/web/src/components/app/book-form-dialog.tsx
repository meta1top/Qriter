"use client";

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from "@qriter/design";
import type { Book, BookStatus } from "@qriter/types";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useCreateBook, useUpdateBook } from "@/rest/books";

const STATUSES: BookStatus[] = ["draft", "writing", "done"];

/** 新建 / 编辑书籍的弹窗表单，book 为 null 时表示新建，否则预填并含状态下拉。 */
export function BookFormDialog({
  open,
  book,
  onOpenChange,
}: {
  open: boolean;
  book: Book | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("book");
  const create = useCreateBook();
  const update = useUpdateBook();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<BookStatus>("draft");

  useEffect(() => {
    if (!open) return;
    setTitle(book?.title ?? "");
    setDescription(book?.description ?? "");
    setStatus((book?.status as BookStatus) ?? "draft");
  }, [open, book]);

  const pending = create.isPending || update.isPending;

  const onSave = async () => {
    if (!title.trim()) return;
    try {
      if (book) {
        await update.mutateAsync({
          id: book.id,
          input: { title, description: description || undefined, status },
        });
        toast.success(t("updated"));
      } else {
        await create.mutateAsync({
          title,
          description: description || undefined,
        });
        toast.success(t("created"));
      }
      onOpenChange(false);
    } catch {
      toast.error(t("saveFailed"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-serif">
            {book ? t("editTitle") : t("createTitle")}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5 text-sm">
            <label htmlFor="bf-title" className="text-foreground">
              {t("titleLabel")}
            </label>
            <Input
              id="bf-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("titlePlaceholder")}
            />
          </div>

          <div className="flex flex-col gap-1.5 text-sm">
            <label htmlFor="bf-description" className="text-foreground">
              {t("descriptionLabel")}
            </label>
            <Input
              id="bf-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("descriptionPlaceholder")}
            />
          </div>

          {book ? (
            <div className="flex flex-col gap-1.5 text-sm">
              <label htmlFor="bf-status" className="text-foreground">
                {t("statusLabel")}
              </label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as BookStatus)}
              >
                <SelectTrigger id="bf-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`status.${s}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button onClick={onSave} disabled={pending || !title.trim()}>
            {pending ? t("saving") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
