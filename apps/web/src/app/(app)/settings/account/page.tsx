"use client";

import { useTranslations } from "next-intl";

export default function AccountSettingsStubPage() {
  const t = useTranslations("account");
  return (
    <div className="mx-auto max-w-3xl px-6 py-24 text-center text-muted-foreground">
      {t("accountSettings")} · coming soon
    </div>
  );
}
