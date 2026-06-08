# 邮箱验证码登录 + 登录页改版 设计 Spec

- 日期：2026-06-08
- 状态：已评审（逐节确认），待拆实现 plan
- 范围：把登录页主表单从「邮箱 + 密码」改为「**邮箱验证码（OTP）登录**」，并重排登录页（分割线 + 紧凑社交图标行）。新增邮箱验证码后端（发码 / 验码 / 免密 find-or-create）。
- 复用：现有 httpOnly cookie + Next proxy/route-handler 鉴权传输；`account_identity` + `findByEmail` / `createSocialAccount` 账号基建；Google OAuth 不动。

## 0. 拆分说明（本轮范围）

原始诉求含 4 件，后 3 件各有外部依赖、各自独立成 cycle。**本 spec 只做：邮箱验证码登录（#1）+ 登录页视觉（#4）**。
- **GitHub OAuth 登录** —— 后续单独 spec（镜像 Google）。
- **微信扫码登录** —— 后续单独 spec（需微信开放平台企业资质 + 备案域名，最重）。
- 本轮 GitHub / 微信只做**占位社交图标按钮**（点击 toast「即将开放」）。

## 1. 登录页布局（沿用「精修扁平暖纸」设计语言）

单卡、单步（邮箱 + 验证码同屏，不分两屏）。结构（在既有 `(auth)` split-brand 右侧 slot 内）：

```
登录                              ← eyebrow + 宋体标题（精修字阶）
用邮箱验证码登录                   ← 副标题

邮箱
[ you@example.com            ]
验证码                [发送验证码]   ← 发送后变「重发(59s)」倒计时
[ 6 位验证码 ]
[            登录            ]      ← 陶土主按钮：验证→登录

──────────  或  ──────────         ← 分割线（发丝线 + 居中「或」）

      (G)   (GH)   (微)            ← 紧凑社交图标行（居中一排图标按钮）
```

- **OTP 表单**：邮箱 `Input` + 验证码 `Input`（6 位）+ 验证码行右侧「发送验证码」按钮（发送成功后 60s 倒计时禁用、显示「重发(Ns)」）+ 「登录」陶土主按钮。提交=验证码登录。
- **密码表单移除**（不再出现在登录页）。
- **分割线**：发丝线居中嵌「或」（i18n）。
- **社交区 = 紧凑图标行**：一排（居中）3 个图标按钮 —— **Google**（品牌 SVG，真可用，沿用现有 `window.location.href="/api/auth/google"`）、**GitHub**（品牌 SVG，占位）、**微信**（品牌 SVG，占位）。占位按钮点击 → `toast`「即将开放」（i18n）。图标按钮：方形/圆角、发丝边、hover 暖底（套 Block A 组件气质），各带 `aria-label` + `title`。
- 组件复用 `@qriter/design`（Input/Button/toast）+ 既有 `Form`/`useSchema` 或受控 state（见 §4）。

## 2. 后端：邮箱验证码

### 2.1 邮件发送（EmailSender 端口 + 阿里云 DirectMail SMTP）
- 在 `@qriter/common`（或 server）定义 **`EmailSender` 端口**（`sendCode(to, code)` / `send(to, subject, text)`）。
- 实现 **`SmtpEmailSender`**：`nodemailer` 指向**阿里云邮件推送 (DirectMail) SMTP**（`smtpdm.aliyun.com:465` SSL）。凭证走 **Nacos `config.email`**：`host` / `port` / `secure` / `user`（发信地址）/ `pass`（SMTP 密码）/ `from`。
- **未配 `config.email` → 日志兜底**（`LogEmailSender`：把验证码 `WARN` 打到 server 日志）。镜像 Google OAuth 的「未配则降级」模式，**不阻塞本地开发**。
- 依赖新增：`nodemailer`（+ `@types/nodemailer`）。**不引阿里云 SDK**（走标准 SMTP）。

### 2.2 OTP（redis）
- 6 位数字码；存 redis（复用 `RedisCacheProvider` / `Cache` 基建）：键 `otp:login:<email小写>` → `{codeHash, attempts}`，**TTL 5min**。
- 安全：码以 hash 存（不存明文）；**重发冷却 60s**（键 `otp:cooldown:<email>` 60s）；**校验失败 ≤5 次**（超限删码、提示重新获取）；发送限频（同邮箱 60s = 冷却键；可选同 IP 适度限频）。

