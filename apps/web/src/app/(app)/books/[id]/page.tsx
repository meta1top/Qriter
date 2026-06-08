"use client";

import { Button, Skeleton } from "@qriter/design";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { use } from "react";
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
