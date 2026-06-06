# 谷歌登录 — 前端实施 Plan（Plan B / 共两份）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把前端鉴权传输从「浏览器直连 Nest + localStorage Bearer」整体切到「浏览器 ⇄ Next 代理 ⇄ Nest + httpOnly cookie」：`proxy.ts` 透明代理 + 4 个写/清 cookie 的 route handler + `/auth/google` 回调页 + 登录页 Google 按钮 + apiClient/AuthGuard 改造 + WS ticket 接入。

**Architecture:** Next 16 `proxy.ts`（middleware 约定改名）拦 `/api/*`：cookie 路径放行给 route handler，其余从 cookie 读 JWT → 加 `Authorization: Bearer` → `rewrite` 到 Nest。`login/register/google/code/logout` 用 route handler 调 Nest、`Set-Cookie`、响应体只回 `{user}`。token 进 httpOnly，JS 不可读；登录态改由 `GET /api/auth/profile` 驱动；WS 用短 ticket 握手。

**Tech Stack:** Next.js 16（app router · proxy.ts）· axios（`@qriter/web-common`）· jotai · @tanstack/react-query · next-intl。

**前置：** Plan A（后端）已上线（`POST /auth/google`、`GET /auth/profile`、`GET /auth/ws-ticket` 可用）。spec：`docs/superpowers/specs/2026-06-07-google-login-design.md`。

> **版本假设（实施者首步确认）：** 本仓 `apps/web` 用 Next **16.x** 的 `proxy.ts` 约定。下文按 `export function proxy(request: NextRequest)` + `export const config = { matcher }` 编写；若你的 Next 16 版本要求 default export 或函数名不同，按版本文档把导出名对齐（逻辑不变）。

---

## 文件结构

**新建**
- `apps/web/proxy.ts` — 透明代理（拦 `/api/*`）
- `apps/web/src/lib/auth-cookie.ts` — route handler 共享：调 Nest + set/clear cookie
- `apps/web/src/app/api/auth/login/route.ts`
- `apps/web/src/app/api/auth/register/route.ts`
- `apps/web/src/app/api/auth/google/code/route.ts`
- `apps/web/src/app/api/auth/logout/route.ts`
- `apps/web/src/app/auth/google/page.tsx` — OAuth 回调页（换码）
- `apps/web/src/lib/ws-ticket.ts` — 取 WS ticket

**修改**
- `packages/web-common/src/api/client.ts` — baseURL 同源 + `withCredentials` + 删 localStorage token
- `packages/web-common/src/index.ts` — 移除 token-helper 导出
- `apps/web/src/rest/auth.ts` — 端点改同源 `/api/auth/*`、返回 `{user}`、加 `useLogout`
- `apps/web/src/atoms/auth.ts` — 删 `accessTokenAtom`，`isAuthenticatedAtom` 由 `currentUserAtom` 派生
- `apps/web/src/components/auth-guard.tsx` — 改 `GET /api/auth/profile` 驱动
- `apps/web/src/app/login/page.tsx` — 加「Sign in with Google」按钮
- `apps/web/src/i18n/messages/{zh,en}/...` — `auth.signInWithGoogle`（文件位置以现有 i18n 结构为准）
- `apps/web/.env.example` / 本地 `.env` — `NEST_INTERNAL_URL`

---

## Task 1：apiClient 改同源 + cookie

**Files:** Modify `packages/web-common/src/api/client.ts`、`packages/web-common/src/index.ts`

- [ ] **Step 1: 改 client.ts**

