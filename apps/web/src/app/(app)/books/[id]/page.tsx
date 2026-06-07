"use client";

import { Button } from "@qriter/design";
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
  const { data: books } = useBooks();
  const book = books?.find((b) => b.id === id);

  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 px-6 py-24 text-center">
      <h1 className="font-serif text-2xl font-semibold text-foreground">
        {book?.title ?? t("notFound")}
      </h1>
      <p className="text-muted-foreground">{t("comingSoon")}</p>
      <Button variant="outline" onClick={() => router.push("/")}>
        ‹ {t("backToShelf")}
      </Button>
    </div>
  );
}
