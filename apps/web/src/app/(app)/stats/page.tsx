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