- 把 `axios.create` 改成同源 + 带 cookie：
```ts
  const client = axios.create({
    baseURL: baseURL ?? "",          // 同源相对：浏览器打到 Next :3001，由 proxy.ts 转发
    timeout: 30000,
    withCredentials: true,           // 同源 httpOnly cookie 自动带上
    headers: { "Content-Type": "application/json" },
  });
```
- **删除**整段「请求拦截器注入 Authorization」：
```ts
  client.interceptors.request.use((config) => { ... localStorage ... });   // 整段删除
```
- **删除** `TOKEN_KEY` 常量与 `setAccessToken` / `clearAccessToken` / `getAccessToken` 三个导出函数。
- **保留** `unwrapEnvelope`、响应拦截器（含 401 跳 `/login`）、`resolveBaseURL` / `getBrowserApiBaseUrl`（WS 仍需 Nest 源地址）。

- [ ] **Step 2: 改 index.ts 导出**

`packages/web-common/src/index.ts` 的 api 导出改为：
```ts
export {
  apiClient,
  createApiClient,
  getBrowserApiBaseUrl,
} from "./api/client";
```
（移除 `clearAccessToken` / `getAccessToken` / `setAccessToken`。）

- [ ] **Step 3: 类型检查**

Run: `pnpm --filter @qriter/web-common typecheck`
Expected: 通过（此时 `apps/web` 仍引用已删函数 → 下一 Task 修复）。

- [ ] **Step 4: Commit**

```bash
git add packages/web-common/src/api/client.ts packages/web-common/src/index.ts
git commit -m "refactor(web-common): apiClient 改同源 + withCredentials，移除 localStorage token"
```

---

## Task 2：`proxy.ts` 透明代理

**Files:** Create `apps/web/proxy.ts`；Modify `apps/web/.env.example`

- [ ] **Step 1: 写 proxy.ts**

```ts
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
export function proxy(request: NextRequest): NextResponse {
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
```

- [ ] **Step 2: env 样例**

`apps/web/.env.example` 追加：
```
# Nest 内网地址（proxy.ts 转发目标）。dev 留空走默认 http://127.0.0.1:3000
NEST_INTERNAL_URL=http://127.0.0.1:3000
```

- [ ] **Step 3: 类型检查 + Commit**

Run: `pnpm --filter @qriter/web typecheck`
Expected: 通过（proxy.ts 自身不依赖被删函数）。
```bash
git add apps/web/proxy.ts apps/web/.env.example
git commit -m "feat(web): proxy.ts 透明代理 /api/* → Nest（cookie→Bearer）"
```

---

## Task 3：cookie 共享 helper + 4 个 route handler

**Files:** Create `apps/web/src/lib/auth-cookie.ts` + 4 个 `route.ts`

- [ ] **Step 1: auth-cookie.ts**

```ts
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
  const json = (await upstream.json()) as {
    success?: boolean;
    data?: { accessToken: string; user: unknown };
  };
  if (!upstream.ok || json?.success === false || !json?.data?.accessToken) {
    return NextResponse.json(json, { status: upstream.status || 401 });
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
```

- [ ] **Step 2: 四个 route handler**

`apps/web/src/app/api/auth/login/route.ts`：
```ts
import type { NextRequest } from "next/server";
import { proxyAndSetCookie } from "@/lib/auth-cookie";

export async function POST(req: NextRequest) {
  return proxyAndSetCookie("/api/auth/login", await req.json());
}
```
`apps/web/src/app/api/auth/register/route.ts`：
```ts
import type { NextRequest } from "next/server";
import { proxyAndSetCookie } from "@/lib/auth-cookie";

export async function POST(req: NextRequest) {
  return proxyAndSetCookie("/api/auth/register", await req.json());
}
```
`apps/web/src/app/api/auth/google/code/route.ts`（注意 Nest 端点是 `/api/auth/google`）：
```ts
import type { NextRequest } from "next/server";
import { proxyAndSetCookie } from "@/lib/auth-cookie";

export async function POST(req: NextRequest) {
  return proxyAndSetCookie("/api/auth/google", await req.json());
}
```
`apps/web/src/app/api/auth/logout/route.ts`：
```ts
import { clearAuthCookie } from "@/lib/auth-cookie";

export async function POST() {
  return clearAuthCookie();
}
```

