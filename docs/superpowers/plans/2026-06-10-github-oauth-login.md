# GitHub OAuth 登录 实现 Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把登录页已有的 GitHub 占位按钮做成真 OAuth 登录，镜像现有 Google 流程与账号基建。

**Architecture:** 新增 `GitHubOAuthService`（纯 `fetch`，无 octokit：换 token → `/user` → `/user/emails` 取主验证邮箱）+ 两个 `@Public` 端点；把 `findOrCreateByGoogle` 泛化为 `findOrCreateBySocial`（provider 联合）；把 `GoogleCodeSchema/Dto` 改名为 provider 中性的 `OAuthCodeSchema/Dto`（两 provider 共用）；前端把占位按钮接真 + 回调页 + cookie route handler。

**Tech Stack:** NestJS · 原生 fetch（Node 22）· zod/`createI18nZodDto` · JWT state · Next 16 · next-intl。

**前置 spec：** `docs/superpowers/specs/2026-06-10-github-oauth-login-design.md`。

**关键约定：**
- **绝不** `git add .claude/settings.json`。当前分支 main —— 执行时先开 feature 分支。
- 错误码连续无 gap（account 1000-1999，现用到 1008，新增 1009/1010/1011）—— `check:error-code`。
- Controller 禁注 Repository；`GitHubOAuthService` 无 DB（不注 Repo）—— `check:repo`。
- find-or-create 跨表写 `@Transactional` 已在 `findOrCreateByGoogle`，泛化后保留。
- 所有可见串走 next-intl key；server + web i18n 都补；`pnpm sync:locales -- --check` 必过。
- commit conventional（type 英文 / body 中文）+ `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`。
- **每个 commit 保持 typecheck 绿** —— 改名 / 泛化的「破坏点」与「修复点」放同一 commit（见 Task 3/4）。

---

## 文件结构

**后端**
- Modify `apps/server/src/config/app-config.schema.ts` — `GithubOAuthConfigSchema` + `oauth.github`
- Modify `libs/types/src/account/account.schema.ts` + `libs/types/src/index.ts` — `GoogleCodeSchema` → `OAuthCodeSchema`（+ 类型）
- Modify `libs/account/src/dto/index.ts` — `GoogleCodeDto` → `OAuthCodeDto`
- Modify `libs/account/src/services/account-identity.service.ts` — `findOrCreateByGoogle` → `findOrCreateBySocial` + `SocialProfile.provider` 联合
- Modify `libs/account/src/errors/account.error-codes.ts` + `apps/server/i18n/{zh,en}/account.json` — 3 个 GitHub 错误码
- Create `apps/server/src/auth/github-oauth.service.ts` — GitHubOAuthService
- Modify `apps/server/src/auth/auth.module.ts` — provide/export GitHubOAuthService
- Modify `apps/server/src/rest/auth.controller.ts` — DTO 改名 + google 改调 findOrCreateBySocial + GitHub 两端点
- Create `apps/server/test/e2e/github-auth.spec.ts` — e2e（真 service + mock fetch）

**前端**
- Modify `apps/web/src/proxy.ts` — `COOKIE_ROUTES` 加 `/api/auth/github/code`
- Create `apps/web/src/app/api/auth/github/code/route.ts` — cookie route handler
- Create `apps/web/src/app/(auth)/auth/github/page.tsx` — 回调页（镜像 google）
- Modify `apps/web/src/app/(auth)/login/page.tsx` — GitHub 按钮接真
- Modify `apps/web/messages/{zh,en}.json` — `auth.githubLoginFailed`

---

## Task 1：config `oauth.github` 切片

**Files:** Modify `apps/server/src/config/app-config.schema.ts`

- [ ] **Step 1: 加 GithubOAuthConfigSchema + oauth.github**

