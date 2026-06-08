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
