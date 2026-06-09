# GitHub OAuth 登录 设计 Spec

- 日期：2026-06-10
- 状态：已评审（逐节确认），待拆实现 plan
- 范围：把登录页已有的 **GitHub 占位图标按钮做成真登录**（GitHub OAuth）。镜像现有 Google OAuth 流程与账号基建。
- 关系：源自「登录改版」brainstorm 拆出的后续 cycle（当时定 GitHub 镜像 Google）。微信扫码是再下一个 cycle。

## 0. 复用与差异

**复用**（与 Google 一致）：httpOnly cookie + Next `proxy` / cookie route-handler 传输、`(auth)` split-brand 登录页 + 社交图标行、`account_identity` 表、`AuthController.signResponse` 签 JWT、JWT 签名的无状态 state。

**与 Google 的关键差异**：
1. **GitHub 无 OIDC id_token** —— 纯 OAuth2：换 `access_token` 后调 GitHub API 取用户（不验 id_token，不用 `google-auth-library`，用原生 `fetch`，**不引 @octokit**）。
2. **GitHub 邮箱常私有** —— `GET /user` 不一定给 email，需 `user:email` scope 调 `GET /user/emails` 取 **primary && verified** 邮箱。
3. 取不到主验证邮箱 → **报错挡住**（不兜底建号），保持账号体系以邮箱为锚（与 Google / 邮箱验证码登录一致）。

## 1. 后端 `GitHubOAuthService`（apps/server/src/auth，无 DB，镜像 GoogleOAuthService）

- 构造注入 `APP_CONFIG`（取 `config.oauth?.github`）+ `JwtService`；未配 `oauth.github` 时各方法抛 `GITHUB_OAUTH_FAILED`。
- `signState()` / `verifyState(state)`：JWT 短时效 state（同 Google 模式；marker 区分，如 `github_oauth_state`），验签失败抛 `GITHUB_STATE_INVALID`。
- `buildConsentUrl()`：拼 `https://github.com/login/oauth/authorize?client_id=…&redirect_uri=…&scope=<read:user user:email>&state=<签名JWT>&allow_signup=true`。
- `exchangeCode(code)`：
  1. `POST https://github.com/login/oauth/access_token`（`Accept: application/json`，body `{client_id, client_secret, code, redirect_uri}`）→ `access_token`。
  2. `GET https://api.github.com/user`（headers：`Authorization: Bearer <token>`、`User-Agent: qriter`、`Accept: application/vnd.github+json`）→ `{ id, login, name }`。
  3. `GET https://api.github.com/user/emails` → 选 `primary === true && verified === true` 的 `email`；**无则抛 `GITHUB_NO_VERIFIED_EMAIL`**。
  4. 归一化返回 `SocialProfile`：`{ provider: "github", sub: String(id), email, emailVerified: true, name: name || login }`。
  - 任一步 HTTP / 解析失败 → `GITHUB_OAUTH_FAILED`。

## 2. 账号 find-or-create（泛化复用）

把 `AccountIdentityService.findOrCreateByGoogle` **泛化为 `findOrCreateBySocial(profile: SocialProfile)`**：
- `SocialProfile.provider` 从字面量 `"google"` 改为联合 `"google" | "github"`。
- 逻辑不变：按 `(provider, sub)` 命中既有身份 → 登录该账号；否则按**已验证邮箱**关联既有账号（仅 `emailVerified` 才关联，防越权绑定）或新建无密码账号 + 落 `account_identity`。`@Transactional`（跨 account_identity + account 两表）不变。
- Google 回调改调 `findOrCreateBySocial`（行为等价）。
- GitHub 因为在 `exchangeCode` 阶段已保证 primary-verified 邮箱（否则抛 `GITHUB_NO_VERIFIED_EMAIL`），到这里必有 `emailVerified: true`，故同邮箱关联天然安全。
- 「按邮箱无账号且 email 缺失」「关联但邮箱未验证」两个内部 guard 的错误码处理在 plan 定（GitHub 路径不会触达，因更早已抛 GITHUB_*；保持现有 Google 语义即可）。

## 3. 端点（`apps/server/src/rest/auth.controller.ts`，镜像 google）

