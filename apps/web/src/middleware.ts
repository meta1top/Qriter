import { type NextRequest, NextResponse } from "next/server";

/** Nest 内网地址（仅服务端可见）。dev 默认本机 3000，prod 指向内网服务。 */
const NEST = process.env.NEST_INTERNAL_URL ?? "http://127.0.0.1:3000";
const TOKEN_COOKIE = "qriter_token";

/** 这些路径由专门的 route handler 处理（写/清 cookie），proxy 放行不接管。 */
const COOKIE_ROUTES = new Set([
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/google/code",
  "/api/auth/logout",
]);

/**
 * 透明代理：把 /api/* 转发到 Nest，并把 httpOnly cookie 里的 JWT 翻译成
 * Authorization: Bearer。302（GET /api/auth/google）与流式响应原样回流。
 */
export function middleware(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;
  if (COOKIE_ROUTES.has(pathname)) return NextResponse.next();

  const token = request.cookies.get(TOKEN_COOKIE)?.value;
  const headers = new Headers(request.headers);
  headers.delete("cookie"); // 不把前端 cookie 透传给 Nest
  if (token) headers.set("authorization", `Bearer ${token}`);

  return NextResponse.rewrite(new URL(`${NEST}${pathname}${search}`), {
    request: { headers },
  });
}

export const config = {
  matcher: ["/api/:path*"],
};
