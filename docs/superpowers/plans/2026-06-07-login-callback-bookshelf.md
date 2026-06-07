# 登录 / 谷歌回调 / 书籍管理页 实现 Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `apps/web` 改造为 SSR 路由组鉴权门，登录前套 split-brand 视觉，登录后落真实书架（接薄 BookController 暴露的已就绪 BookService）。

**Architecture:** 后端补一个薄 `BookController`（list/建/改/删，归属校验经 `BookService.assertOwner`，全局 JWT 守卫默认保护）。前端用 App Router 路由组 `(auth)` / `(app)` 的 server component 做鉴权门：`getServerProfile()` 用 `cookies()` 读 httpOnly `qriter_token`、服务端直连 Nest 取 profile，权威判定后渲染或 `redirect()`；客户端 `AuthGuard` 移除，`currentUserAtom` 由 SSR profile 经 `AuthHydrator` 水合。

**Tech Stack:** NestJS（Controller + e2e supertest）· Next.js 16（App Router 路由组 / server component / `next/headers`）· axios（同源 + cookie，经既有 `proxy.ts`）· @tanstack/react-query · jotai · next-intl · `@qriter/design`（shadcn 组件）。

**前置已就绪：** 设计 token + 暖纸主题 + 组件（Dialog/Badge/Avatar/Skeleton/DropdownMenu/Toaster…）已在 `@qriter/design`；谷歌登录后端 + 前端 cookie/proxy 传输已上线；`BookService`（`listBooksByOwner`/`createBook`/`getBook`/`updateBook`/`deleteBook`/`assertOwner`/`toProfile`）已写好并被 `BookModule` 导出，`BookModule` 已在 `AppModule.imports`。spec：`docs/superpowers/specs/2026-06-07-login-callback-bookshelf-design.md`。

**关键约定（务必遵守）：**
- 提交 **绝不** `git add .claude/settings.json`（与本工作无关，全程不动）。逐文件 `git add`。
- `apps/web` / `packages/**` **无 jest**：前端 task 的验证门 = `pnpm --filter @qriter/web typecheck` + `pnpm --filter @qriter/web build`（RSC 编译即冒烟），**不写前端单测**。
- 后端 task 用 e2e（supertest + Postgres，`pnpm dev:db:up` 起依赖）。Postgres 不可达时该 suite 自动 skip（见既有 `test-db.ts`）。
- Controller **禁止**直接注入 Repository（`check:repo` 围栏），只经 `BookService`。
- 所有用户可见串走 next-intl key，禁裸串；`pnpm sync:locales -- --check` 必过。
- commit 用 conventional commits（type 英文、body 中文），结尾带 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`。

---

## 文件结构

**后端（新增 / 改）**
- Create `apps/server/src/rest/book.controller.ts` — 薄 BookController（list/建/改/删）
- Modify `apps/server/src/app.module.ts` — `controllers` 数组加 `BookController`
- Modify `libs/book/src/dto/index.ts` — 加 `BookDto`（响应 DTO）
- Modify `libs/book/src/index.ts` — 导出 `BookDto`
- Create `apps/server/i18n/zh/book.json` / `apps/server/i18n/en/book.json` — book 域错误文案
- Modify `apps/server/test/setup/test-db.ts` — 注册 `Book` / `Chapter` 实体
- Create `apps/server/test/e2e/book.spec.ts` — BookController e2e

**前端（新增 / 改 / 迁 / 删）**
- Modify `apps/web/messages/zh.json` / `apps/web/messages/en.json` — 加 `shelf`/`book`/`account`/`workspace` 命名空间
- Create `apps/web/src/lib/server-auth.ts` — `getServerProfile()`
- Create `apps/web/src/lib/book-spine.ts` — `bookSpineColor()` 纯函数
- Create `apps/web/src/rest/books.ts` — react-query hooks（useBooks/useCreateBook/useUpdateBook/useDeleteBook）
- Create `apps/web/src/components/app/auth-hydrator.tsx` — SSR profile → `currentUserAtom`
- Create `apps/web/src/components/auth/brand-panel.tsx` — 登录前品牌墙
- Create `apps/web/src/components/app/{top-bar,account-menu,book-card,book-grid,book-form-dialog,book-delete-dialog}.tsx`
- Create `apps/web/src/app/(auth)/layout.tsx` — 登录前 SSR 门 + chrome
- Create `apps/web/src/app/(app)/layout.tsx` — 登录后 SSR 门 + shell
- Move `app/login/page.tsx` → `app/(auth)/login/page.tsx`（restyle）
- Move `app/auth/google/page.tsx` → `app/(auth)/auth/google/page.tsx`（restyle）
- Move `app/page.tsx` → `app/(app)/page.tsx`（重写为书架）
- Create `apps/web/src/app/(app)/books/[id]/page.tsx` — 工作台 stub
- Create `apps/web/src/app/(app)/{stats,settings/model,settings/account}/page.tsx` — 占位 stub
- Modify `apps/web/src/components/providers.tsx` — 移除 `<AuthGuard>`
- Delete `apps/web/src/components/auth-guard.tsx`

---

## Task 1：BookDto 响应 DTO + server i18n book.json

**Files:**
- Modify `libs/book/src/dto/index.ts`
- Modify `libs/book/src/index.ts`
- Create `apps/server/i18n/zh/book.json`
- Create `apps/server/i18n/en/book.json`

- [ ] **Step 1: 加 BookDto（响应 DTO）**

在 `libs/book/src/dto/index.ts` 顶部 import 增补 `BookSchema`，文件末尾追加 `BookDto`。沿用 `AccountDto`（`libs/account/src/dto/index.ts:43`）的「裸 class」模式（响应 DTO 无需 controller 内字段访问，不做 interface 合并）：

```ts
// libs/book/src/dto/index.ts —— 顶部 import 增补 BookSchema
import { createI18nZodDto } from "@qriter/shared";
import {
  BookSchema,                 // ← 新增
  type CreateBookInput,
  CreateBookSchema,
  type CreateChapterInput,
  CreateChapterSchema,
  type UpdateBookInput,
  UpdateBookSchema,
  type UpdateChapterInput,
  UpdateChapterSchema,
} from "@qriter/types";
```

文件末尾追加：

```ts
/**
 * 书籍公开形态的响应 DTO —— 仅供 Swagger `@ApiOkResponse({ type: BookDto })` 标注，
 * 不参与请求校验。沿用 AccountDto 的裸 class 模式（无需 interface 合并暴露字段）。
 */