- `GET /auth/github`（`@Public` `@SkipResponseEnvelope` `@Redirect`）→ `{ url: githubOAuth.buildConsentUrl() }`。
- `POST /auth/github`（`@Public` `@Throttle`，body `GithubCodeDto {code, state}`）→ `verifyState` + `exchangeCode` + `findOrCreateBySocial` + `signResponse`（返回 `AuthResponse`）。
- DTO：`GithubCodeDto`（与 `GoogleCodeDto` 同形：`{code, state}`，走 `libs/types` schema + `createI18nZodDto`）。可与 Google 共用一个 `OAuthCodeSchema`（plan 定是否合并）。
- controller 注入 `GitHubOAuthService`。

## 4. 配置（Nacos `oauth.github`，与 `google` 并列）

`OAuthConfigSchema` 加 `github` 可选切片（mirror `GoogleOAuthConfigSchema`）：
```yaml
oauth:
  github:
    client-id: xxx            # kebab-case 现已自动转 camel
    client-secret: xxx
    redirect-uri: http://localhost:3001/auth/github
    # scopes 默认 [read:user, user:email]
```
未配 → 端点抛 `GITHUB_OAUTH_FAILED`（同 Google 未配行为）。

## 5. 错误码（account 区段 1000–1999，接 1008 后连续）

`GITHUB_OAUTH_FAILED`（1009，401）/ `GITHUB_STATE_INVALID`（1010，400）/ `GITHUB_NO_VERIFIED_EMAIL`（1011，409）+ server i18n（`apps/server/i18n/{zh,en}/account.json`）。

## 6. 前端（镜像 google）

- 登录页 `(auth)/login/page.tsx`：**GitHub 占位图标按钮改真** —— `onClick → window.location.href = "/api/auth/github"`（去掉它的 `comingSoon` toast）。**微信仍占位**。
- 新建回调页 `app/(auth)/auth/github/page.tsx`：镜像 `/auth/google` —— 从 URL 取 `code` + `state` → `POST /api/auth/github/code {code,state}` → 写 `currentUserAtom` → `router.replace("/")`；失败提示。
- 新 cookie route handler `app/api/auth/github/code/route.ts`：`proxyAndSetCookie("/api/auth/github", body)`。
- `proxy.ts` 的 `COOKIE_ROUTES` 加 `/api/auth/github/code`；`GET /api/auth/github`（无 cookie）走透明代理 302 到 GitHub。
- i18n：回调页/按钮可见串走 key（`auth.loginWithGithub` 已有；新增 `auth.githubLoginFailed` 等）。

## 7. 边界 / 非目标

- 微信扫码登录（下一个 cycle）。
- GitHub 身份解绑 / 一个账号多身份管理 UI。
- GitHub Enterprise（仅 github.com）。
- 找回密码、邮件模板等无关项。

## 8. 测试

- 后端 e2e：**mock GitHub 的三个 HTTP**（`access_token` / `/user` / `/user/emails`）—— GitHubOAuthService 用 `fetch`，e2e 注入一个假 fetch / 用一个可替换的 HTTP 边界，断言 `POST /auth/github` 走通 find-or-create + cookie；并覆盖 `GITHUB_NO_VERIFIED_EMAIL`、`GITHUB_STATE_INVALID`、未配 `GITHUB_OAUTH_FAILED`。state 验签用例。
- 前端 `pnpm --filter @qriter/web build` 冒烟（回调页 + route handler 编译）。
- 围栏全绿（check:error-code 1009-1011 连续、check:repo）、sync:locales 对齐、typecheck。

## 9. 外部依赖（落地前提）

**GitHub OAuth App**（GitHub → Settings → Developer settings → OAuth Apps → New OAuth App）：拿 `Client ID` + `Client Secret`，**Authorization callback URL = `http://localhost:3001/auth/github`**（上线再加生产回调）。免费。配进 Nacos `oauth.github`。未配时功能可编译、端点抛 `GITHUB_OAUTH_FAILED`（与 Google 一致，不阻塞开发/构建）。

## 10. 成功标准

- 登录页 GitHub 图标按钮 → 跳 GitHub 授权 → 回 `/auth/github` 换码 → 按 GitHub 身份 find-or-create（同邮箱关联既有账号、否则建无密码号）→ 落 httpOnly cookie，刷新仍登录。
- 无主验证邮箱 → 友好报错（`GITHUB_NO_VERIFIED_EMAIL`），不建脏账号。
- 未配 `oauth.github` 时构建/启动正常，端点报 `GITHUB_OAUTH_FAILED`。
- 围栏 / typecheck / i18n / web build / 后端 e2e 全绿。
