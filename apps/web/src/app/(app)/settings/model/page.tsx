"use client";

import { useTranslations } from "next-intl";

export default function ModelSettingsStubPage() {
  const t = useTranslations("account");
  return (
    <div className="mx-auto max-w-3xl px-6 py-24 text-center text-muted-foreground">
      {t("modelSettings")} · coming soon
    </div>
  );
}