export class BookDto extends createI18nZodDto(BookSchema) {}
```

- [ ] **Step 2: 导出 BookDto**

`libs/book/src/index.ts` 的 dto 导出处加上 `BookDto`（找到现有 `export { CreateBookDto, UpdateBookDto, ... } from "./dto"` 一行，补 `BookDto`；若是 `export * from "./dto"` 则无需改）。先确认现状：

Run: `grep -n "dto" libs/book/src/index.ts`

若是具名导出，补 `BookDto`：
```ts
export {
  BookDto,
  CreateBookDto,
  CreateChapterDto,
  UpdateBookDto,
  UpdateChapterDto,
} from "./dto";
```

- [ ] **Step 3: server i18n book.json（zh / en）**

`BookErrorCode`（`libs/book/src/errors/book.error-codes.ts`）已引用 `book.notFound` / `book.forbidden` / `book.chapterNotFound`，但 `apps/server/i18n/{zh,en}/` 下还没有 `book.json`（错误信息当前回退成 key 字面量）。补上：

`apps/server/i18n/zh/book.json`：
```json
{
  "notFound": "书籍不存在",
  "chapterNotFound": "章节不存在",
  "forbidden": "无权访问该书籍"
}
```

`apps/server/i18n/en/book.json`：
```json
{
  "notFound": "Book not found",
  "chapterNotFound": "Chapter not found",
  "forbidden": "You do not have access to this book"
}
```

- [ ] **Step 4: 类型检查**

Run: `pnpm --filter @qriter/book typecheck`
Expected: 通过。

- [ ] **Step 5: Commit**

```bash
git add libs/book/src/dto/index.ts libs/book/src/index.ts apps/server/i18n/zh/book.json apps/server/i18n/en/book.json
git commit -m "feat(book): 加 BookDto 响应 DTO + server i18n book.json 错误文案

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2：BookController（list / 建 / 改 / 删）+ 注册 AppModule

**Files:**
- Create `apps/server/src/rest/book.controller.ts`
- Modify `apps/server/src/app.module.ts`

- [ ] **Step 1: 写 BookController**

参照 `apps/server/src/rest/auth.controller.ts` 的风格（`@ApiTags` + `@CurrentUser`）。全局 `JwtAuthGuard` 默认保护（不挂 `@Public()` 即受保护），`@CurrentUser()` 取 `{ userId }`。Controller 只注入 `BookService`（**禁注 Repository**），写动作的归属校验经 `assertOwner`，返回投影 `toProfile`。

`apps/server/src/rest/book.controller.ts`：
```ts
import {
  BookDto,
  BookService,
  CreateBookDto,
  UpdateBookDto,
} from "@qriter/book";
import type { Book as BookProfile } from "@qriter/types";
import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";

import {
  CurrentUser,
  type CurrentUserPayload,
} from "../auth/current-user.decorator";

/**
 * 书籍域 REST endpoint —— 全部受全局 JwtAuthGuard 保护（需登录）。
 * Controller 只接 DTO + 取当前用户 + 委托 BookService，不持有 Repository。
 * 写动作（改 / 删）先 `assertOwner` 校验归属，非本人书抛 BOOK_FORBIDDEN(403)。
 */
@ApiTags("books")
@Controller("books")
export class BookController {
  constructor(private readonly books: BookService) {}

  @ApiOperation({ summary: "列出当前账号的全部书籍（按更新时间倒序）" })
  @ApiOkResponse({ description: "我的书籍列表", type: [BookDto] })
  @Get()
  async list(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<BookProfile[]> {
    const books = await this.books.listBooksByOwner(user.userId);
    return books.map((book) => this.books.toProfile(book));
  }

  @ApiOperation({ summary: "新建书籍（仅书本身，0 章；首章在工作台创建）" })
  @ApiCreatedResponse({ description: "新建的书籍", type: BookDto })
  @Post()
  async create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateBookDto,
  ): Promise<BookProfile> {
    const book = await this.books.createBook(user.userId, dto);
    return this.books.toProfile(book);
  }

  @ApiOperation({ summary: "更新书籍 title / description / status" })
  @ApiOkResponse({ description: "更新后的书籍", type: BookDto })
  @Patch(":id")
  async update(
    @CurrentUser() user: CurrentUserPayload,
    @Param("id") id: string,
    @Body() dto: UpdateBookDto,
  ): Promise<BookProfile> {
    await this.books.assertOwner(id, user.userId);
    const book = await this.books.updateBook(id, dto);
    return this.books.toProfile(book);
  }

  @ApiOperation({ summary: "删除书籍及其全部章节" })
  @ApiOkResponse({ description: "删除成功" })
  @Delete(":id")
  async remove(
    @CurrentUser() user: CurrentUserPayload,
    @Param("id") id: string,
  ): Promise<{ ok: true }> {
    await this.books.assertOwner(id, user.userId);
    await this.books.deleteBook(id);
    return { ok: true };
  }
}
```

> 注：`BookService` / `CreateBookDto` / `UpdateBookDto` / `BookDto` 均从 `@qriter/book` 导出（Task 1 已补 `BookDto`）。`CurrentUserPayload = { userId, email }`。

- [ ] **Step 2: 注册到 AppModule**

`apps/server/src/app.module.ts`：import 增补 `BookController`，把它加进 `controllers` 数组（`BookModule` 已在 `imports`，无需改）。

import 区（与既有 `AuthController` import 相邻）：
```ts
import { BookController } from "./rest/book.controller";
```

`controllers` 行（原 `controllers: [HealthController, AuthController]`）改为：
```ts
      controllers: [HealthController, AuthController, BookController],
```

- [ ] **Step 3: 类型检查 + 围栏**

Run: `pnpm --filter @qriter/server typecheck && pnpm check:repo`
Expected: 类型通过；`check:repo` 报 `NON_SERVICE_INJECT: 0`（BookController 没注 Repository）、`Book → BookService` 归属不变。

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/rest/book.controller.ts apps/server/src/app.module.ts
git commit -m "feat(server): 薄 BookController（list/建/改/删 + assertOwner 归属校验）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3：test-db 注册 Book/Chapter + BookController e2e

**Files:**
- Modify `apps/server/test/setup/test-db.ts`
- Create `apps/server/test/e2e/book.spec.ts`

- [ ] **Step 1: test-db 注册 Book / Chapter 实体**

`InitialSchema` 迁移已建 `book` / `chapter` 表（`apps/server/src/migrations/1780502575371-InitialSchema.ts`），只需让测试 DataSource 认识这两个实体。改 `apps/server/test/setup/test-db.ts`：

import 区增补（与既有 Account 实体 import 相邻）：
```ts
import { Book } from "../../../../libs/book/src/entities/book.entity";
import { Chapter } from "../../../../libs/book/src/entities/chapter.entity";
```

