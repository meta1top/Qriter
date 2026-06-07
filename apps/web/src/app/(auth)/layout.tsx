import { redirect } from "next/navigation";
import { BrandPanel } from "@/components/auth/brand-panel";
import { getServerProfile } from "@/lib/server-auth";

/**
 * 登录前路由组布局（SSR 鉴权门）。
 * 已登录（有 profile）→ redirect("/")；未登录 → 渲染品牌墙 + 右侧表单 slot。
 * 承载 (auth)/login 与 (auth)/auth/google（回调）。
 */
export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getServerProfile();
  if (profile) redirect("/");
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <BrandPanel />
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-[380px]">{children}</div>
      </main>
    </div>
  );
}
