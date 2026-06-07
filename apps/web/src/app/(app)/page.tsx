"use client";

import { useTranslations } from "next-intl";
import { BookGrid } from "@/components/app/book-grid";

/** 登录后首页 = 书架。 */
export default function ShelfPage() {
  const t = useTranslations("shelf");
  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="mb-6 font-serif text-2xl font-semibold text-foreground">
        {t("title")}
      </h1>
      <BookGrid />
    </div>
  );
}