`dataSourceOptions.entities` 由 `[Account, AccountIdentity]` 改为：
```ts
    entities: [Account, AccountIdentity, Book, Chapter],
```

> migrations 不用改：`InitialSchema` 已建全部表；新增实体只影响 TypeORM 元数据，不触发 DDL（`synchronize:false`）。auth e2e 不用这两个实体，加了无副作用。

- [ ] **Step 2: 写 BookController e2e（先让它失败/通过驱动实现已存在）**

`apps/server/test/e2e/book.spec.ts` —— 复用 auth-flow 的 harness（memory/redis `describe.each` + skip 逻辑 + `createTestDb`），模块额外挂 `BookModule` + `BookController`，用 `AuthController` 注册两个用户拿 token。覆盖：list 只见本人书 / 建 / 改 / 删 / 越权 403 / 未登录 401。

```ts
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

describe.each<[Mode]>([["memory"], ["redis"]])(
  "server book e2e (%s)",
  (mode) => {
    let app: INestApplication;
    let dbCtx: TestDbContext | null = null;
    let skipReason: string | null = null;
    const providerRef: ProviderRef = {};

    beforeAll(async () => {
      const pgOk = await isPostgresReachable();
      if (!pgOk) {
        skipReason = "Postgres unreachable; run `pnpm dev:db:up`";
        console.warn(`[book:${mode}] ${skipReason}`);
        return;
      }
      if (mode === "redis") {
        const redisOk = await isRedisReachable();
        if (!redisOk) {
          skipReason = `Redis unreachable at ${REDIS_URL}; run 'pnpm dev:db:up'`;
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
  },
);
```

- [ ] **Step 3: 起依赖 + 跑 e2e**

Run: `pnpm dev:db:up && pnpm test -- book.spec  # 根 jest（apps/server 无 test script）`
Expected: BookController e2e 全绿（memory + redis 两组；若本机 redis/pg 不可达则相应组 skip 而非 fail）。

- [ ] **Step 4: Commit**

```bash
git add apps/server/test/setup/test-db.ts apps/server/test/e2e/book.spec.ts
git commit -m "test(server): BookController e2e（list/建/改/删/越权 403/未登录 401）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4：前端 i18n key（shelf / book / account / workspace）

**Files:**
- Modify `apps/web/messages/zh.json`
- Modify `apps/web/messages/en.json`

> 先把全部新文案铺好，后续 UI task 直接引用，避免 `sync:locales --check` 在每个 UI task 反复红。

- [ ] **Step 1: zh.json 增补命名空间**

在 `apps/web/messages/zh.json` 的 `auth` 节点补两个 slogan / 状态键，并新增 `shelf` / `book` / `account` / `workspace` 顶层节点（保持 JSON 合法，逗号对齐）：

`auth` 节点内追加：
```json
    "brandSlogan": "落笔之前，先与 agent 聊聊。",
    "loggingIn": "登录中…"
```

顶层新增：
```json
  "shelf": {
    "title": "我的书架",
    "newBook": "新建书籍",
    "empty": "还没有书，开始你的第一本",
    "createFirst": "创建第一本书",
    "loadFailed": "加载书籍失败",
    "updatedAt": "更新于 {time}"
  },
  "book": {
    "status": { "draft": "草稿", "writing": "写作中", "done": "完结" },
    "open": "打开",
    "edit": "编辑",
    "delete": "删除",
    "titleLabel": "书名",
    "titlePlaceholder": "起一个书名",
    "descriptionLabel": "简介",
    "descriptionPlaceholder": "一句话简介（可选）",
    "statusLabel": "状态",
    "createTitle": "新建书籍",
    "editTitle": "编辑书籍",
    "save": "保存",
    "cancel": "取消",
    "saving": "保存中…",
    "deleteTitle": "删除《{title}》？",
    "deleteConfirm": "删除后无法恢复，确认删除？",
    "confirmDelete": "确认删除",
    "created": "已创建",
    "updated": "已更新",
    "deleted": "已删除",
    "saveFailed": "保存失败",
    "deleteFailed": "删除失败"
  },
  "account": {
    "stats": "统计",
    "modelSettings": "模型设置",
    "accountSettings": "账号设置",
    "logout": "退出登录"
  },
  "workspace": {
    "comingSoon": "工作台建设中",
    "backToShelf": "返回书架",
    "notFound": "书籍不存在或无权访问"
  }
```

- [ ] **Step 2: en.json 对齐同结构**

`apps/web/messages/en.json` 同位置补：

`auth` 节点内追加：
```json
    "brandSlogan": "Before you write, talk it over with your agent.",
    "loggingIn": "Signing in…"
```

顶层新增：
```json
  "shelf": {
    "title": "My Bookshelf",
    "newBook": "New book",
    "empty": "No books yet — start your first",
    "createFirst": "Create your first book",
    "loadFailed": "Failed to load books",
    "updatedAt": "Updated {time}"
  },
  "book": {
    "status": { "draft": "Draft", "writing": "Writing", "done": "Done" },
    "open": "Open",
    "edit": "Edit",
    "delete": "Delete",
    "titleLabel": "Title",
    "titlePlaceholder": "Name your book",
    "descriptionLabel": "Description",
    "descriptionPlaceholder": "One-line description (optional)",
    "statusLabel": "Status",
    "createTitle": "New book",
    "editTitle": "Edit book",
    "save": "Save",
    "cancel": "Cancel",
    "saving": "Saving…",
    "deleteTitle": "Delete \"{title}\"?",
    "deleteConfirm": "This cannot be undone. Delete anyway?",
    "confirmDelete": "Delete",
    "created": "Created",
    "updated": "Updated",
    "deleted": "Deleted",
    "saveFailed": "Save failed",
    "deleteFailed": "Delete failed"
  },
  "account": {
    "stats": "Stats",
    "modelSettings": "Model settings",
    "accountSettings": "Account settings",
    "logout": "Log out"
  },
  "workspace": {
    "comingSoon": "Workspace coming soon",
    "backToShelf": "Back to bookshelf",
    "notFound": "Book not found or access denied"
  }
```

- [ ] **Step 3: 校验对齐**

Run: `pnpm sync:locales -- --check`
Expected: `Done (missing=0, asymmetric=0)`。

- [ ] **Step 4: Commit**

```bash
git add apps/web/messages/zh.json apps/web/messages/en.json
git commit -m "feat(web): 书架/书籍/账号/工作台 i18n key（zh/en）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5：getServerProfile + AuthHydrator

**Files:**
- Create `apps/web/src/lib/server-auth.ts`
- Create `apps/web/src/components/app/auth-hydrator.tsx`