在 `GoogleOAuthConfigSchema` 之后加：
```ts
/** GitHub OAuth 配置（可选）。未配置则 GitHub 登录端点抛 GITHUB_OAUTH_FAILED。 */
export const GithubOAuthConfigSchema = z.object({
  clientId: z.string(),
  clientSecret: z.string(),
  /** = 前端回调页地址，如 http://localhost:3001/auth/github。 */
  redirectUri: z.string().url(),
  scopes: z.array(z.string()).default(["read:user", "user:email"]),
});
```
`OAuthConfigSchema` 改为（加 `github` 可选，`google` 保持）：
```ts
export const OAuthConfigSchema = z.object({
  google: GoogleOAuthConfigSchema.optional(),
  github: GithubOAuthConfigSchema.optional(),
});
```
> 注意：原 `OAuthConfigSchema` 的 `google` 是必填；改为 `.optional()`，让只配 github（或都不配）也合法。`oauth` 整体本就 `.optional()`。
末尾加类型导出：`export type GithubOAuthConfig = z.infer<typeof GithubOAuthConfigSchema>;`。

- [ ] **Step 2: 类型 + Commit**

Run: `pnpm --filter @qriter/server typecheck`
Expected: 通过（`google` 变 optional 后，`GoogleOAuthService` 里 `config.oauth?.google ?? null` 仍成立）。
```bash
git add apps/server/src/config/app-config.schema.ts
git commit -m "feat(server): config 加 oauth.github 切片（GitHub OAuth）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2：account 错误码（1009-1011）+ server i18n

**Files:** Modify `libs/account/src/errors/account.error-codes.ts`、`apps/server/i18n/{zh,en}/account.json`

- [ ] **Step 1: 加 3 个错误码（接 1008 后连续）**

`AccountErrorCode` 的 `defineErrorCode({...})` 内、`EMAIL_CODE_TOO_MANY_ATTEMPTS`（1008）之后追加：
```ts
  /** GitHub 换 code / 取用户失败（或 oauth.github 未配置）。 */
  GITHUB_OAUTH_FAILED: {
    code: 1009,
    message: "account.githubOauthFailed",
    httpStatus: 401,
  },

  /** GitHub OAuth state 验签失败（过期 / 篡改 / 标记不符）。 */
  GITHUB_STATE_INVALID: {
    code: 1010,
    message: "account.githubStateInvalid",
    httpStatus: 400,
  },

  /** GitHub 账号无「主 + 已验证」邮箱，无法登录。 */
  GITHUB_NO_VERIFIED_EMAIL: {
    code: 1011,
    message: "account.githubNoVerifiedEmail",
    httpStatus: 409,
  },
```

- [ ] **Step 2: server i18n**

`apps/server/i18n/zh/account.json` 加：
```json
  "githubOauthFailed": "GitHub 登录失败，请重试",
  "githubStateInvalid": "GitHub 登录校验失败，请重试",
  "githubNoVerifiedEmail": "你的 GitHub 没有已验证的主邮箱，请先在 GitHub 验证邮箱或改用其他方式登录"
```
`apps/server/i18n/en/account.json` 加：
```json
  "githubOauthFailed": "GitHub sign-in failed, please try again",
  "githubStateInvalid": "GitHub sign-in verification failed, please try again",
  "githubNoVerifiedEmail": "Your GitHub has no verified primary email; please verify it on GitHub or sign in another way"
```
（注意把原文件最后一个键补逗号，保持合法 JSON。）

- [ ] **Step 3: 围栏 + Commit**

Run: `pnpm check:error-code`
Expected: `DUPLICATE_CODE 0 / OUT_OF_RANGE 0 / GAP 0`（1009-1011 连续）。
```bash
git add libs/account/src/errors/account.error-codes.ts apps/server/i18n
git commit -m "feat(account): GitHub OAuth 3 个错误码（1009-1011）+ server i18n

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3：`GoogleCodeSchema/Dto` → 中性 `OAuthCodeSchema/Dto`（原子改名）

**Files:** Modify `libs/types/src/account/account.schema.ts`、`libs/types/src/index.ts`、`libs/account/src/dto/index.ts`、`apps/server/src/rest/auth.controller.ts`

