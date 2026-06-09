import "reflect-metadata";
import path from "node:path";
import { AccountModule } from "@qriter/account";
import { AccountErrorCode } from "@qriter/account";
import { AppError } from "@qriter/shared";
import {
  CommonModule,
  ErrorsFilter,
  I18nZodValidationPipe,
  ResponseInterceptor,
  traceIdMiddleware,
} from "@qriter/common";
import type { INestApplication } from "@nestjs/common";
import { APP_GUARD, Reflector } from "@nestjs/core";
import { JwtModule, JwtService } from "@nestjs/jwt";
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
import { GoogleOAuthService } from "../../src/auth/google-oauth.service";
import { GitHubOAuthService } from "../../src/auth/github-oauth.service";
import { EmailOtpService } from "../../src/auth/email-otp.service";
import { EMAIL_SENDER, LogEmailSender } from "../../src/auth/email-sender";
import { type AppConfig, APP_CONFIG } from "../../src/config/app-config.schema";
import { AuthController } from "../../src/rest/auth.controller";
import {
  createTestDb,
  isPostgresReachable,
  type TestDbContext,
} from "../setup/test-db";

const I18N_PATH = path.join(__dirname, "..", "..", "i18n");

/** e2e 测试用最小 AppConfig —— jwt.secret 必须与下面 JwtModule.register 的 secret 一致。 */
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
};

const JWT_SECRET = TEST_CONFIG.jwt.secret;

/** 可控假 GoogleOAuthService，供 e2e 注入。 */
class FakeGoogleOAuth {
  next = {
    sub: "g-1",
    email: "g1@ex.com" as string | null,
    emailVerified: true,
    name: "G One",
  };
  stateOk = true;

  buildConsentUrl() {
    return "https://accounts.google.com/o/oauth2/v2/auth?state=stub";
  }

  verifyState(_s: string) {
    if (!this.stateOk)
      throw new AppError(AccountErrorCode.GOOGLE_STATE_INVALID);
  }

  async exchangeCode(_c: string) {
    return this.next;
  }
}

