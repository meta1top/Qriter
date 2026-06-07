"use client";

import { useQuery } from "@tanstack/react-query";
import { useSetAtom } from "jotai";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { currentUserAtom } from "@/atoms/auth";
import { fetchProfile, profileQueryKey } from "@/rest/auth";

/** 公开路由：未登录可访问。/auth/google 是 OAuth 回调页，禁跑 profile 查询以免打断换码。 */
const PUBLIC_PATHS = new Set(["/login", "/auth/google"]);

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("common");
  const setCurrentUser = useSetAtom(currentUserAtom);
  const isPublic = PUBLIC_PATHS.has(pathname);

  const { data, isLoading, isError } = useQuery({
    queryKey: profileQueryKey,
    queryFn: fetchProfile,
    retry: false,
    staleTime: 60_000,
    enabled: pathname !== "/auth/google",
  });

  useEffect(() => {
    if (data) setCurrentUser(data);
  }, [data, setCurrentUser]);

  useEffect(() => {
    if (isLoading) return;
    const authed = !!data && !isError;
    if (!authed && !isPublic) router.replace("/login");
    if (authed && pathname === "/login") router.replace("/");
  }, [isLoading, data, isError, isPublic, pathname, router]);

  if (isLoading && !isPublic) return <SplashScreen label={t("loading")} />;
  return <>{children}</>;
}

function SplashScreen({ label }: { label: string }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background">
      <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        <span>{label}</span>
      </div>
    </div>
  );
}
