import { redirect } from "next/navigation";
import { AuthHydrator } from "@/components/app/auth-hydrator";
import { TopBar } from "@/components/app/top-bar";
import { getServerProfile } from "@/lib/server-auth";

/**
 * 登录后路由组布局（SSR 鉴权门）。
 * 未登录 → redirect("/login")；已登录 → 渲染顶栏 shell + 把 profile 水合进 currentUserAtom。
 * 承载书架(/)、工作台(/books/[id])、统计/设置占位。
 * toast 出口在根布局 app/layout.tsx（(auth) 与 (app) 两组共用），此处不再挂。
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getServerProfile();
  if (!profile) redirect("/login");
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AuthHydrator user={profile} />
      <TopBar />
      <main className="flex-1">{children}</main>
    </div>
  );
}
