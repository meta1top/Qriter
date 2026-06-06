# 谷歌登录 + 鉴权传输统一到 Next 代理 / httpOnly Cookie — 设计 Spec

- 日期：2026-06-07
- 状态：已评审，待出实施 plan
- 范围：在 qriter 现有「邮箱 + 密码 + JWT」鉴权基线上，新增 Google 登录，并把整个前端的 token 传输从「浏览器直连 Nest + localStorage Bearer」统一迁移到「浏览器 ⇄ Next 代理 ⇄ Nest + httpOnly Cookie」。

## 1. 背景与现状

- 后端 `libs/account`：`Account` 实体（`email` 唯一 / `password_hash` **NOT NULL** / `display_name`），`UserService` 是 `Account` 唯一归属，提供 `register` / `validateCredentials` / `login` / `findById` / `toProfile`。
- 认证层 `apps/server/src/auth`：`AuthModule`（Passport + JwtModule，密钥取自 `config.jwt`）、`JwtStrategy`（从 `Authorization: Bearer` 取 token，payload `{userId,email}`）、`JwtAuthGuard`、`@Public()`、`@CurrentUser()`。`@nestjs/passport` + `passport-jwt` 已在依赖。
- 端点 `apps/server/src/rest/auth.controller.ts`：`POST /auth/register`、`POST /auth/login`（均 `@Public()` + 限流），签 `{userId,email}` 的 JWT，统一返回 `AuthResponse`（`accessToken` + 公开档案）。
- **缺口**：前端 `fetchProfile` 调 `/api/auth/profile`，但 Nest 上并不存在该端点（当前 404）。
- 前端 `apps/web`：经 `@qriter/web-common` 的 axios `apiClient` **直连 Nest `:3000`**，请求拦截器把 **localStorage 的 token 当 `Authorization: Bearer` 注入**；无任何代理层、无 `app/api` route handler、`next.config.ts` 无 rewrites。`AuthGuard` 纯客户端、靠 `isAuthenticatedAtom`（localStorage token 是否存在）判定。
- WS：两个 socket.io gateway（`ws/health`、Agent 的 `session.gateway`，`AGENT_WS_NAMESPACE`）直连 Nest `:3000`；鉴权中间件 `createWsJwtMiddleware` 从 `socket.handshake.auth.token` / `query.token` 读 JWT（即**前端 JS 必须显式塞 token 进握手**）。
- 配置走 Nacos / `application.yml`，强类型 `AppConfig`（`port/database/jwt/redis?/llm?`），全局 `APP_CONFIG` token。

## 2. 已评审决策

| # | 决策点 | 选择 |
|---|--------|------|
| 1 | OAuth 接入方式 | **Authorization Code 流** |
| 2 | 范围边界 | **全量统一到 Next 代理 + httpOnly cookie**（password 登录一并迁移） |
| 3 | 换 code 机制 | **Next 页面 `/auth/google` → 自定义 route handler `/api/auth/google/code` → Nest `POST /auth/google`，用 `google-auth-library` 换 code（弃用 passport-google-oauth20）** |
| 4 | 账号 / 身份模型 | **独立 `account_identity` 表**，`password_hash` 改 nullable |
| 5 | 邮箱关联策略 | **仅 `email_verified=true` 自动按邮箱关联** |
| 6 | WS 鉴权 | **WS ticket 端点**（保 httpOnly，长 JWT 不出 JS） |
| 7 | CSRF `state` | **无状态签名 state**（用 `JwtService` 签 10min 短 JWT，换 code 时验签，不引 Redis） |
| 8 | 通用代理实现 | **Next 16 `proxy.ts`**（middleware 约定改名）做透明代理；只有写/清 cookie 的端点用 route handler |

## 3. 架构 / Token 传输模型

浏览器不再直连 Nest。所有 HTTP 走 `浏览器 ⇄ Next(:3001) ⇄ Nest(:3000)`，JWT 以 **httpOnly cookie**（`qriter_token`）存在 Next 这一侧，浏览器 JS 永不可读。Nest 侧 `JwtStrategy` 继续从 `Authorization: Bearer` 取 token——由代理把 cookie 翻译成 Bearer，Nest 鉴权逻辑**不变**。

Next 侧两类入口：