两 provider 共用一个 `{code,state}` schema。**改名的破坏点 + 修复点放同一 commit，保证 typecheck 绿。**

- [ ] **Step 1: types schema 改名**

`account.schema.ts` 把 `GoogleCodeSchema` / `GoogleCodeInput` 改为：
```ts
/** OAuth 授权码回调入参（Google / GitHub 共用：换 code 时带回签名 state）。 */
export const OAuthCodeSchema = z.object({
  code: z.string().min(1, { message: "validation.required" }),
  state: z.string().min(1, { message: "validation.required" }),
});

export type OAuthCodeInput = z.infer<typeof OAuthCodeSchema>;
```
`libs/types/src/index.ts` 把导出的 `GoogleCodeSchema` / `type GoogleCodeInput` 改为 `OAuthCodeSchema` / `type OAuthCodeInput`。

- [ ] **Step 2: account DTO 改名**

`libs/account/src/dto/index.ts`：import 把 `GoogleCodeInput, GoogleCodeSchema` 改 `OAuthCodeInput, OAuthCodeSchema`；DTO 改：
```ts
// biome-ignore lint/suspicious/noUnsafeDeclarationMerging: intentional class+interface merge to expose zod-inferred fields
export class OAuthCodeDto extends createI18nZodDto(OAuthCodeSchema) {}
export interface OAuthCodeDto extends OAuthCodeInput {}
```

- [ ] **Step 3: controller 引用改名（同 commit）**

`apps/server/src/rest/auth.controller.ts`：import 的 `GoogleCodeDto` 改 `OAuthCodeDto`；`googleCallback(@Body() dto: GoogleCodeDto)` 改 `OAuthCodeDto`；`@ApiBody({ type: GoogleCodeDto })` 改 `OAuthCodeDto`。

- [ ] **Step 4: 类型 + Commit（一次性）**

Run: `pnpm typecheck`
Expected: 全包通过（改名闭环：types + account dto + controller 同 commit）。
```bash
git add libs/types/src/account/account.schema.ts libs/types/src/index.ts libs/account/src/dto/index.ts apps/server/src/rest/auth.controller.ts
git commit -m "refactor: GoogleCodeSchema/Dto → 中性 OAuthCodeSchema/Dto（Google/GitHub 共用）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4：泛化 `findOrCreateByGoogle` → `findOrCreateBySocial`（原子）

**Files:** Modify `libs/account/src/services/account-identity.service.ts`、`apps/server/src/rest/auth.controller.ts`

- [ ] **Step 1: 改 SocialProfile.provider 联合 + 方法改名**

`account-identity.service.ts`：
- `SocialProfile.provider` 从 `"google"` 改为 `"google" | "github"`：
```ts
export interface SocialProfile {
  provider: "google" | "github";
  sub: string;
  email: string | null;
  emailVerified: boolean;
  name: string;
}
```
- 方法 `findOrCreateByGoogle` 改名 `findOrCreateBySocial`（方法体不变，`@Transactional()` 保留）。JSDoc 首行改为「按社交身份（Google / GitHub）找或建账号」。

- [ ] **Step 2: google 回调改调（同 commit）**

`auth.controller.ts` 的 `googleCallback` 里 `this.identities.findOrCreateByGoogle({ provider: "google", ... })` 改为 `this.identities.findOrCreateBySocial({ provider: "google", ... })`。

- [ ] **Step 3: 类型 + 围栏 + Commit**

Run: `pnpm --filter @qriter/server typecheck && pnpm check:repo`
Expected: 类型通过；check:repo 0（AccountIdentityService 仍只注 identityRepo，归属不变）。
```bash
git add libs/account/src/services/account-identity.service.ts apps/server/src/rest/auth.controller.ts
git commit -m "refactor(account): findOrCreateByGoogle → findOrCreateBySocial（provider 联合，Google 改调）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5：`GitHubOAuthService`（纯 fetch）

**Files:** Create `apps/server/src/auth/github-oauth.service.ts`

- [ ] **Step 1: 写 service**

