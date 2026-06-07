"use client";

import type { Account } from "@qriter/types";
import { apiClient } from "@qriter/web-common";
import { useSetAtom } from "jotai";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense, useEffect, useRef, useState } from "react";
import { currentUserAtom } from "@/atoms/auth";

function GoogleCallback() {
  const router = useRouter();
  const params = useSearchParams();
  const setCurrentUser = useSetAtom(currentUserAtom);
  const t = useTranslations("auth");
  const [error, setError] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const code = params.get("code");
    const state = params.get("state");
    if (!code || !state) {
      setError(true);
      return;
    }
    apiClient
      .post<{ user: Account }>("/api/auth/google/code", { code, state })
      .then(({ data }: { data: { user: Account } }) => {
        setCurrentUser(data.user);
        router.replace("/");
      })
      .catch(() => setError(true));
  }, [params, router, setCurrentUser]);

  return (
    <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
      {error ? (
        <>
          <span>{t("loginFailed")}</span>
          <a className="underline" href="/login">
            {t("backToLogin")}
          </a>
        </>
      ) : (
        <div className="flex items-center gap-2">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          <span>{t("loggingIn")}</span>
        </div>
      )}
    </div>
  );
}

export default function GoogleCallbackPage() {
  return (
    <Suspense fallback={null}>
      <GoogleCallback />
    </Suspense>
  );
}