- [ ] **Step 3: 类型检查 + Commit**

Run: `pnpm --filter @qriter/web typecheck`
Expected: 通过。
```bash
git add apps/web/src/lib/auth-cookie.ts apps/web/src/app/api/auth
git commit -m "feat(web): login/register/google/logout cookie route handlers"
```

---

## Task 4：atoms 改 currentUser 驱动

**Files:** Modify `apps/web/src/atoms/auth.ts`

- [ ] **Step 1: 重写 atoms**

```ts
"use client";

import type { Account } from "@qriter/types";
import { atom } from "jotai";

/** 当前登录账号档案。由 /api/auth/profile 拉取成功后写入，未登录为 null。 */
export const currentUserAtom = atom<Account | null>(null);

/** 是否已登录 —— 由当前账号是否存在派生（token 在 httpOnly cookie，JS 不可读）。 */
export const isAuthenticatedAtom = atom((get) => get(currentUserAtom) != null);
```
（删除 `accessTokenAtom` 与 `getAccessToken` import。）

- [ ] **Step 2: 类型检查 + Commit**

Run: `pnpm --filter @qriter/web typecheck`
Expected: 报错指向 `rest/auth.ts`（仍用 `accessTokenAtom` / `setAccessToken`）→ 下一 Task 修。
```bash
git add apps/web/src/atoms/auth.ts
git commit -m "refactor(web): 登录态由 currentUserAtom 派生（移除 token atom）"
```

---

## Task 5：rest/auth.ts 改同源 + {user} + logout

**Files:** Modify `apps/web/src/rest/auth.ts`

- [ ] **Step 1: 重写**

```ts
"use client";

import type { Account, LoginInput, RegisterInput } from "@qriter/types";
import { apiClient } from "@qriter/web-common";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSetAtom } from "jotai";
import { currentUserAtom } from "@/atoms/auth";

/** profile 查询 key。 */
export const profileQueryKey = ["auth", "profile"] as const;

/** 登录（cookie 由 route handler 下发，响应只含 user）。 */
export async function login(input: LoginInput): Promise<Account> {
  const { data } = await apiClient.post<{ user: Account }>(
    "/api/auth/login",
    input,
  );
  return data.user;
}

/** 注册。 */
export async function register(input: RegisterInput): Promise<Account> {
  const { data } = await apiClient.post<{ user: Account }>(
    "/api/auth/register",
    input,
  );
  return data.user;
}

/** 退出登录（清 cookie）。 */
export async function logout(): Promise<void> {
  await apiClient.post("/api/auth/logout");
}

/** 拉取当前账号档案（经 proxy → Nest，envelope 已解包）。 */
export async function fetchProfile(): Promise<Account> {
  const { data } = await apiClient.get<Account>("/api/auth/profile");
  return data;
}

export function useLogin() {
  const qc = useQueryClient();
  const setCurrentUser = useSetAtom(currentUserAtom);
  return useMutation({
    mutationFn: login,
    onSuccess: (user) => {
      setCurrentUser(user);
      qc.invalidateQueries({ queryKey: profileQueryKey });
    },
  });
}

export function useRegister() {
  const qc = useQueryClient();
  const setCurrentUser = useSetAtom(currentUserAtom);
  return useMutation({
    mutationFn: register,
    onSuccess: (user) => {
      setCurrentUser(user);
      qc.invalidateQueries({ queryKey: profileQueryKey });
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  const setCurrentUser = useSetAtom(currentUserAtom);
  return useMutation({
    mutationFn: logout,
    onSuccess: () => {
      setCurrentUser(null);
      qc.clear();
      window.location.href = "/login";
    },
  });
}

export function useProfile(enabled: boolean) {
  return useQuery({
    queryKey: profileQueryKey,
    queryFn: fetchProfile,
    enabled,
    retry: false,
  });
}
```

- [ ] **Step 2: 类型检查 + Commit**