```ts
import { Inject, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { AccountErrorCode } from "@qriter/account";
import { AppError } from "@qriter/shared";

import {
  APP_CONFIG,
  type AppConfig,
  type GithubOAuthConfig,
} from "../config/app-config.schema";

/** 归一化后的 GitHub 用户档案（与 GoogleProfile 同形，controller 补 provider）。 */
export interface GithubProfile {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
}

const STATE_TTL = "10m";
const STATE_MARKER = "github_oauth_state";
const UA = "qriter";

/**
 * GitHub OAuth 服务（无 DB，纯 fetch）：构造同意页 URL、JWT 签/验 state、
 * 用 code 换 token 并调 GitHub API 取主验证邮箱。oauth.github 未配置时抛 GITHUB_OAUTH_FAILED。
 */
@Injectable()
export class GitHubOAuthService {
  private readonly github: GithubOAuthConfig | null;

  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    private readonly jwt: JwtService,
  ) {
    this.github = config.oauth?.github ?? null;
  }

  /** 签发 10min 短 JWT 作为 CSRF state。 */
  signState(): string {
    return this.jwt.sign({ t: STATE_MARKER }, { expiresIn: STATE_TTL });
  }

  /** 验 state；过期 / 篡改 / 标记不符抛 GITHUB_STATE_INVALID。 */
  verifyState(state: string): void {
    try {
      const payload = this.jwt.verify<{ t?: string }>(state);
      if (payload.t !== STATE_MARKER) throw new Error("bad marker");
    } catch {
      throw new AppError(AccountErrorCode.GITHUB_STATE_INVALID);
    }
  }

  /** 构造 GitHub 同意页 URL（内嵌签名 state）。 */
  buildConsentUrl(): string {
    const cfg = this.requireConfig();
    const params = new URLSearchParams({
      client_id: cfg.clientId,
      redirect_uri: cfg.redirectUri,
      scope: cfg.scopes.join(" "),
      state: this.signState(),
      allow_signup: "true",
    });
    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  /** 换 token + 取用户 + 取主验证邮箱；失败抛 GITHUB_OAUTH_FAILED / GITHUB_NO_VERIFIED_EMAIL。 */
  async exchangeCode(code: string): Promise<GithubProfile> {
    const cfg = this.requireConfig();
    try {
      const tokenRes = await fetch(
        "https://github.com/login/oauth/access_token",
        {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({
            client_id: cfg.clientId,
            client_secret: cfg.clientSecret,
            code,
            redirect_uri: cfg.redirectUri,
          }),
        },
      );
      const tokenJson = (await tokenRes.json()) as { access_token?: string };
      const token = tokenJson.access_token;
      if (!token) throw new Error("no access_token");

      const headers = {
        authorization: `Bearer ${token}`,
        "user-agent": UA,
        accept: "application/vnd.github+json",
      };
      const userRes = await fetch("https://api.github.com/user", { headers });
      const user = (await userRes.json()) as {
        id?: number;
        login?: string;
        name?: string | null;
      };
      if (!user.id) throw new Error("no user id");

      const emailsRes = await fetch("https://api.github.com/user/emails", {
        headers,
      });
      const emails = (await emailsRes.json()) as Array<{
        email: string;
        primary: boolean;
        verified: boolean;
      }>;
      const primary = Array.isArray(emails)
        ? emails.find((e) => e.primary && e.verified)
        : undefined;
      if (!primary) {
        throw new AppError(AccountErrorCode.GITHUB_NO_VERIFIED_EMAIL);
      }

      return {
        sub: String(user.id),
        email: primary.email,
        emailVerified: true,
        name: user.name || user.login || primary.email,
      };
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(AccountErrorCode.GITHUB_OAUTH_FAILED);
    }
  }

  private requireConfig(): GithubOAuthConfig {
    if (!this.github) throw new AppError(AccountErrorCode.GITHUB_OAUTH_FAILED);
    return this.github;
  }
}
```

- [ ] **Step 2: 类型 + Commit**

