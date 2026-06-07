import "reflect-metadata";
import path from "node:path";
import { AccountModule } from "@qriter/account";
import { BookModule } from "@qriter/book";
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
import { GoogleOAuthService } from "../../src/auth/google-oauth.service";
import { type AppConfig, APP_CONFIG } from "../../src/config/app-config.schema";
import { AuthController } from "../../src/rest/auth.controller";
import { BookController } from "../../src/rest/book.controller";
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

describe.each<[Mode]>([
  ["memory"],
  ["redis"],
])("server book e2e (%s)", (mode) => {
  let app: INestApplication;
  let dbCtx: TestDbContext | null = null;
  let skipReason: string | null = null;
  const providerRef: ProviderRef = {};

  beforeAll(async () => {
    const pgOk = await isPostgresReachable();
    if (!pgOk) {
      skipReason =
        "Postgres unreachable; run `docker compose -f infra/test/docker-compose.test.yml up -d`";
      console.warn(`[book:${mode}] ${skipReason}`);
      return;
    }
    if (mode === "redis") {
      const redisOk = await isRedisReachable();
      if (!redisOk) {
        skipReason = `Redis unreachable at ${REDIS_URL}; run 'docker compose -f infra/test/docker-compose.test.yml up -d'`;
        console.warn(`[book:${mode}] ${skipReason}`);
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
        BookModule,
      ],
      controllers: [AuthController, BookController],
      providers: [
        { provide: APP_CONFIG, useValue: TEST_CONFIG },
        JwtStrategy,
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        GoogleOAuthService,
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
      console.warn(`[book:${mode}] skipping: ${skipReason}`);
      return true;
    }
    return false;
  }

  /** 注册一个用户并返回其 accessToken。 */
  async function registerAndToken(email: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post("/api/auth/register")
      .send({ email, password: "password1", displayName: email.split("@")[0] });
    expect(res.status).toBe(201);
    return res.body.data.accessToken as string;
  }

  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

  it("GET /books — 未登录 401", async () => {
    if (maybeSkip()) return;
    const res = await request(app.getHttpServer()).get("/api/books");
    expect(res.status).toBe(401);
  });

  it("POST /books — 建书返回 envelope + 书籍档案（status 默认 draft）", async () => {
    if (maybeSkip()) return;
    const token = await registerAndToken(`owner-${mode}@test.io`);
    const res = await request(app.getHttpServer())
      .post("/api/books")
      .set(bearer(token))
      .send({ title: "暗令", description: "上元节的长安" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ success: true, code: 0 });
    expect(res.body.data).toMatchObject({
      title: "暗令",
      description: "上元节的长安",
      status: "draft",
    });
    expect(res.body.data.id).toBeTruthy();
  });

  it("GET /books — 只列当前账号的书", async () => {
    if (maybeSkip()) return;
    const alice = await registerAndToken(`alice-${mode}@test.io`);
    const bob = await registerAndToken(`bob-${mode}@test.io`);
    await request(app.getHttpServer())
      .post("/api/books")
      .set(bearer(alice))
      .send({ title: "Alice 的书" });
    const res = await request(app.getHttpServer())
      .get("/api/books")
      .set(bearer(bob));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const titles = (res.body.data as Array<{ title: string }>).map(
      (b) => b.title,
    );
    expect(titles).not.toContain("Alice 的书");
  });

  it("PATCH /books/:id — 改名 + 改状态", async () => {
    if (maybeSkip()) return;
    const token = await registerAndToken(`patcher-${mode}@test.io`);
    const created = await request(app.getHttpServer())
      .post("/api/books")
      .set(bearer(token))
      .send({ title: "草稿" });
    const id = created.body.data.id as string;
    const res = await request(app.getHttpServer())
      .patch(`/api/books/${id}`)
      .set(bearer(token))
      .send({ title: "定稿", status: "writing" });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ title: "定稿", status: "writing" });
  });

  it("DELETE /books/:id — 删书返回 ok", async () => {
    if (maybeSkip()) return;
    const token = await registerAndToken(`deleter-${mode}@test.io`);
    const created = await request(app.getHttpServer())
      .post("/api/books")
      .set(bearer(token))
      .send({ title: "待删" });
    const id = created.body.data.id as string;
    const res = await request(app.getHttpServer())
      .delete(`/api/books/${id}`)
      .set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ ok: true });
  });

  it("PATCH /books/:id — 越权改他人书 403 BOOK_FORBIDDEN", async () => {
    if (maybeSkip()) return;
    const owner = await registerAndToken(`owner2-${mode}@test.io`);
    const other = await registerAndToken(`other2-${mode}@test.io`);
    const created = await request(app.getHttpServer())
      .post("/api/books")
      .set(bearer(owner))
      .send({ title: "私密书" });
    const id = created.body.data.id as string;
    const res = await request(app.getHttpServer())
      .patch(`/api/books/${id}`)
      .set(bearer(other))
      .send({ title: "篡改" });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ success: false, code: 2002 });
  });

  it("DELETE /books/:id — 越权删他人书 403 BOOK_FORBIDDEN", async () => {
    if (maybeSkip()) return;
    const owner = await registerAndToken(`owner3-${mode}@test.io`);
    const other = await registerAndToken(`other3-${mode}@test.io`);
    const created = await request(app.getHttpServer())
      .post("/api/books")
      .set(bearer(owner))
      .send({ title: "私密书2" });
    const id = created.body.data.id as string;
    const res = await request(app.getHttpServer())
      .delete(`/api/books/${id}`)
      .set(bearer(other));
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ success: false, code: 2002 });
  });
});