- [ ] **Step 1: server-auth.ts（服务端取 profile）**

Server-only 工具：用 `cookies()` 读 httpOnly token，服务端直连 Nest（`NEST_INTERNAL_URL`，不走 proxy.ts）取 profile，解 envelope。任何失败返 `null`。

```ts
import "server-only";
import type { Account } from "@qriter/types";
import { cookies } from "next/headers";

const NEST = process.env.NEST_INTERNAL_URL ?? "http://127.0.0.1:3000";
const TOKEN_COOKIE = "qriter_token";

/**
 * 服务端读取当前登录账号档案。
 * 流程：cookies() 读 httpOnly qriter_token → fetch NEST /api/auth/profile（Bearer）
 *      → 解 envelope 取 data。无 token / 非 2xx / success=false → 返回 null。
 * 仅在 server component（路由组 layout）调用；不经 proxy.ts（那是浏览器侧）。
 */
export async function getServerProfile(): Promise<Account | null> {
  const store = await cookies();
  const token = store.get(TOKEN_COOKIE)?.value;
  if (!token) return null;
  try {
    const res = await fetch(`${NEST}/api/auth/profile`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      success?: boolean;
      data?: Account;
    };
    if (json?.success === false || !json?.data) return null;
    return json.data;
  } catch {
    return null;
  }
}
```

> `cookies()` 在 Next 16 是 async（返回 Promise），故 `await cookies()`。`server-only` 包阻止该模块被客户端打包。

- [ ] **Step 2: AuthHydrator（SSR profile → currentUserAtom）**

极薄 client 组件：把服务端取到的 profile 写进现有 `currentUserAtom`（`apps/web/src/atoms/auth.ts`），供 AccountMenu / 后续 agent 读取。无渲染输出。

```tsx
"use client";

import type { Account } from "@qriter/types";
import { useSetAtom } from "jotai";
import { useEffect } from "react";
import { currentUserAtom } from "@/atoms/auth";

/**
 * 把 (app)/layout 服务端取到的 profile 水合进 currentUserAtom。
 * jotai Provider 在 RootLayout 的 Providers 内、本组件之上，故可正常 set。
 */
export function AuthHydrator({ user }: { user: Account }) {
  const setCurrentUser = useSetAtom(currentUserAtom);
  useEffect(() => {
    setCurrentUser(user);
  }, [user, setCurrentUser]);
  return null;
}
```

- [ ] **Step 3: 类型检查**

Run: `pnpm --filter @qriter/web typecheck`
Expected: 通过（若提示缺 `server-only` 依赖，先 `pnpm --filter @qriter/web add server-only` 再提交；Next 通常已带）。

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/server-auth.ts apps/web/src/components/app/auth-hydrator.tsx
git commit -m "feat(web): getServerProfile 服务端鉴权 + AuthHydrator 水合 currentUserAtom

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6：books.ts react-query hooks + bookSpineColor

**Files:**
- Create `apps/web/src/rest/books.ts`
- Create `apps/web/src/lib/book-spine.ts`

- [ ] **Step 1: bookSpineColor 纯函数**

按书名确定性算一个暖系书脊渐变（同名同色），用于 BookCard 封面。纯函数、无外部依赖。

```ts
/**
 * 按书名确定性生成书脊渐变色（CSS linear-gradient）。
 * 暖纸文学色域内取色：固定取陶土→沙金区间的色相，亮度随 hash 微调，保证同名同色。
 */
export function bookSpineColor(title: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = (hash * 31 + title.charCodeAt(i)) >>> 0;
  }
  // 色相限定 18°(赤褐)~42°(沙金) 暖区，避免冷色破坏暖纸基调
  const hue = 18 + (hash % 24);
  const top = `hsl(${hue} 42% 62%)`;
  const bottom = `hsl(${hue + 6} 48% 46%)`;
  return `linear-gradient(160deg, ${top}, ${bottom})`;
}
```

- [ ] **Step 2: books.ts react-query hooks**

同源 `/api/books`（经 proxy.ts 加 Bearer 转 Nest，envelope 已由 apiClient `unwrapEnvelope` 解）。query key `["books"]`。

```ts
"use client";

import type {
  Book,
  CreateBookInput,
  UpdateBookInput,
} from "@qriter/types";
import { apiClient } from "@qriter/web-common";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

/** 书籍列表 query key。 */
export const booksQueryKey = ["books"] as const;

/** 拉取当前账号的书籍列表。 */
async function fetchBooks(): Promise<Book[]> {
  const { data } = await apiClient.get<Book[]>("/api/books");
  return data;
}

/** 列出我的书。 */
export function useBooks() {
  return useQuery({ queryKey: booksQueryKey, queryFn: fetchBooks });
}

/** 新建书籍。 */
export function useCreateBook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateBookInput): Promise<Book> => {
      const { data } = await apiClient.post<Book>("/api/books", input);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: booksQueryKey }),
  });
}

/** 更新书籍（改名 / 简介 / 状态）。 */
export function useUpdateBook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      id: string;
      input: UpdateBookInput;
    }): Promise<Book> => {
      const { data } = await apiClient.patch<Book>(
        `/api/books/${args.id}`,
        args.input,
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: booksQueryKey }),
  });
}

/** 删除书籍。 */
export function useDeleteBook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      await apiClient.delete(`/api/books/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: booksQueryKey }),
  });
}
```

- [ ] **Step 3: 类型检查**

Run: `pnpm --filter @qriter/web typecheck`
Expected: 通过。

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/rest/books.ts apps/web/src/lib/book-spine.ts
git commit -m "feat(web): books react-query hooks + bookSpineColor 书脊取色

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7：登录前 split-brand —— BrandPanel + (auth) 路由组 + 迁移 restyle

**Files:**
- Create `apps/web/src/components/auth/brand-panel.tsx`
- Create `apps/web/src/app/(auth)/layout.tsx`
- Move `apps/web/src/app/login/page.tsx` → `apps/web/src/app/(auth)/login/page.tsx`（restyle）
- Move `apps/web/src/app/auth/google/page.tsx` → `apps/web/src/app/(auth)/auth/google/page.tsx`（restyle）

- [ ] **Step 1: BrandPanel（暖渐变品牌墙）**

> 本仓 **没有** next-intl 服务端配置（无 `createNextIntlPlugin` / `getRequestConfig`），intl 是「客户端 IntlProvider + bundled messages」。因此**凡渲染译文的组件都必须是 client 组件用 `useTranslations`**；`next-intl/server` 的 `getTranslations` 在此仓会崩。路由组 *layout* 本身不渲染译文（只做鉴权门），可保持 server。

```tsx
"use client";