Run: `pnpm --filter @qriter/server typecheck`
Expected: 通过。
```bash
git add apps/server/src/auth/github-oauth.service.ts
git commit -m "feat(server): GitHubOAuthService（纯 fetch：换 token + /user + /user/emails 主验证邮箱）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6：AuthModule 接线 + controller GitHub 端点

**Files:** Modify `apps/server/src/auth/auth.module.ts`、`apps/server/src/rest/auth.controller.ts`

- [ ] **Step 1: AuthModule provide/export**

`auth.module.ts`：import `GitHubOAuthService`；`providers` 加 `GitHubOAuthService`；`exports` 加 `GitHubOAuthService`（与 `GoogleOAuthService` 并列）。

- [ ] **Step 2: controller 两个端点**

`auth.controller.ts`：import `GitHubOAuthService`（from `../auth/github-oauth.service`）；构造函数注入 `private readonly githubOAuth: GitHubOAuthService`。在 google 端点之后加（镜像 google）：
```ts
  @Public()
  @SkipResponseEnvelope()
  @ApiOperation({ summary: "重定向到 GitHub 同意页" })
  @Get("github")
  @Redirect()
  githubStart(): { url: string } {
    return { url: this.githubOAuth.buildConsentUrl() };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: "用 GitHub 授权码换取 JWT" })
  @ApiBody({ type: OAuthCodeDto })
  @ApiOkResponse({
    description: "登录成功，data 为 accessToken + 档案",
    type: AuthResponseDto,
  })
  @Post("github")
  @HttpCode(200)
  async githubCallback(@Body() dto: OAuthCodeDto): Promise<AuthResponse> {
    this.githubOAuth.verifyState(dto.state);
    const profile = await this.githubOAuth.exchangeCode(dto.code);
    const account = await this.identities.findOrCreateBySocial({
      provider: "github",
      sub: profile.sub,
      email: profile.email,
      emailVerified: profile.emailVerified,
      name: profile.name,
    });
    return this.signResponse(account);
  }
```

- [ ] **Step 3: 类型 + 围栏 + Commit**

Run: `pnpm --filter @qriter/server typecheck && pnpm check:repo`
Expected: 类型通过；check:repo 0。
```bash
git add apps/server/src/auth/auth.module.ts apps/server/src/rest/auth.controller.ts
git commit -m "feat(server): 接线 GitHubOAuthService + GitHub 端点（GET/POST /auth/github）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7：后端 e2e（真 service + mock fetch）

**Files:** Create `apps/server/test/e2e/github-auth.spec.ts`

复用 auth-flow / google-auth 的 harness（postgres + I18n + 拦截器），**用真 `GitHubOAuthService`**（TEST_CONFIG 配上 `oauth.github`）+ `jest.spyOn(globalThis, "fetch")` 按 URL 返回 token / user / emails，断言换码建号 + 各错误分支。

- [ ] **Step 1: 写 e2e**