- **通用透明代理 = `proxy.ts`**（根级，matcher 匹配 `/api/:path*`）：
  - 命中特殊 cookie 路径（`/api/auth/login`、`/register`、`/google/code`、`/logout`）→ `NextResponse.next()`，放行给 route handler；
  - 其余一律：从 cookie 读 `qriter_token` → `NextResponse.rewrite("${NEST_INTERNAL_URL}/api/<path>", { request: { headers + Authorization: Bearer } })`（`NEST_INTERNAL_URL` 走 env，dev 默认 `http://127.0.0.1:3000`，prod 指向内网 Nest）；透传 302（`GET /api/auth/google`）与流式响应（Agent SSE / `ws-ticket` / `profile` / 业务接口全走它）。
- **写/清 cookie 的 route handler（仅 4 个）**：`app/api/auth/login/route.ts`、`register/route.ts`、`google/code/route.ts`、`logout/route.ts`——服务端调对应 Nest 接口，读响应后 `Set-Cookie` / 清 cookie，响应体只回 `{user}`（token 不出 httpOnly）。

> 实现期需验证：`proxy.ts` 对**外部 URL rewrite + 注入请求头**的支持（既往该套已跑通，作为前置假设）。

### 谷歌登录全链路

```
[按钮] window.location = /api/auth/google
  → proxy.ts rewrite → Nest GET /auth/google → @Redirect() 到 Google 同意页
     (consent URL 由 Nest 用 client_id + redirect_uri + scope + signState() 构造)
  → Google 302 回 http://localhost:3001/auth/google?code=xxx&state=yyy   (Next 页面)
  → 页面 POST /api/auth/google/code {code,state}                          (Next route handler)
       → 服务端转发 Nest POST /auth/google {code,state}
            → verifyState(state) → exchangeCode(code) → verifyIdToken
            → AccountIdentityService.findOrCreateByGoogle(profile)
            → signResponse(account) → {accessToken,user}
       → route handler Set-Cookie(httpOnly) + 回 {user}
  → 页面写 currentUserAtom + router.push("/")
```

state 由 `GET /auth/google`（Nest）签发 → 经 Google 回 Next 页面 → Next 转发进 `POST /auth/google` body → 同一 Nest secret 验签，闭环一致。

## 4. 后端数据模型 + Service 层（`libs/account`）

### 实体

- `Account`（改）：`password_hash` → `nullable: true`（谷歌-only 用户无密码）。
- `AccountIdentity`（新增，表 `account_identity`）：

| 列 | 类型 | 说明 |
|----|------|------|
| `id` | uuid pk | `gen_random_uuid()` |
| `provider` | varchar(32) | `"google"`（为将来 GitHub/Apple 预留） |
| `provider_account_id` | varchar(255) | Google `sub` |
| `account_id` | uuid | 逻辑外键（不建库级 FK），建索引 |
| `created_at` / `updated_at` | timestamptz | |

约束：`UNIQUE(provider, provider_account_id)` + `INDEX(account_id)`。

### 迁移（单文件，幂等）

- `ALTER TABLE account ALTER COLUMN password_hash DROP NOT NULL;`
- `CREATE EXTENSION IF NOT EXISTS pgcrypto;`
- `CREATE TABLE IF NOT EXISTS account_identity (...)`（uuid 默认 `gen_random_uuid()`，列名 snake_case）；
- 建 `UNIQUE(provider, provider_account_id)` 与 `INDEX(account_id)`（新表为空，普通建索引，不用 CONCURRENTLY）。

### Service（`AccountModule` 改 `TxTypeOrmModule.forFeature([Account, AccountIdentity])`，导出两个 service）

- `UserService`（`Account` 归属，新增）：
  - `findByEmail(email): Promise<Account | null>`
  - `createSocialAccount({ email, displayName }): Promise<Account>`（单表 insert，`password_hash = null`，无需 `@Transactional`）
- `AccountIdentityService`（`AccountIdentity` 唯一归属，`@InjectRepository(AccountIdentity)`）：
  - `findByProviderAccount(provider, sub): Promise<AccountIdentity | null>`
  - `createIdentity(accountId, provider, sub): Promise<AccountIdentity>`（单表 insert）
  - **`findOrCreateByGoogle(profile): Promise<Account>`** —— 跨两表写，挂 **`@Transactional()`**（public，命名约定不强制）；调 `UserService` 方法（不注对方 Repository），tx 经 `AsyncLocalStorage` 传播：