import { useTranslations } from "next-intl";

/**
 * 登录前左侧品牌墙 —— 暖渐变 + 大宋体 Qriter + 文学 slogan。
 * client 组件（用 next-intl 客户端 useTranslations）。移动端由父布局收为顶部窄条。
 */
export function BrandPanel() {
  const t = useTranslations("auth");
  return (
    <aside
      className="relative flex flex-col justify-center gap-3 p-10 text-[#3a2f25] md:w-[44%]"
      style={{
        background:
          "linear-gradient(155deg, #efe6d8 0%, #caa07e 75%, #b5654a 120%)",
      }}
    >
      <div className="font-serif text-3xl font-semibold tracking-tight">
        Qriter
      </div>
      <p className="max-w-[16rem] font-serif text-base leading-relaxed text-[#4a3d2f]">
        {t("brandSlogan")}
      </p>
    </aside>
  );
}
```

- [ ] **Step 2: (auth)/layout.tsx（SSR 门 + split chrome）**

server component：有 profile 则 `redirect("/")`；否则渲染 BrandPanel + 右侧 slot。

```tsx
import { redirect } from "next/navigation";
import { BrandPanel } from "@/components/auth/brand-panel";
import { getServerProfile } from "@/lib/server-auth";

/**
 * 登录前路由组布局（SSR 鉴权门）。
 * 已登录（有 profile）→ redirect("/")；未登录 → 渲染品牌墙 + 右侧表单 slot。
 * 承载 (auth)/login 与 (auth)/auth/google（回调）。
 */
export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getServerProfile();
  if (profile) redirect("/");
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <BrandPanel />
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-[380px]">{children}</div>
      </main>
    </div>
  );
}
```

- [ ] **Step 3: 迁移并 restyle login 页**

把 `apps/web/src/app/login/page.tsx` 移到 `apps/web/src/app/(auth)/login/page.tsx`。**登录逻辑（useLogin / Form / Google 按钮 window.location）完全不动**，仅去掉自带的 `min-h-screen` 居中 `<main>` + Card 外壳（改为填充父布局右 slot），套暖纸排版。

```tsx
"use client";

import { Alert, AlertDescription, Button, Input } from "@qriter/design";
import { Form, FormItem } from "@qriter/design/form";
import { useSchema } from "@qriter/design/hooks";
import { type LoginInput, LoginSchema } from "@qriter/types";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useLogin } from "@/rest/auth";

export default function LoginPage() {
  const router = useRouter();
  const loginMutation = useLogin();
  const t = useTranslations("auth");
  const schema = useSchema(LoginSchema);

  const onSubmit = async (values: LoginInput) => {
    try {
      await loginMutation.mutateAsync(values);
      router.push("/");
    } catch {
      // 错误经 loginMutation.error 暴露给下方 Alert
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">
          {t("loginTitle")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("loginSubtitle")}</p>
      </div>

      <Form
        schema={schema}
        defaultValues={{ email: "", password: "" }}
        onSubmit={onSubmit}
        className="flex flex-col gap-4"
      >
        <FormItem name="email" label={t("email")}>
          <Input
            type="email"
            autoComplete="email"
            placeholder={t("emailPlaceholder")}
          />
        </FormItem>

        <FormItem name="password" label={t("password")}>
          <Input type="password" autoComplete="current-password" />
        </FormItem>

        {loginMutation.error ? (
          <Alert variant="destructive">
            <AlertDescription>{t("loginFailed")}</AlertDescription>
          </Alert>
        ) : null}

        <Button
          type="submit"
          className="mt-2 w-full"
          disabled={loginMutation.isPending}
        >
          {loginMutation.isPending ? t("submitting") : t("submit")}
        </Button>

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
      </Form>
    </div>
  );
}
```

- [ ] **Step 4: 迁移并 restyle 回调页**

把 `apps/web/src/app/auth/google/page.tsx` 移到 `apps/web/src/app/(auth)/auth/google/page.tsx`。**换码逻辑完全不动**（`POST /api/auth/google/code` + 写 currentUserAtom + `router.replace("/")`），仅把外层 `min-h-screen` 居中 `<main>` 换成填充右 slot 的轻量容器（父布局已居中）。

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
    <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
      {error ? (
        <>
          <span>{t("loginFailed")}</span>
          <a className="underline" href="/login">
            {t("backToLogin")}
          </a>
        </>
      ) : (
        <div className="flex items-center gap-2">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          <span>{t("loggingIn")}</span>
        </div>
      )}
    </div>
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

- [ ] **Step 5: 删除旧目录**

```bash
git rm apps/web/src/app/login/page.tsx apps/web/src/app/auth/google/page.tsx
```
（移动即「旧路径 git rm + 新路径新增」；若目录空了一并清理。）

- [ ] **Step 6: 类型检查 + 构建冒烟**

Run: `pnpm --filter @qriter/web typecheck && pnpm --filter @qriter/web build`
Expected: 通过；`/login`、`/auth/google` 编译为 (auth) 组路由（URL 不变）。

> 此时根 `app/page.tsx`（旧占位首页）仍在、仍由客户端 AuthGuard 守，应用照常 build。Task 9 做 (app) 切换时再清。

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/auth/brand-panel.tsx apps/web/src/app/\(auth\)
git commit -m "feat(web): 登录前 split-brand 路由组（BrandPanel + SSR 门 + login/callback restyle）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8：书架组件 —— BookCard / 表单弹窗 / 删除弹窗 / BookGrid

**Files:**
- Create `apps/web/src/components/app/book-card.tsx`
- Create `apps/web/src/components/app/book-form-dialog.tsx`
- Create `apps/web/src/components/app/book-delete-dialog.tsx`
- Create `apps/web/src/components/app/book-grid.tsx`

- [ ] **Step 1: BookCard（展示 + 卡内操作菜单）**

纯展示 + 通过 props 回调编辑 / 删除；整卡点击进工作台。状态 chip 用 `Badge`，封面用 `bookSpineColor`。相对时间用 `Intl.RelativeTimeFormat`（轻量、无新依赖）。

```tsx
"use client";

import type { Book } from "@qriter/types";
import {
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@qriter/design";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { bookSpineColor } from "@/lib/book-spine";

/** 把 ISO 时间转成「N 天前」类相对文案（zh/en 由 locale 决定）。 */
function relativeTime(iso: string, locale: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const mins = Math.round(diffMs / 60000);
  if (Math.abs(mins) < 60) return rtf.format(mins, "minute");
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, "hour");
  return rtf.format(Math.round(hours / 24), "day");
}

export function BookCard({
  book,
  locale,
  onEdit,
  onDelete,
}: {
  book: Book;
  locale: string;
  onEdit: (book: Book) => void;
  onDelete: (book: Book) => void;
}) {
  const router = useRouter();
  const t = useTranslations("book");
  const tShelf = useTranslations("shelf");

  const goWorkspace = () => router.push(`/books/${book.id}`);

  return (
    // 用 div + role=button（不用 <button>）：卡内含 DropdownMenu 触发按钮，
    // button 套 button 是非法 HTML / a11y 报错。键盘 Enter/Space 也可进工作台。
    <div
      role="button"
      tabIndex={0}
      onClick={goWorkspace}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          goWorkspace();
        }
      }}
      className="group relative flex cursor-pointer flex-col gap-3 rounded-xl border border-border bg-card p-4 text-left shadow-sm transition hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <div
          className="h-14 w-10 shrink-0 rounded-sm shadow-inner"
          style={{ background: bookSpineColor(book.title) }}
          aria-hidden
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              className="rounded p-1 text-muted-foreground opacity-0 transition group-hover:opacity-100"
            >
              ⋯
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            onClick={(e) => e.stopPropagation()}
          >
            <DropdownMenuItem onSelect={() => onEdit(book)}>
              {t("edit")}
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => onDelete(book)}
            >
              {t("delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex flex-col gap-1">
        <h3 className="font-serif text-lg font-semibold text-foreground">
          {book.title}
        </h3>
        {book.description ? (
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {book.description}
          </p>
        ) : null}
      </div>

      <div className="mt-auto flex items-center gap-2">
        <Badge variant="secondary">{t(`status.${book.status}`)}</Badge>
        <span className="text-xs text-muted-foreground">
          {tShelf("updatedAt", { time: relativeTime(book.updatedAt, locale) })}
        </span>
      </div>
    </div>
  );
}
```

> 若 `Badge` 不支持 `variant="secondary"`，去掉该 prop（取默认）。`DropdownMenuItem` 的 `variant="destructive"` 同理（不支持则去掉）。

- [ ] **Step 2: BookFormDialog（新建 / 编辑共用）**

`book` 为 `null` = 新建，否则编辑（预填）。表单用共享 `CreateBookSchema`（新建）/ 直接受控字段（编辑含 status）。为简单可靠，这里用受控 state + 原生表单，避免 Form 在「预填 + status Select」上的额外接线。

```tsx
"use client";