```ts
import "reflect-metadata";
import path from "node:path";
import { AccountModule } from "@qriter/account";
import {
  CommonModule,
  ErrorsFilter,
  I18nZodValidationPipe,
  ResponseInterceptor,
  traceIdMiddleware,
} from "@qriter/common";
import type { INestApplication } from "@nestjs/common";
import { APP_GUARD, Reflector } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { Test } from "@nestjs/testing";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  AcceptLanguageResolver,
  HeaderResolver,
  I18nJsonLoader,
  I18nModule,
  I18nService,
} from "nestjs-i18n";
import request from "supertest";

import { JwtAuthGuard } from "../../src/auth/jwt-auth.guard";
import { JwtStrategy } from "../../src/auth/jwt.strategy";
import { GitHubOAuthService } from "../../src/auth/github-oauth.service";
import { type AppConfig, APP_CONFIG } from "../../src/config/app-config.schema";
import { AuthController } from "../../src/rest/auth.controller";
import {
  createTestDb,
  isPostgresReachable,
  type TestDbContext,
} from "../setup/test-db";

const I18N_PATH = path.join(__dirname, "..", "..", "i18n");

const TEST_CONFIG: AppConfig = {
  port: 3000,
  database: {
    type: "postgres",
    host: "localhost",
    port: 5433,
    username: "qriter",
    password: "qriter",
    database: "qriter",
    synchronize: false,
    autoLoadEntities: true,
  },
  jwt: { secret: "e2e-test-secret-1234567890", expires: "1h" },
  oauth: {
    github: {
      clientId: "gh-client",
      clientSecret: "gh-secret",
      redirectUri: "http://localhost:3001/auth/github",
      scopes: ["read:user", "user:email"],
    },
  },
};

/** 按 URL 路由的假 fetch 响应表；测试前每例重置。 */
interface FetchPlan {
  token?: unknown;
  user?: unknown;
  emails?: unknown;
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("github oauth e2e", () => {
  let app: INestApplication;
  let dbCtx: TestDbContext | null = null;
  let skipReason: string | null = null;
  let github: GitHubOAuthService;
  const plan: FetchPlan = {};
  let fetchSpy: jest.SpiedFunction<typeof fetch>;

  beforeAll(async () => {
    if (!(await isPostgresReachable())) {
      skipReason =
        "Postgres unreachable; run docker compose -f infra/test/docker-compose.test.yml up -d";
      console.warn(`[github-auth] ${skipReason}`);
      return;
    }
    dbCtx = await createTestDb();
    const moduleRef = await Test.createTestingModule({
      imports: [
        CommonModule.forRoot({}),
        I18nModule.forRoot({
          fallbackLanguage: "zh",
          loader: I18nJsonLoader,
          loaderOptions: { path: I18N_PATH },
          resolvers: [
            new HeaderResolver(["x-lang"]),
            new AcceptLanguageResolver(),
          ],
        }),
        TypeOrmModule.forRoot(dbCtx.dataSourceOptions),
        PassportModule,
        JwtModule.register({
          secret: "e2e-test-secret-1234567890",
          signOptions: { expiresIn: "1h" },
        }),
        AccountModule,
      ],
      controllers: [AuthController],
      providers: [
        { provide: APP_CONFIG, useValue: TEST_CONFIG },
        JwtStrategy,
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        GitHubOAuthService,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    app.use(traceIdMiddleware);
    const i18n = app.get(I18nService);
    const reflector = app.get(Reflector);
    app.useGlobalPipes(new I18nZodValidationPipe(i18n));
    app.useGlobalInterceptors(new ResponseInterceptor(reflector));
    app.useGlobalFilters(new ErrorsFilter(i18n));
    await app.init();
    github = app.get(GitHubOAuthService);
  }, 30_000);

  afterAll(async () => {
    if (app) await app.close();
    if (dbCtx) await dbCtx.cleanup();
  });

  beforeEach(() => {
    plan.token = { access_token: "gh-access-token" };
    plan.user = { id: 4242, login: "octocat", name: "Octo Cat" };
    plan.emails = [
      { email: "octo@github.test", primary: true, verified: true },
    ];
    fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("login/oauth/access_token"))
          return jsonResponse(plan.token);
        if (url.endsWith("/user")) return jsonResponse(plan.user);
        if (url.endsWith("/user/emails")) return jsonResponse(plan.emails);
        throw new Error(`unexpected fetch ${url}`);
      });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  function maybeSkip() {
    if (skipReason) {
      console.warn(`[github-auth] skipping: ${skipReason}`);
      return true;
    }
    return false;
  }

  it("换码 → 建无密码账号 + envelope + accessToken（主验证邮箱）", async () => {
    if (maybeSkip()) return;
    const state = github.signState();
    const res = await request(app.getHttpServer())
      .post("/api/auth/github")
      .send({ code: "gh-code", state });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, code: 0 });
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.user).toMatchObject({ email: "octo@github.test" });
  });

  it("无主验证邮箱 → 409 GITHUB_NO_VERIFIED_EMAIL", async () => {
    if (maybeSkip()) return;
    plan.emails = [
      { email: "x@github.test", primary: true, verified: false },
      { email: "y@github.test", primary: false, verified: true },
    ];
    const state = github.signState();
    const res = await request(app.getHttpServer())
      .post("/api/auth/github")
      .send({ code: "gh-code", state });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ success: false, code: 1011 });
  });

  it("state 非法 → 400 GITHUB_STATE_INVALID（不触发 fetch）", async () => {
    if (maybeSkip()) return;
    const res = await request(app.getHttpServer())
      .post("/api/auth/github")
      .send({ code: "gh-code", state: "tampered" });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ success: false, code: 1010 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("token 接口无 access_token → 401 GITHUB_OAUTH_FAILED", async () => {
    if (maybeSkip()) return;
    plan.token = { error: "bad_verification_code" };
    const state = github.signState();
    const res = await request(app.getHttpServer())
      .post("/api/auth/github")
      .send({ code: "gh-code", state });
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ success: false, code: 1009 });
  });
});
```
> `GitHubOAuthService.exchangeCode` 调全局 `fetch`，e2e 用 `jest.spyOn(globalThis,"fetch")` 按 URL 返回计划响应（真 service 走真逻辑，只换 HTTP 边界）。`CommonModule.forRoot({})` 走 memory（OTP/锁/缓存本特性不用）。

