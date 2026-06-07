import "server-only";
import type { Account } from "@qriter/types";
import { cookies } from "next/headers";

const NEST = process.env.NEST_INTERNAL_URL ?? "http://127.0.0.1:3000";
const TOKEN_COOKIE = "qriter_token";

/**
 * 服务端读取当前登录账号档案。
 * 流程：cookies() 读 httpOnly qriter_token → fetch NEST /api/auth/profile（Bearer）
 *      → 解 envelope 取 data。无 token / 非 2xx / success=false → 返回 null。
 * 仅在 server component（路由组 layout）调用；不经 proxy.ts（那是浏览器侧）。
 */
export async function getServerProfile(): Promise<Account | null> {
  const store = await cookies();
  const token = store.get(TOKEN_COOKIE)?.value;
  if (!token) return null;
  try {
    const res = await fetch(`${NEST}/api/auth/profile`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      success?: boolean;
      data?: Account;
    };
    if (json?.success === false || !json?.data) return null;
    return json.data;
  } catch {
    return null;
  }
}