### 2.3 端点（`apps/server/src/rest/auth.controller.ts`，均 `@Public()`）
- `POST /auth/email/code` `{ email }` → `EmailOtpService.sendCode(email)`：冷却校验 → 生成码 → 存 redis → 发邮件（或日志）→ 返回 `{ ok: true }`（**不泄露邮箱是否已注册**，防枚举）。
- `POST /auth/email/login` `{ email, code }` → 校验码（存在/未过期/未超限/匹配）→ **find-or-create by email**（`findByEmail`；无则 `createSocialAccount({email, displayName: email 前缀})` 建免密号）→ 删码 → 签 JWT → 返回 `AuthResponse`（`{accessToken, user}`，与 login/google 同形）。错误抛对应 `AppError`（见 §2.4）。
- DTO：`SendEmailCodeDto`（email）/ `EmailLoginDto`（email + code）走 `libs/types` schema + `createI18nZodDto`。
- 编排放 **`EmailOtpService`**（**server auth 模块**，与 `GoogleOAuthService` 同层：需 redis/Cache + EmailSender + `UserService`）。只编排 OTP（redis）+ 邮件 + 调 `UserService.findByEmail` / `createSocialAccount` 完成 find-or-create；**不直接注入 Account Repository**（遵守 check:repo）。邮箱 OTP **不写 `account_identity` 行**（email 即账号字段，非第三方 provider）。

### 2.4 错误码（account 区段 1000–1999，连续无 gap）
新增（在 `AccountErrorCode` 末尾连续追加）：`EMAIL_CODE_COOLDOWN`（发送过于频繁，429）、`EMAIL_CODE_INVALID`（验证码错误/过期，400/401）、`EMAIL_CODE_TOO_MANY_ATTEMPTS`（超限，429）。i18n 文案进 `apps/server/i18n/{zh,en}/account.json`。

## 3. 前端传输（沿用现有模式）
- `POST /api/auth/email/code` → **proxy 透明转发**到 Nest（无 cookie）。
- `POST /api/auth/email/login` → **新 cookie route handler**（`apps/web/src/app/api/auth/email/login/route.ts`），复用 `proxyAndSetCookie("/api/auth/email/login", body)`：调 Nest、`Set-Cookie` httpOnly、响应回 `{user}`。
- `apps/web/src/proxy.ts` 的 `COOKIE_ROUTES` 加 `/api/auth/email/login`（让它走 route handler 而非透明代理）。
- `apps/web/src/rest/auth.ts` 加 `sendEmailCode(email)` / `useEmailLogin()`（mutation，成功写 `currentUserAtom` + 跳 `/`）。

## 4. 账号语义
- **免密 find-or-create by email**：验证码登录对新邮箱**自动建号即登录**，已有邮箱直接登录。
- 密码端点（`register` / `login`）**保留不动**（仅登录页 UI 不再展示密码表单）。
- 邮箱验证码账号 = 无密码账号（`createSocialAccount`，passwordHash 空），与 Google 同邮箱天然同账号（按 email 命中）。

## 5. 边界 / 非目标
- GitHub OAuth、微信扫码（各自后续 cycle；本轮仅占位按钮）。
- 找回密码 / 改密码、邮件 HTML 模板美化（先纯文本验证码）、多设备登录管理。
- 验证码短信通道。

## 6. i18n / 测试
- 所有新可见串走 next-intl key（`auth.*` 扩：`emailLoginTitle` / `sendCode` / `resendIn` / `codeLabel` / `codePlaceholder` / `or` / `socialComingSoon` / `loginWithGithub` / `loginWithWechat` 等）。`pnpm sync:locales -- --check` 必过。
- 后端 e2e（含 redis）：发码（返回 ok + redis 落码）→ 验码登录（find-or-create + cookie/accessToken）→ 错码 / 过期 / 超限 / 冷却限频 各分支；日志兜底路径（无 SMTP 配置时不报错、码进日志）。
- 前端 `pnpm --filter @qriter/web build` 冒烟。

## 7. 成功标准
- 登录页主表单为邮箱验证码（单步），分割线 + 紧凑社交图标行（Google 真用、GitHub/微信占位）。
- 发码 → 收码（邮件或日志）→ 验码 → 新邮箱自动建号登录 / 老邮箱登录，落 httpOnly cookie，刷新仍登录。
- 未配 SMTP 时本地可全程跑通（码看日志）；配了 Nacos `config.email` 后走真实阿里云 DirectMail。
- 围栏全绿（check:repo / check:error-code 等）、i18n 对齐、typecheck、web build 通过、后端 e2e 通过。