- [ ] **Step 2: 起依赖跑 e2e**

Run: `docker compose -f infra/test/docker-compose.test.yml up -d && pnpm test -- github-auth.spec`
Expected: 全绿（Postgres 不可达则 skip）。根 jest 跑 e2e。

- [ ] **Step 3: Commit**

```bash
git add apps/server/test/e2e/github-auth.spec.ts
git commit -m "test(server): GitHub OAuth e2e（真 service + mock fetch：换码建号/无验证邮箱/state错/token失败）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8：前端（proxy + route handler + 回调页 + 按钮 + i18n）

**Files:** Modify `apps/web/src/proxy.ts`、`apps/web/src/app/(auth)/login/page.tsx`、`apps/web/messages/{zh,en}.json`；Create `apps/web/src/app/api/auth/github/code/route.ts`、`apps/web/src/app/(auth)/auth/github/page.tsx`

- [ ] **Step 1: proxy COOKIE_ROUTES**

`apps/web/src/proxy.ts` 的 `COOKIE_ROUTES` set 加 `"/api/auth/github/code",`。

- [ ] **Step 2: cookie route handler**

`apps/web/src/app/api/auth/github/code/route.ts`：
```ts
import type { NextRequest } from "next/server";
import { proxyAndSetCookie } from "@/lib/auth-cookie";

export async function POST(req: NextRequest) {
  return proxyAndSetCookie("/api/auth/github", await req.json());
}
```

- [ ] **Step 3: 回调页（镜像 google）**

`apps/web/src/app/(auth)/auth/github/page.tsx`：
```tsx
"use client";

import type { Account } from "@qriter/types";
import { apiClient } from "@qriter/web-common";
import { useSetAtom } from "jotai";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense, useEffect, useRef, useState } from "react";
import { currentUserAtom } from "@/atoms/auth";

function GithubCallback() {
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
      .post<{ user: Account }>("/api/auth/github/code", { code, state })
      .then(({ data }: { data: { user: Account } }) => {
        setCurrentUser(data.user);
        router.replace("/");
      })
      .catch(() => setError(true));
  }, [params, router, setCurrentUser]);

  return (
    <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
      {error ? (
        <>
          <span>{t("githubLoginFailed")}</span>
          <a className="underline" href="/login">
            {t("backToLogin")}
          </a>
        </>
      ) : (
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
          <span>{t("loggingIn")}</span>
        </div>
      )}
    </div>
  );
}

