"use client";

import { useTranslations } from "next-intl";

export default function StatsStubPage() {
  const t = useTranslations("account");
  return (
    <div className="mx-auto max-w-3xl px-6 py-24 text-center text-muted-foreground">
      {t("stats")} · {t("comingSoon")}
    </div>
  );
}
