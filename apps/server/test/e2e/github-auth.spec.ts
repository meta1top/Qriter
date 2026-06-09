import "reflect-metadata";
import path from "node:path";
import { AccountErrorCode, AccountModule } from "@qriter/account";
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

import { EmailOtpService } from "../../src/auth/email-otp.service";
import { EMAIL_SENDER, LogEmailSender } from "../../src/auth/email-sender";
import { GitHubOAuthService } from "../../src/auth/github-oauth.service";
import { GoogleOAuthService } from "../../src/auth/google-oauth.service";
import { JwtAuthGuard } from "../../src/auth/jwt-auth.guard";
import { JwtStrategy } from "../../src/auth/jwt.strategy";
import { type AppConfig, APP_CONFIG } from "../../src/config/app-config.schema";
import { AuthController } from "../../src/rest/auth.controller";
import {
  createTestDb,
  isPostgresReachable,
  type TestDbContext,
} from "../setup/test-db";

const I18N_PATH = path.join(__dirname, "..", "..", "i18n");

/**
 * e2e 测试用最小 AppConfig —— jwt.secret 必须与下面 JwtModule.register 的 secret 一致；
 * oauth.github 配齐让真 GitHubOAuthService 走 requireConfig（不会在配置缺失时早退）。
 */
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

const JWT_SECRET = TEST_CONFIG.jwt.secret;

/** 一次换码流程中三个 GitHub 接口各自要返回的 JSON。 */
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

describe("server github-auth e2e", () => {
  let app: INestApplication;
  let dbCtx: TestDbContext | null = null;
  let skipReason: string | null = null;
  let github: GitHubOAuthService;
  const plan: FetchPlan = {};
  let fetchSpy: jest.SpiedFunction<typeof fetch>;

  beforeAll(async () => {
    const pgOk = await isPostgresReachable();
    if (!pgOk) {
      skipReason =
        "Postgres unreachable; run `docker compose -f infra/test/docker-compose.test.yml up -d`";
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
          secret: JWT_SECRET,
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
        // AuthController 同时依赖 GoogleOAuthService / EmailOtpService —— 用真 provider
        // 接齐 DI；本 suite 只打 /auth/github，二者不会被调用（Google 未配亦不构造报错）。
        GoogleOAuthService,
        EmailOtpService,
        { provide: EMAIL_SENDER, useClass: LogEmailSender },
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
    expect(res.body).toMatchObject({
      success: false,
      code: AccountErrorCode.GITHUB_NO_VERIFIED_EMAIL.code,
    });
  });

  it("state 非法 → 400 GITHUB_STATE_INVALID（不触发 fetch）", async () => {
    if (maybeSkip()) return;
    const res = await request(app.getHttpServer())
      .post("/api/auth/github")
      .send({ code: "gh-code", state: "tampered" });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      success: false,
      code: AccountErrorCode.GITHUB_STATE_INVALID.code,
    });
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
    expect(res.body).toMatchObject({
      success: false,
      code: AccountErrorCode.GITHUB_OAUTH_FAILED.code,
    });
  });
});