export default function GithubCallbackPage() {
  return (
    <Suspense fallback={null}>
      <GithubCallback />
    </Suspense>
  );
}
```

- [ ] **Step 4: 登录页 GitHub 按钮接真**

`apps/web/src/app/(auth)/login/page.tsx`：把 GitHub 那个 `<button>` 的 `onClick={comingSoon}` 改为跳转（微信那个不动）：
```tsx
        <button
          type="button"
          aria-label={t("loginWithGithub")}
          title={t("loginWithGithub")}
          onClick={() => {
            window.location.href = "/api/auth/github";
          }}
          className="flex size-11 items-center justify-center rounded-lg border border-border text-foreground transition hover:bg-primary/[0.07]"
        >
          <GithubIcon className="size-5" />
        </button>
```

- [ ] **Step 5: i18n**

`apps/web/messages/zh.json` 的 `auth` 加 `"githubLoginFailed": "GitHub 登录失败，请重试"`；en 加 `"githubLoginFailed": "GitHub sign-in failed, please try again"`。

- [ ] **Step 6: 校验 + 类型 + Commit**

Run: `pnpm sync:locales -- --check && pnpm --filter @qriter/web typecheck`
Expected: i18n 对齐；类型通过。
```bash
git add apps/web/src/proxy.ts "apps/web/src/app/api/auth/github/code/route.ts" "apps/web/src/app/(auth)/auth/github/page.tsx" "apps/web/src/app/(auth)/login/page.tsx" apps/web/messages/zh.json apps/web/messages/en.json
git commit -m "feat(web): GitHub 登录接真（proxy + route handler + 回调页 + 按钮）+ i18n

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9：全量验证门 + 收尾

**Files:** —（验证）

- [ ] **Step 1: 格式 + 类型 + 围栏 + i18n**

Run: `pnpm check:format && pnpm typecheck && pnpm check && pnpm sync:locales -- --check`
Expected: Biome 无残留；全包类型通过；6 围栏 0（check:error-code 1009-1011 连续、check:repo 0）；i18n missing=0 asymmetric=0。

- [ ] **Step 2: 后端 e2e（含原有 google/email/auth-flow 不回归）+ web build**

Run: `docker compose -f infra/test/docker-compose.test.yml up -d && pnpm test && pnpm --filter @qriter/web build`
Expected: 全部 e2e 绿（含 github-auth + 既有 google-auth/email-otp/auth-flow/book —— 确认 findOrCreateBySocial / OAuthCodeDto 改名未破坏 google）；`next build` 成功（github 回调页 + route handler 编译）。
> Docker 不可达时 e2e skip；web build 必须绿。

- [ ] **Step 3: 收尾 Commit（若 check:format 有改动）**

```bash
git add -u apps libs
git commit -m "chore: GitHub OAuth 登录格式化收尾

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## 自检（spec 覆盖对照）

- §1 GitHubOAuthService（signState/verifyState/buildConsentUrl/exchangeCode = token→/user→/user/emails 主验证邮箱）：Task 5 ✅
- §2 findOrCreateBySocial 泛化 + provider 联合 + Google 改调：Task 4 ✅
- §3 端点 GET/POST /auth/github + OAuthCodeDto：Task 6（+ Task 3 DTO 改名）✅
- §4 config oauth.github：Task 1 ✅
- §5 错误码 1009-1011 + i18n：Task 2 ✅
- §6 前端（按钮接真 / 回调页 / route handler / proxy）+ i18n：Task 8 ✅
- §8 测试（e2e mock GitHub HTTP + 不破坏 google + web build）：Task 7 + Task 9 ✅
- §7 非目标（微信仍占位、不做解绑）：未排相关 task ✅

> 类型一致性：`GithubOAuthConfig`（Task1）→ service（Task5）；`OAuthCodeSchema/Dto`（Task3）→ controller google+github（Task3/6）；`GITHUB_*` 错误码（Task2）→ service（Task5）；`findOrCreateBySocial` + `SocialProfile.provider` 联合（Task4）→ controller github（Task6）；`GithubProfile`（Task5）→ controller（Task6）；`githubLoginFailed`（Task8 i18n）→ 回调页（Task8）。一致。改名/泛化破坏点均与修复点同 commit（Task3/4），每 commit typecheck 绿。