Run: `pnpm --filter @qriter/web typecheck`
Expected: 通过（login page 仍用 useLogin，签名兼容）。
```bash
git add apps/web/src/rest/auth.ts
git commit -m "refactor(web): auth 请求改同源 /api/auth/*，返回 {user} + 加 useLogout"
```

---

## Task 6：AuthGuard 改 profile 驱动

**Files:** Modify `apps/web/src/components/auth-guard.tsx`

- [ ] **Step 1: 重写**

```tsx
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
```

- [ ] **Step 2: 类型检查 + Commit**

Run: `pnpm --filter @qriter/web typecheck`
Expected: 通过。
```bash
git add apps/web/src/components/auth-guard.tsx
git commit -m "refactor(web): AuthGuard 改 /api/auth/profile 驱动登录态"
```

---

## Task 7：登录页 Google 按钮 + i18n

**Files:** Modify `apps/web/src/app/login/page.tsx`；i18n messages（zh/en）

- [ ] **Step 1: 加按钮**

在密码表单的提交 `Button` 之后、`</Form>` 之前（或表单下方）加：
```tsx
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => {
                window.location.href = "/api/auth/google";
              }}
            >
              {t("signInWithGoogle")}
            </Button>
```
（`variant="outline"` 若 `@qriter/design` 的 Button 不支持该 variant，则去掉该 prop。）

- [ ] **Step 2: i18n**

在 web 的 `auth` 命名空间 zh / en 文件分别加键（位置以现有 i18n 结构为准；找当前 `auth.loginTitle` 所在文件）：
- zh：`"signInWithGoogle": "使用 Google 登录"`
- en：`"signInWithGoogle": "Sign in with Google"`

- [ ] **Step 3: 校验 i18n + Commit**

Run: `pnpm sync:locales -- --check`
Expected: `Done (missing=0, asymmetric=0)`。
```bash
git add apps/web/src/app/login/page.tsx apps/web/src/i18n
git commit -m "feat(web): 登录页加 Google 登录按钮 + i18n"
```

---

## Task 8：`/auth/google` 回调页

**Files:** Create `apps/web/src/app/auth/google/page.tsx`

- [ ] **Step 1: 写页面（useSearchParams 需 Suspense 包裹）**

```tsx
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
      .then(({ data }) => {
        setCurrentUser(data.user);
        router.replace("/");
      })
      .catch(() => setError(true));
  }, [params, router, setCurrentUser]);

  return (
    <main className="flex min-h-screen items-center justify-center p-6 text-sm text-muted-foreground">
      {error ? (
        <div className="flex flex-col items-center gap-3">
          <span>{t("loginFailed")}</span>
          <a className="underline" href="/login">
            {t("backToLogin")}
          </a>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          <span>{t("submitting")}</span>
        </div>
      )}
    </main>
  );
}

export default function GoogleCallbackPage() {
  return (
    <Suspense fallback={null}>
      <GoogleCallback />
    </Suspense>
  );
}
```

- [ ] **Step 2: i18n 补 `backToLogin`**

web `auth` 命名空间加：zh `"backToLogin": "返回登录"`、en `"backToLogin": "Back to sign in"`（`loginFailed` / `submitting` 已存在）。

- [ ] **Step 3: 校验 + 类型检查 + Commit**

Run: `pnpm sync:locales -- --check && pnpm --filter @qriter/web typecheck`
Expected: i18n 对齐；类型通过。
```bash
git add apps/web/src/app/auth/google/page.tsx apps/web/src/i18n
git commit -m "feat(web): /auth/google OAuth 回调页（换码 + 写 currentUser）"
```

---

## Task 9：WS ticket 接入工具

**Files:** Create `apps/web/src/lib/ws-ticket.ts`

- [ ] **Step 1: 写工具**

