import { NextResponse } from "next/server";

const NEST = process.env.NEST_INTERNAL_URL ?? "http://127.0.0.1:3000";
export const TOKEN_COOKIE = "qriter_token";
const MAX_AGE = 60 * 60 * 24 * 7; // 7d，与后端 jwt.expires 对齐

/**
 * 调用 Nest 认证端点（POST），成功则把 accessToken 写入 httpOnly cookie、
 * 响应体只回 {user}；失败原样透传 Nest 的 envelope + 状态码。
 */
export async function proxyAndSetCookie(
  nestPath: string,
  body: unknown,
): Promise<NextResponse> {
  const upstream = await fetch(`${NEST}${nestPath}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  type UpstreamJson = {
    success?: boolean;
    data?: { accessToken: string; user: unknown };
  };
  let json: UpstreamJson | null = null;
  try {
    json = (await upstream.json()) as UpstreamJson;
  } catch {
    json = null;
  }
  if (
    !upstream.ok ||
    !json ||
    json.success === false ||
    !json.data?.accessToken
  ) {
    return NextResponse.json(
      json ?? { success: false, message: "upstream error" },
      {
        status: upstream.status,
      },
    );
  }
  const res = NextResponse.json({ user: json.data.user });
  res.cookies.set({
    name: TOKEN_COOKIE,
    value: json.data.accessToken,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: MAX_AGE,
  });
  return res;
}

/** 清除认证 cookie。 */
export function clearAuthCookie(): NextResponse {
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: TOKEN_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