import type { Book, BookStatus } from "@qriter/types";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from "@qriter/design";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useCreateBook, useUpdateBook } from "@/rest/books";

const STATUSES: BookStatus[] = ["draft", "writing", "done"];

export function BookFormDialog({
  open,
  book,
  onOpenChange,
}: {
  open: boolean;
  book: Book | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("book");
  const create = useCreateBook();
  const update = useUpdateBook();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<BookStatus>("draft");

  // 打开时按 book 预填（新建则清空）
  useEffect(() => {
    if (!open) return;
    setTitle(book?.title ?? "");
    setDescription(book?.description ?? "");
    setStatus((book?.status as BookStatus) ?? "draft");
  }, [open, book]);

  const pending = create.isPending || update.isPending;

  const onSave = async () => {
    if (!title.trim()) return;
    try {
      if (book) {
        await update.mutateAsync({
          id: book.id,
          input: { title, description: description || undefined, status },
        });
        toast.success(t("updated"));
      } else {
        await create.mutateAsync({
          title,
          description: description || undefined,
        });
        toast.success(t("created"));
      }
      onOpenChange(false);
    } catch {
      toast.error(t("saveFailed"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-serif">
            {book ? t("editTitle") : t("createTitle")}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-foreground">{t("titleLabel")}</span>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("titlePlaceholder")}
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-foreground">{t("descriptionLabel")}</span>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("descriptionPlaceholder")}
            />
          </label>

          {book ? (
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-foreground">{t("statusLabel")}</span>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as BookStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`status.${s}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button onClick={onSave} disabled={pending || !title.trim()}>
            {pending ? t("saving") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: BookDeleteDialog（二次确认）**

```tsx
"use client";

import type { Book } from "@qriter/types";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  toast,
} from "@qriter/design";
import { useTranslations } from "next-intl";
import { useDeleteBook } from "@/rest/books";

export function BookDeleteDialog({
  book,
  onOpenChange,
}: {
  book: Book | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("book");
  const del = useDeleteBook();

  const onConfirm = async () => {
    if (!book) return;
    try {
      await del.mutateAsync(book.id);
      toast.success(t("deleted"));
      onOpenChange(false);
    } catch {
      toast.error(t("deleteFailed"));
    }
  };

  return (
    <Dialog open={book != null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-serif">
            {book ? t("deleteTitle", { title: book.title }) : ""}
          </DialogTitle>
          <DialogDescription>{t("deleteConfirm")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={del.isPending}
          >
            {t("confirmDelete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

> 若 `Button` 不支持 `variant="destructive"`，改用默认 variant + `className` 加红色，或去掉 prop。

- [ ] **Step 4: BookGrid（编排：列表 / 新建卡 / 弹窗 / 空态 / 骨架）**

```tsx
"use client";

import type { Book } from "@qriter/types";
import { Skeleton } from "@qriter/design";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useAppLocale } from "@/components/intl-provider";
import { useBooks } from "@/rest/books";
import { BookCard } from "./book-card";
import { BookDeleteDialog } from "./book-delete-dialog";
import { BookFormDialog } from "./book-form-dialog";

export function BookGrid() {
  const t = useTranslations("shelf");
  const { locale } = useAppLocale();
  const { data: books, isLoading, isError } = useBooks();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Book | null>(null);
  const [deleting, setDeleting] = useState<Book | null>(null);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (book: Book) => {
    setEditing(book);
    setFormOpen(true);
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-44 rounded-xl" />
        ))}
      </div>
    );
  }

  if (isError) {
    return <p className="text-sm text-destructive">{t("loadFailed")}</p>;
  }

  const list = books ?? [];

  return (
    <>
      {list.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-20 text-center">
          <p className="text-muted-foreground">{t("empty")}</p>
          <button
            type="button"
            onClick={openCreate}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            {t("createFirst")}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
          {list.map((book) => (
            <BookCard
              key={book.id}
              book={book}
              locale={locale}
              onEdit={openEdit}
              onDelete={setDeleting}
            />
          ))}
          <button
            type="button"
            onClick={openCreate}
            className="flex h-44 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-muted-foreground transition hover:border-primary hover:text-primary"
          >
            <span className="text-2xl">＋</span>
            <span className="text-sm">{t("newBook")}</span>
          </button>
        </div>
      )}

      <BookFormDialog
        open={formOpen}
        book={editing}
        onOpenChange={setFormOpen}
      />
      <BookDeleteDialog
        book={deleting}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      />
    </>
  );
}
```

> `useAppLocale` 来自既有 `apps/web/src/components/intl-provider.tsx`（导出 `useAppLocale`），给 BookCard 传 locale 算相对时间。

- [ ] **Step 5: 类型检查**

Run: `pnpm --filter @qriter/web typecheck`
Expected: 通过。若某组件 prop（如 `Badge variant` / `Button variant="destructive"` / `DropdownMenuItem variant`）类型不存在，按各 Step 注释去掉该 prop 后再过。

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/app/book-card.tsx apps/web/src/components/app/book-form-dialog.tsx apps/web/src/components/app/book-delete-dialog.tsx apps/web/src/components/app/book-grid.tsx
git commit -m "feat(web): 书架组件 BookCard/BookGrid + 新建/编辑/删除弹窗

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9：(app) shell 切换 —— TopBar/AccountMenu + 路由组 + 移除 AuthGuard

**Files:**
- Create `apps/web/src/components/app/top-bar.tsx`
- Create `apps/web/src/components/app/account-menu.tsx`
- Create `apps/web/src/app/(app)/layout.tsx`
- Move `apps/web/src/app/page.tsx` → `apps/web/src/app/(app)/page.tsx`（重写为书架）
- Create `apps/web/src/app/(app)/books/[id]/page.tsx`（工作台 stub）
- Create `apps/web/src/app/(app)/stats/page.tsx`、`apps/web/src/app/(app)/settings/model/page.tsx`、`apps/web/src/app/(app)/settings/account/page.tsx`（占位 stub）
- Modify `apps/web/src/components/providers.tsx`（移除 `<AuthGuard>`）
- Delete `apps/web/src/components/auth-guard.tsx`

- [ ] **Step 1: AccountMenu（头像 + 下拉：占位入口 + 退出）**

```tsx
"use client";

import {
  Avatar,
  AvatarFallback,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@qriter/design";
import { useAtomValue } from "jotai";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { currentUserAtom } from "@/atoms/auth";
import { useLogout } from "@/rest/auth";

export function AccountMenu() {
  const t = useTranslations("account");
  const router = useRouter();
  const user = useAtomValue(currentUserAtom);
  const logout = useLogout();
  const initial = (user?.displayName ?? user?.email ?? "?")
    .charAt(0)
    .toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="rounded-full outline-none">
          <Avatar>
            <AvatarFallback>{initial}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onSelect={() => router.push("/stats")}>
          {t("stats")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push("/settings/model")}>
          {t("modelSettings")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push("/settings/account")}>
          {t("accountSettings")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => logout.mutate()}>
          {t("logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 2: TopBar（品牌 + 账号菜单）**

```tsx
import Link from "next/link";
import { AccountMenu } from "./account-menu";

/** 登录后顶栏：左宋体品牌（回书架）+ 右账号菜单。 */
export function TopBar() {
  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-card px-6">
      <Link
        href="/"
        className="font-serif text-xl font-semibold tracking-tight text-foreground"
      >
        Qriter
      </Link>
      <AccountMenu />
    </header>
  );
}
```

- [ ] **Step 3: (app)/layout.tsx（SSR 门 + shell + 水合）**

```tsx
import { Toaster } from "@qriter/design";
import { redirect } from "next/navigation";
import { AuthHydrator } from "@/components/app/auth-hydrator";
import { TopBar } from "@/components/app/top-bar";
import { getServerProfile } from "@/lib/server-auth";

/**
 * 登录后路由组布局（SSR 鉴权门）。
 * 未登录 → redirect("/login")；已登录 → 渲染顶栏 shell + 把 profile 水合进 currentUserAtom。
 * 承载书架(/)、工作台(/books/[id])、统计/设置占位。
 * 挂 <Toaster />（client）供书架弹窗 toast；全仓仅此处挂一次。
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getServerProfile();
  if (!profile) redirect("/login");
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AuthHydrator user={profile} />
      <TopBar />
      <main className="flex-1">{children}</main>
      <Toaster />
    </div>
  );
}
```

> `Toaster`（sonner）是 client 组件，作为 server layout 的子节点渲染合法。`toast()` 调用（Task 8 弹窗内）需要它已挂载才显示。

- [ ] **Step 4: (app)/page.tsx（书架，替换旧占位首页）**

新建 `apps/web/src/app/(app)/page.tsx`（client，用 `useTranslations`；BookGrid 本身也是 client）：

```tsx
"use client";

import { useTranslations } from "next-intl";
import { BookGrid } from "@/components/app/book-grid";

/** 登录后首页 = 书架。 */
export default function ShelfPage() {
  const t = useTranslations("shelf");
  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="mb-6 font-serif text-2xl font-semibold text-foreground">
        {t("title")}
      </h1>
      <BookGrid />
    </div>
  );
}
```

删除旧首页：
```bash
git rm apps/web/src/app/page.tsx
```

- [ ] **Step 5: 工作台 stub `(app)/books/[id]/page.tsx`**

最小占位（client，读 books 列表里该 id 显示书名；查不到则显示通用占位）。保持导航闭环。

```tsx
"use client";

import { Button } from "@qriter/design";
import { useRouter } from "next/navigation";
import { use } from "react";
import { useTranslations } from "next-intl";
import { useBooks } from "@/rest/books";

/** 工作台占位页（block ④ 填充为三栏编辑器）。 */
export default function WorkspaceStubPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const t = useTranslations("workspace");
  const { data: books } = useBooks();
  const book = books?.find((b) => b.id === id);

  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 px-6 py-24 text-center">
      <h1 className="font-serif text-2xl font-semibold text-foreground">
        {book?.title ?? t("notFound")}
      </h1>
      <p className="text-muted-foreground">{t("comingSoon")}</p>
      <Button variant="outline" onClick={() => router.push("/")}>
        ‹ {t("backToShelf")}
      </Button>
    </div>
  );
}
```

- [ ] **Step 6: 统计 / 设置占位 stub（3 个）**

三页同形（占位「建设中」），均为 client 组件（`useTranslations`）。`apps/web/src/app/(app)/stats/page.tsx`：
```tsx
"use client";

import { useTranslations } from "next-intl";

export default function StatsStubPage() {
  const t = useTranslations("account");
  return (
    <div className="mx-auto max-w-3xl px-6 py-24 text-center text-muted-foreground">
      {t("stats")} · coming soon
    </div>
  );
}
```

`apps/web/src/app/(app)/settings/model/page.tsx`：
```tsx
"use client";

import { useTranslations } from "next-intl";

export default function ModelSettingsStubPage() {
  const t = useTranslations("account");
  return (
    <div className="mx-auto max-w-3xl px-6 py-24 text-center text-muted-foreground">
      {t("modelSettings")} · coming soon
    </div>
  );
}
```

`apps/web/src/app/(app)/settings/account/page.tsx`：
```tsx
"use client";

import { useTranslations } from "next-intl";

export default function AccountSettingsStubPage() {
  const t = useTranslations("account");
  return (
    <div className="mx-auto max-w-3xl px-6 py-24 text-center text-muted-foreground">
      {t("accountSettings")} · coming soon
    </div>
  );
}
```

- [ ] **Step 7: 移除客户端 AuthGuard**

`apps/web/src/components/providers.tsx` 改为（去掉 `<AuthGuard>` 包裹与 import）：
```tsx
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Provider as JotaiProvider } from "jotai";
import { useState } from "react";

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        staleTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
        networkMode: "always",
      },
    },
  });
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => createQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <JotaiProvider>{children}</JotaiProvider>
    </QueryClientProvider>
  );
}
```

删除文件：
```bash
git rm apps/web/src/components/auth-guard.tsx
```

- [ ] **Step 8: 类型检查 + 构建冒烟**

Run: `pnpm --filter @qriter/web typecheck && pnpm --filter @qriter/web build`
Expected: 通过；路由树含 `(app)` 组的 `/`、`/books/[id]`、`/stats`、`/settings/model`、`/settings/account` 与 `(auth)` 组的 `/login`、`/auth/google`。无 `auth-guard` 残留引用（已删）。

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/components/app/top-bar.tsx apps/web/src/components/app/account-menu.tsx apps/web/src/app/\(app\) apps/web/src/components/providers.tsx
git commit -m "feat(web): (app) shell 切换（TopBar/AccountMenu + SSR 门 + 书架/stub + 移除客户端 AuthGuard）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10：全量验证门 + 收尾

**Files:** —（验证 + 格式化收尾）

- [ ] **Step 1: 格式化 + lint 修复**

Run: `pnpm check:format`
Expected: Biome 格式化 / import 排序 / lint 自动修复；无报错残留。

- [ ] **Step 2: 全量类型 + 围栏 + i18n**

Run: `pnpm typecheck && pnpm check && pnpm sync:locales -- --check`
Expected: 全包类型通过；6 个围栏 0 finding（check:repo 确认 BookController 未注 Repo、Book→BookService 归属不变；check:dead 无新增死导出）；i18n `Done (missing=0, asymmetric=0)`。

- [ ] **Step 3: 后端 e2e（确认 BookController 行为）**

Run: `pnpm dev:db:up && pnpm test -- book.spec  # 根 jest（apps/server 无 test script）`
Expected: book e2e 全绿（pg/redis 不可达则相应组 skip）。

- [ ] **Step 4: 前端构建冒烟**

Run: `pnpm --filter @qriter/web build`
Expected: `next build` 成功，(auth)/(app) 路由组 + route handlers 全部编译通过。

- [ ] **Step 5: 收尾 Commit（若 check:format 有改动）**

```bash
git add -u apps libs packages
git commit -m "chore(web): 登录/书架前端格式化收尾

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
> 注意：`git add -u apps libs packages` 只补已跟踪文件，**绝不** `git add .claude/settings.json`。

- [ ] **Step 6: 人工冒烟（可选，需起全栈 + 真凭证）**

Run: `pnpm dev`（Nest :3000 + Next :3001；`apps/server` 配好 Nacos / `application.local.yml`）
1. 未登录访问 `http://localhost:3001/` → SSR 跳 `/login`（split-brand 左品牌右表单）。
2. 密码登录 → 进书架；空态显示「创建第一本书」。
3. 新建书籍 → 书卡出现（书脊封面 + 草稿 chip + 相对时间）。
4. 编辑改名 / 改状态 → 即时刷新；删除 → 二次确认后消失（toast）。
5. 点书 → 进 `/books/[id]` stub（书名 + 建设中 + 返回书架）。
6. 账号菜单 → 统计 / 设置进占位页；退出 → 清 cookie → 跳 `/login`。
7. 已登录直接访问 `/login` → SSR 跳 `/`（无闪烁）。

---

## 自检（spec 覆盖对照）

- §3 后端薄 BookController（list/建/改/删 + assertOwner）：Task 2 ✅；BookDto 响应 DTO：Task 1 ✅；e2e（list/建/改/删/越权 403/未登录 401）：Task 3 ✅；book.json i18n：Task 1 ✅。
- §4 SSR 路由组 + getServerProfile + AuthHydrator + 移除 AuthGuard + route 迁移：Task 5（helper/hydrator）+ Task 7（(auth)）+ Task 9（(app) 切换、删 AuthGuard）✅。
- §5 登录前 split-brand（BrandPanel + login/callback restyle 逻辑不动）：Task 7 ✅。
- §6 书架（TopBar + AccountMenu + BookGrid/BookCard + 新建/编辑/删除 Dialog + books.ts hooks + bookSpineColor + 空态/Skeleton）：Task 6（hooks/取色）+ Task 8（组件）+ Task 9（TopBar/AccountMenu/shelf page）✅。
- §7 工作台 stub：Task 9 Step 5 ✅。账号菜单占位 stub：Task 9 Step 6 ✅。
- §8 i18n（shelf/book/account/workspace）：Task 4 ✅；测试（后端 e2e + 前端 build 冒烟）：Task 3 / Task 10 ✅；围栏：Task 10 ✅；边界（本轮不挂 AgentDock、不做章数字数聚合）：未排任何相关 task ✅。
- §9 成功标准（SSR 门无闪烁 / 登录不回归 / 书架真实 CRUD / 点书进 stub / AuthGuard 移除 / 全绿）：Task 9 + Task 10 覆盖 ✅。

> 边界提示：①`(auth)` 与 `(app)` 两个 layout 都在 RootLayout（Providers）之内，server component 作为 client Providers 的 children 合法；`AuthHydrator`（client）在 jotai Provider 之下，可正常 set atom。②SSR `getServerProfile` 直连 `NEST_INTERNAL_URL`，绕过 `proxy.ts`（proxy 仅拦浏览器 `/api/*`）。③登录 / 换码逻辑全程未改，仅迁移 + 去外壳；cookie 仍由既有 route handler 下发。④`apps/web` 无 jest，前端不写单测，验证靠 typecheck + `next build`。