```ts
import { apiClient } from "@qriter/web-common";

/**
 * 取一次性 WS ticket（60s）。socket.io 客户端连接前调用，把返回值放 handshake auth.token：
 *   const ticket = await fetchWsTicket();
 *   io(getBrowserApiBaseUrl() + namespace, { auth: { token: ticket } });
 * 重连 / 过期时重取。
 */
export async function fetchWsTicket(): Promise<string> {
  const { data } = await apiClient.get<{ ticket: string }>("/api/auth/ws-ticket");
  return data.ticket;
}
```
> 说明：当前 `apps/web` 尚无 socket.io 客户端；Agent 会话客户端落地时，连接处用本工具取 ticket 并塞 `auth.token`（后端 WS 中间件已能 verify 该短 token）。

- [ ] **Step 2: 类型检查 + Commit**

Run: `pnpm --filter @qriter/web typecheck`
Expected: 通过。
```bash
git add apps/web/src/lib/ws-ticket.ts
git commit -m "feat(web): WS ticket 取用工具（供 socket.io 握手）"
```

---

## Task 10：构建 + 围栏 + 手动冒烟

**Files:** —（验证为主）

- [ ] **Step 1: 全量类型 / lint / 构建**

Run: `pnpm typecheck && pnpm check:dead && pnpm check:format && pnpm --filter @qriter/web build`
Expected: 类型通过；`check:dead` 0（已删的 token 函数无残留引用）；格式无残留；`next build` 成功（proxy.ts / route handlers 编译通过）。

- [ ] **Step 2: 起服务做端到端冒烟**

Run: `pnpm dev:db:up && pnpm dev`（确保 Nest 已含 Plan A 改动；`application.local.yml` 配好 `oauth.google` 真凭证，Google Cloud Console 的 Authorized redirect URI 含 `http://localhost:3001/auth/google`）

手动验证（参考 superpowers:verification-before-completion 与 verify 技能）：
1. 访问 `http://localhost:3001` 未登录 → 跳 `/login`。
2. 密码登录 → 成功落 `qriter_token` httpOnly cookie（DevTools→Application→Cookies，确认 `HttpOnly` 勾选、localStorage 无 token）→ 进主页。
3. 点「使用 Google 登录」→ 跳 Google → 授权 → 回 `/auth/google` → 自动进主页；cookie 已写。
4. 刷新页面仍登录（profile 驱动）；调用任意业务接口经 `proxy.ts` 带 Bearer 成功。
5. 退出（useLogout）→ cookie 清除 → 跳 `/login`。
6. 篡改 / 删除 cookie 后访问受保护页 → 401 → 跳 `/login`。

- [ ] **Step 3: 收尾 Commit（若有格式化改动）**

```bash
git add -A
git commit -m "chore(web): 谷歌登录前端构建 + 格式化收尾"
```

---

## 自检（spec 覆盖对照）

- 传输模型 / `proxy.ts`（§3、决策 8）：Task 2 ✅
- 4 个 cookie route handler（§3/§6）：Task 3 ✅
- cookie 形态 httpOnly/lax/7d（§6）：Task 3 `auth-cookie.ts` ✅
- apiClient 同源 + withCredentials + 删 localStorage（§6）：Task 1 ✅
- atoms / AuthGuard 改 profile 驱动（§6）：Task 4/6 ✅
- 登录页 Google 按钮（§6）：Task 7 ✅
- `/auth/google` 回调页（§3/§6）：Task 8 ✅
- WS ticket 前端接入（§7）：Task 9 ✅
- i18n 无裸串（§8）：Task 7/8 ✅
- 上线顺序（§10）：本 plan 整体在 Plan A 之后执行 ✅

> 边界提示：`/auth/google` 页必须在 `PUBLIC_PATHS` 且 profile 查询 `enabled:false`，否则回调期 401 会被 apiClient 拦截器打断换码（Task 6 已处理）。前端切换瞬间老用户 localStorage 残留 token 失效，需重登一次（spec §10 已接受）。
