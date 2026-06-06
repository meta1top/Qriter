import "reflect-metadata";
import path from "node:path";
import { AccountModule } from "@qriter/account";
import {
  CommonModule,
  type CommonModuleOptions,
  ErrorsFilter,
  I18nZodValidationPipe,
  RedisCacheProvider,
  RedisLockProvider,
  ResponseInterceptor,
  traceIdMiddleware,
} from "@qriter/common";
import type { INestApplication } from "@nestjs/common";
import { APP_GUARD, Reflector } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { Test } from "@nestjs/testing";
import { TypeOrmModule } from "@nestjs/typeorm";
import Redis from "ioredis";
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

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6380";

async function isRedisReachable(): Promise<boolean> {
  const probe = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 1,
    lazyConnect: false,
    connectTimeout: 1_000,
  });
  return new Promise((resolve) => {
    let settled = false;
    const settle = (ok: boolean) => {
      if (settled) return;
      settled = true;
      probe.disconnect();
      resolve(ok);
    };
    probe.on("ready", () => settle(true));
    probe.on("error", () => settle(false));
    setTimeout(() => settle(false), 1_200);
  });
}

type Mode = "memory" | "redis";

interface ProviderRef {
  redis?: Redis;
}

function buildCommonOptions(mode: Mode, ref: ProviderRef): CommonModuleOptions {
  if (mode === "memory") return {};
  const redis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    lazyConnect: false,
  });
  ref.redis = redis;
  return {
    lock: new RedisLockProvider(redis),
    cache: new RedisCacheProvider(redis),
  };
}

// 用例覆盖 memory + redis 双 provider 链路。redis 不可达时该 block skip。
describe.each<[Mode]>([
  ["memory"],
  ["redis"],
])("server auth e2e (%s)", (mode) => {
  let app: INestApplication;
  let dbCtx: TestDbContext | null = null;
  let skipReason: string | null = null;
  const providerRef: ProviderRef = {};

  beforeAll(async () => {
    const pgOk = await isPostgresReachable();
    if (!pgOk) {
      skipReason = "Postgres unreachable; run `pnpm dev:db:up`";
      console.warn(`[auth-flow:${mode}] ${skipReason}`);
      return;
    }
    if (mode === "redis") {
      const redisOk = await isRedisReachable();
      if (!redisOk) {
        skipReason = `Redis unreachable at ${REDIS_URL}; run 'pnpm dev:db:up'（含 redis 服务）`;
        console.warn(`[auth-flow:${mode}] ${skipReason}`);
        return;
      }
    }
    dbCtx = await createTestDb();
    const commonOptions = buildCommonOptions(mode, providerRef);

    const moduleRef = await Test.createTestingModule({
      imports: [
        CommonModule.forRoot(commonOptions),
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
  }, 30_000);

  afterAll(async () => {
    if (app) await app.close();
    if (dbCtx) await dbCtx.cleanup();
    if (providerRef.redis) providerRef.redis.disconnect();
  });

  function maybeSkip() {
    if (skipReason) {
      console.warn(`[auth-flow:${mode}] skipping: ${skipReason}`);
      return true;
    }
    return false;
  }

  const ALICE = {
    email: `alice-${mode}@test.io`,
    password: "alicepass1",
    displayName: "Alice",
  };

  it("POST /auth/register — 注册成功返回 envelope + accessToken + user", async () => {
    if (maybeSkip()) return;
    const res = await request(app.getHttpServer())
      .post("/api/auth/register")
      .send(ALICE);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      success: true,
      code: 0,
      message: "success",
    });
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.user).toMatchObject({
      email: ALICE.email,
      displayName: ALICE.displayName,
    });
    expect(res.body.data.user.id).toBeTruthy();
  });

  it("POST /auth/register — 同 email 二次注册业务错误（409 + AppError envelope）", async () => {
    if (maybeSkip()) return;
    const res = await request(app.getHttpServer())
      .post("/api/auth/register")
      .send(ALICE);
    // AccountErrorCode.EMAIL_EXISTS httpStatus=409
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      success: false,
      code: 1000,
      message: "邮箱已被注册",
    });
  });

  it("POST /auth/login — 正确密码返回 envelope + accessToken", async () => {
    if (maybeSkip()) return;
    const res = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: ALICE.email, password: ALICE.password });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, code: 0 });
    expect(res.body.data.accessToken).toBeTruthy();
  });

  it("POST /auth/login — 错误密码业务错误（401 + AppError + 英文 i18n）", async () => {
    if (maybeSkip()) return;
    const res = await request(app.getHttpServer())
      .post("/api/auth/login")
      .set("Accept-Language", "en")
      .send({ email: ALICE.email, password: "wrong" });
    // AccountErrorCode.INVALID_CREDENTIALS httpStatus=401
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({
      success: false,
      code: 1001,
      message: "Invalid email or password",
    });
  });

  it("POST /auth/register — 非法 DTO 中文报错走 i18n 翻译 + envelope", async () => {
    if (maybeSkip()) return;
    const res = await request(app.getHttpServer())
      .post("/api/auth/register")
      .send({ email: "not-an-email", password: "short", displayName: "" });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      success: false,
      code: 1,
      message: "请求参数校验失败",
    });
    const messages = res.body.data.errors.map(
      (e: { message: string }) => e.message,
    );
    expect(messages).toEqual(
      expect.arrayContaining(["邮箱格式不正确", "密码至少 8 位", "必填字段"]),
    );
  });

  it("POST /auth/register — 非法 DTO 英文报错走 i18n 翻译 + envelope", async () => {
    if (maybeSkip()) return;
    const res = await request(app.getHttpServer())
      .post("/api/auth/register")
      .set("Accept-Language", "en")
      .send({ email: "not-an-email", password: "short", displayName: "" });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      success: false,
      code: 1,
      message: "Request validation failed",
    });
    const messages = res.body.data.errors.map(
      (e: { message: string }) => e.message,
    );
    expect(messages).toEqual(
      expect.arrayContaining([
        "Invalid email format",
        "Password must be at least 8 characters",
        "Required field",
      ]),
    );
  });

  it("trace ID — 上游 x-trace-id 透传到 response header + envelope.traceId", async () => {
    if (maybeSkip()) return;
    const upstream = "qriter-trace-1";
    const res = await request(app.getHttpServer())
      .post("/api/auth/register")
      .set("x-trace-id", upstream)
      .send({}); // 故意空 body → 触发校验错误 envelope，方便检查 traceId
    expect(res.headers["x-trace-id"]).toBe(upstream);
    expect(res.body.traceId).toBe(upstream);
  });

  it("trace ID — 无上游 header 时自动生成 UUID 写入响应", async () => {
    if (maybeSkip()) return;
    const res = await request(app.getHttpServer())
      .post("/api/auth/register")
      .send({});
    expect(res.headers["x-trace-id"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(res.body.traceId).toBe(res.headers["x-trace-id"]);
  });
});
