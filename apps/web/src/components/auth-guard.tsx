"use client";

import { useAtomValue } from "jotai";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { isAuthenticatedAtom } from "@/atoms/auth";

/** 公开路由 —— 未登录也可访问，不触发跳转。 */
const PUBLIC_PATHS = new Set(["/login"]);

/**
 * 启动鉴权守卫：以访问令牌是否存在判定登录态。
 *
 * 未登录访问受保护路由 → 跳 /login；已登录停留 /login → 回主页；
 * 解析期间渲染加载占位，避免内容闪烁。
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const isAuthenticated = useAtomValue(isAuthenticatedAtom);
  const t = useTranslations("common");
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    const isPublic = PUBLIC_PATHS.has(pathname);

    if (!isAuthenticated && !isPublic) {
      setResolved(false);
      router.replace("/login");
      return;
    }

    if (isAuthenticated && pathname === "/login") {
      setResolved(false);
      router.replace("/");
      return;
    }

    setResolved(true);
  }, [isAuthenticated, pathname, router]);

  if (!resolved) {
    return <SplashScreen label={t("loading")} />;
  }

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