```
1. id = findByProviderAccount("google", sub)
     命中 → return UserService.findById(id.accountId)            // 老用户（findById 为 null 抛 ACCOUNT_NOT_FOUND）
2. acc = email ? UserService.findByEmail(email) : null
     acc 存在:
        email_verified=true  → createIdentity(acc.id,…) → return acc        // 自动关联
        email_verified=false → throw GOOGLE_EMAIL_UNVERIFIED               // 不关联也不能撞唯一邮箱
     acc 不存在:
        acc = createSocialAccount({ email, displayName: name })
        createIdentity(acc.id, "google", sub) → return acc                 // 新用户
```

### 错误码（account 区段 1000-1999，接 1003 连续无 gap）

- `1003 GOOGLE_EMAIL_UNVERIFIED`（`account.googleEmailUnverified`，HTTP 409）
- `1004 GOOGLE_OAUTH_FAILED`（换 code / 验 id_token 失败，HTTP 401）
- `1005 GOOGLE_STATE_INVALID`（state 验签失败，HTTP 400）

## 5. 后端端点 + 配置 + `GoogleOAuthService`（`apps/server`）

### 配置（`app-config.schema.ts`，新增 `oauth` 切片，整体可选→dev 不配也能启动，用到才校验）

```ts
GoogleOAuthConfigSchema = z.object({
  clientId: z.string(),
  clientSecret: z.string(),
  redirectUri: z.string().url(),                 // = http://localhost:3001/auth/google（Next 页面）
  scopes: z.array(z.string()).default(["openid", "email", "profile"]),
});
// AppConfigSchema 增: oauth: z.object({ google: GoogleOAuthConfigSchema }).optional()
```

`application.yml` / Nacos 增 `oauth.google.*`；凭证不进环境变量（沿用项目配置法），本地写 `application.local.yml`（gitignore）。

### `GoogleOAuthService`（`apps/server/src/auth`，无 DB；注入 `APP_CONFIG` + 复用 `JwtService`）

- `buildConsentUrl()`：`new OAuth2Client(clientId, clientSecret, redirectUri).generateAuthUrl({ scope, state: signState(), prompt: "select_account" })`。
- `signState() / verifyState(state)`：用 `JwtService` 签 10min 短 JWT（`{ t: "oauth_state" }`），验失败抛 `GOOGLE_STATE_INVALID`。无状态、不引 Redis。
- `exchangeCode(code): Promise<GoogleProfile>`：`client.getToken(code)` → `client.verifyIdToken({ idToken, audience: clientId })` → 取 `{ sub, email, emailVerified, name }`；失败抛 `GOOGLE_OAUTH_FAILED`。

### 端点（`AuthController`）

- `GET /auth/google`（`@Public()`）→ `@Redirect()` 到 `buildConsentUrl()`。注意全局 `ResponseInterceptor` 会包 envelope，该端点需标 `@SkipResponseEnvelope` 让 302 裸返回。
- `POST /auth/google`（`@Public()` + 限流）→ body `{ code, state }`：`verifyState(state)` → `exchangeCode(code)` → `AccountIdentityService.findOrCreateByGoogle(profile)` → 复用现有 `signResponse(account)` → 回 `AuthResponse`。（由 Next `/api/auth/google/code` 服务端对服务端调用。）
- `GET /auth/profile`（authed，**补齐缺口**）→ `UserService.findById(@CurrentUser().userId)` → `toProfile` → `AccountDto`（不存在抛 `ACCOUNT_NOT_FOUND`）。
- `GET /auth/ws-ticket`（authed）→ `jwt.sign({ userId, email, t: "ws" }, { expiresIn: "60s" })` → 回 `{ ticket }`。

### DTO / 依赖

- `libs/types` 增 `GoogleCodeSchema { code, state }` → `createI18nZodDto` 成 `GoogleCodeDto`；响应复用 `AuthResponseDto`。
- 新依赖 `google-auth-library`。
- `AuthModule` providers 增 `GoogleOAuthService`；已 import `AccountModule`，补导出 `AccountIdentityService`。
- 谷歌**不**使用 `passport-google-oauth20`（不安装）；`@nestjs/passport` + `passport-jwt` 继续负责 JWT。

## 6. 前端代理层 + Cookie + 客户端改造（`apps/web` + `@qriter/web-common`）

### Cookie 形态

`qriter_token`：`httpOnly` + `sameSite:"lax"` + `path:"/"` + `secure`（仅 prod）+ `maxAge` = JWT 有效期（7d）。仅由 Next route handler 写 / 清。

### `proxy.ts`（见 §3）+ 4 个 cookie route handler