describe("server google-auth e2e", () => {
  let app: INestApplication;
  let dbCtx: TestDbContext | null = null;
  let skipReason: string | null = null;
  const fakeGoogle = new FakeGoogleOAuth();

  beforeAll(async () => {
    const pgOk = await isPostgresReachable();
    if (!pgOk) {
      skipReason =
        "Postgres unreachable; run `docker compose -f infra/test/docker-compose.test.yml up -d`";
      console.warn(`[google-auth] ${skipReason}`);
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
        GoogleOAuthService,
        GitHubOAuthService,
        EmailOtpService,
        { provide: EMAIL_SENDER, useClass: LogEmailSender },
      ],
    })
      .overrideProvider(GoogleOAuthService)
      .useValue(fakeGoogle)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    app.use(traceIdMiddleware);
    const i18n = app.get(I18nService);
    const reflector = app.get(Reflector);
    app.useGlobalPipes(new I18nZodValidationPipe(i18n));
    app.useGlobalInterceptors(new ResponseInterceptor(reflector));
    app.useGlobalFilters(new ErrorsFilter(i18n));
    await app.init();
  }, 30_000);

  afterAll(async () => {
    if (app) await app.close();
    if (dbCtx) await dbCtx.cleanup();
  });

  function maybeSkip() {
    if (skipReason) {
      console.warn(`[google-auth] skipping: ${skipReason}`);
      return true;
    }
    return false;
  }

  it("POST /auth/google — 新用户登录返回 accessToken 和 user.email", async () => {
    if (maybeSkip()) return;
    fakeGoogle.next = {
      sub: "g-new-1",
      email: "gnew1@ex.com",
      emailVerified: true,
      name: "G New One",
    };
    fakeGoogle.stateOk = true;

    const res = await request(app.getHttpServer())
      .post("/api/auth/google")
      .send({ code: "stub-code", state: "stub-state" });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.user.email).toBe("gnew1@ex.com");
  });

  it("POST /auth/google — 同 sub 再次登录命中既有身份，返回相同 user.id", async () => {
    if (maybeSkip()) return;
    fakeGoogle.next = {
      sub: "g-returning-1",
      email: "greturning1@ex.com",
      emailVerified: true,
      name: "G Returning",
    };
    fakeGoogle.stateOk = true;

    const res1 = await request(app.getHttpServer())
      .post("/api/auth/google")
      .send({ code: "stub-code", state: "stub-state" });
    expect(res1.status).toBe(200);
    const userId1 = res1.body.data.user.id;

    const res2 = await request(app.getHttpServer())
      .post("/api/auth/google")
      .send({ code: "stub-code", state: "stub-state" });
    expect(res2.status).toBe(200);
    const userId2 = res2.body.data.user.id;

    expect(userId1).toBeTruthy();
    expect(userId1).toBe(userId2);
  });

  it("POST /auth/google — state 非法返回 400", async () => {
    if (maybeSkip()) return;
    fakeGoogle.stateOk = false;

    const res = await request(app.getHttpServer())
      .post("/api/auth/google")
      .send({ code: "stub-code", state: "bad-state" });

    fakeGoogle.stateOk = true;

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe(AccountErrorCode.GOOGLE_STATE_INVALID.code);
  });

  it("POST /auth/google — 未验证邮箱撞已有账号返回 409", async () => {
    if (maybeSkip()) return;

    // 先用 verified profile 建账号
    fakeGoogle.next = {
      sub: "owner-1",
      email: "collide@ex.com",
      emailVerified: true,
      name: "Owner One",
    };
    fakeGoogle.stateOk = true;
    const res1 = await request(app.getHttpServer())
      .post("/api/auth/google")
      .send({ code: "stub-code", state: "stub-state" });
    expect(res1.status).toBe(200);

    // 再用另一个 sub + 同邮箱 + emailVerified=false
    fakeGoogle.next = {
      sub: "other-1",
      email: "collide@ex.com",
      emailVerified: false,
      name: "Other One",
    };
    const res2 = await request(app.getHttpServer())
      .post("/api/auth/google")
      .send({ code: "stub-code", state: "stub-state" });

    expect(res2.status).toBe(409);
    expect(res2.body.success).toBe(false);
    expect(res2.body.code).toBe(AccountErrorCode.GOOGLE_EMAIL_UNVERIFIED.code);
  });

  it("GET /auth/profile — 带 token 返回 email，无 token 返回 401", async () => {
    if (maybeSkip()) return;
    fakeGoogle.next = {
      sub: "g-profile-1",
      email: "gprofile1@ex.com",
      emailVerified: true,
      name: "G Profile",
    };
    fakeGoogle.stateOk = true;

    // 先登录拿 token
    const loginRes = await request(app.getHttpServer())
      .post("/api/auth/google")
      .send({ code: "stub-code", state: "stub-state" });
    expect(loginRes.status).toBe(200);
    const token = loginRes.body.data.accessToken;

    // 带 token 访问
    const profileRes = await request(app.getHttpServer())
      .get("/api/auth/profile")
      .set("Authorization", `Bearer ${token}`);
    expect(profileRes.status).toBe(200);
    expect(profileRes.body.data.email).toBe("gprofile1@ex.com");

    // 无 token 访问
    const unauthorizedRes = await request(app.getHttpServer()).get(
      "/api/auth/profile",
    );
    expect(unauthorizedRes.status).toBe(401);
  });

  it("GET /auth/ws-ticket — 带 token 返回 ticket，payload.t === 'ws'", async () => {
    if (maybeSkip()) return;
    fakeGoogle.next = {
      sub: "g-ws-1",
      email: "gws1@ex.com",
      emailVerified: true,
      name: "G WS",
    };
    fakeGoogle.stateOk = true;

    // 先登录拿 token
    const loginRes = await request(app.getHttpServer())
      .post("/api/auth/google")
      .send({ code: "stub-code", state: "stub-state" });
    expect(loginRes.status).toBe(200);
    const token = loginRes.body.data.accessToken;

    // 拿 ws-ticket
    const ticketRes = await request(app.getHttpServer())
      .get("/api/auth/ws-ticket")
      .set("Authorization", `Bearer ${token}`);
    expect(ticketRes.status).toBe(200);
    const ticket = ticketRes.body.data.ticket;
    expect(ticket).toBeTruthy();

    // 验证 ticket payload
    const jwtSvc = new JwtService({ secret: JWT_SECRET });
    const payload = jwtSvc.verify<{ t: string }>(ticket);
    expect(payload.t).toBe("ws");
  });
});