- `app/api/auth/login/route.ts`、`register/route.ts`：调 Nest 对应接口拿 `{accessToken,user}` → `Set-Cookie` + 回 `{user}`。
- `app/api/auth/google/code/route.ts`：POST `{code,state}` → Nest `POST /auth/google` → `Set-Cookie` + 回 `{user}`。
- `app/api/auth/logout/route.ts`：清 cookie（Nest 无 session，无需通知）。

### 页面 / 客户端

- 新增 `/auth/google` 页面（client）：读 `code`/`state` → POST `/api/auth/google/code` → 成功写 `currentUserAtom` + `router.push("/")`；失败显错 + 回 `/login`；换码期间转圈。
- 登录页：加「Sign in with Google」按钮 → `window.location.href = "/api/auth/google"`（整页跳，非 axios）；密码表单不变，仅打到 `/api/auth/login`。
- `@qriter/web-common` `apiClient`：
  - `baseURL` 由 `http://127.0.0.1:3000` → **同源相对**（`/`）；
  - **删除**「localStorage 注入 Bearer」请求拦截器，加 `withCredentials: true`；
  - 删 `setAccessToken / getAccessToken / clearAccessToken`；401 仍跳 `/login`。
- atoms / `AuthGuard`：
  - 删 `accessTokenAtom`；`isAuthenticatedAtom` 重写为 `currentUserAtom != null` 派生；
  - `AuthGuard` 由「同步查 token」改「启动时拉 `/api/auth/profile`」：loading→splash，200→写 `currentUser` 放行，401→跳 `/login`。

## 7. WS Ticket 流

- 浏览器 `GET /api/auth/ws-ticket`（经 `proxy.ts`，cookie→Bearer）→ Nest 返回 60s 短 ticket（同 secret 签的短 JWT，`t:"ws"`）。
- WS 中间件**基本不动**：现有 `createWsJwtMiddleware` 的 `jwt.verify(token)` 直接能验 ticket（可选加 `t==="ws"` 校验）。
- 前端 socket.io 客户端（Agent 会话）连接前先取 ticket → `io(NEST_WS_URL, { auth: { token: ticket } })`；过期/重连时重取。WS 仍直连 Nest `:3000`（gateway 已 `cors:true`）。

## 8. 跨切面

- **i18n**：错误码 3 条文案进 server `i18n/{zh,en}/account.json`；前端「Sign in with Google」、`/auth/google` 加载/失败文案走 next-intl（zh/en），无裸串；跑 `pnpm sync:locales`。
- **凭证**：Google Cloud Console 建 Web OAuth client，Authorized redirect URI = `http://localhost:3001/auth/google`（+ prod 域）；clientId/secret 写 Nacos / `application.local.yml`。

## 9. 测试（TDD 先行）

- `libs/account` 单测：
  - `AccountIdentityService.findOrCreateByGoogle` 四分支（老 identity / 验证邮箱关联 / 未验证拒绝 / 新建）；
  - `UserService.createSocialAccount` + `findByEmail`。
- `GoogleOAuthService` 单测：`signState/verifyState`（有效 / 过期 / 篡改）；`exchangeCode`（mock `OAuth2Client`）。
- e2e（server，含 Postgres）：`POST /auth/google`（mock Google 通过 / state 失效 400 / 未验证撞邮箱 409）；`GET /auth/profile`（authed / 401）；`GET /auth/ws-ticket`（authed / 401）。
- 前端：4 个 cookie route handler 的 set/clear 行为。
- 静态围栏：`pnpm check`（`check:tx` 覆盖新 `@Transactional`、`check:repo` 覆盖新实体归属、`check:error-code` 覆盖 1003-1005 连续）。

## 10. 上线 / 迁移顺序

1. **后端先行**：迁移（`password_hash` nullable + `account_identity`）→ 部署 Nest（新端点 + `profile` + `ws-ticket`），向后兼容（老 Bearer 仍可用）。
2. **前端切换**：`proxy.ts` + 4 个 cookie handler + apiClient 同源 + `AuthGuard` 改 profile 驱动，一次切到 cookie。切换瞬间老用户 localStorage token 失效 → 重新登录一次（可接受；一次性 token→cookie 迁移按 YAGNI 默认不做）。

## 11. 非目标（YAGNI）

- 「设置里手动绑定/解绑 Google」入口（本次只做登录时自动关联）。
- 多 OAuth provider（GitHub/Apple）—— `account_identity` 已为其预留结构，但本次只接 Google。
- localStorage→cookie 的无感迁移（切换时要求重登一次）。
- refresh token / 滑动续期（沿用现有单 access token + 7d 过期）。
