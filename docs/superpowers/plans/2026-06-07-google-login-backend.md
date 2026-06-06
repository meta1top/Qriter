# 谷歌登录 — 后端实施 Plan（Plan A / 共两份）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Nest 后端新增 Google Authorization-Code 登录（`account_identity` 表 + `google-auth-library` 换 code + 无状态签名 state），并补齐 `GET /auth/profile`、`GET /auth/ws-ticket`，全程向后兼容现有 Bearer 鉴权。

**Architecture:** `account` 域加独立 `AccountIdentity` 实体（一人多 provider）；`password_hash` 改 nullable；`AccountIdentityService.findOrCreateByGoogle` 跨表写挂 `@Transactional`。`apps/server` 新增无 DB 的 `GoogleOAuthService`（构造同意页 URL、用 `JwtService` 签/验 10min state、换 code 验 id_token）。`AuthController` 加 `GET/POST /auth/google`、`GET /auth/profile`、`GET /auth/ws-ticket`。

**Tech Stack:** NestJS · TypeORM(Postgres) · `@nestjs/jwt` · `google-auth-library` · Jest（unit + e2e/supertest）· 项目配置法（Nacos / `application.yml`）。

**前置阅读（实施者必看）：** 已评审 spec `docs/superpowers/specs/2026-06-07-google-login-design.md`；项目约定见根 `.claude/CLAUDE.md`（错误码区段、`@Transactional` 仅 `@qriter/common`、Repo 唯一归属、迁移规范、公开方法中文 JSDoc）。

---

## 文件结构

**新建**
- `libs/account/src/entities/account-identity.entity.ts` — `AccountIdentity` 实体
- `libs/account/src/services/account-identity.service.ts` — `AccountIdentity` 唯一归属 + `findOrCreateByGoogle`
- `apps/server/src/auth/google-oauth.service.ts` — `GoogleOAuthService`（无 DB）
- `apps/server/src/migrations/1780776290465-AddAccountIdentity.ts` — 迁移
- `apps/server/src/auth/google-oauth.service.spec.ts` — 单测（state / exchangeCode mock）
- `apps/server/test/e2e/google-auth.spec.ts` — e2e（POST /auth/google、profile、ws-ticket）

**修改**
- `libs/account/src/entities/account.entity.ts` — `passwordHash` 改 nullable
- `libs/account/src/services/user.service.ts` — 加 `findByEmail` / `createSocialAccount`；`validateCredentials` 处理 null 密码
- `libs/account/src/errors/account.error-codes.ts` — 加 1003/1004/1005
- `libs/account/src/account.module.ts` — `TxTypeOrmModule.forFeature([Account, AccountIdentity])` + 注册导出 `AccountIdentityService`
- `libs/account/src/index.ts` — 导出 `AccountIdentity` / `AccountIdentityService`
- `libs/account/src/dto/index.ts` — 加 `GoogleCodeDto` / `AccountDto`
- `libs/types/src/account/account.schema.ts` — 加 `GoogleCodeSchema`
- `apps/server/src/config/app-config.schema.ts` — 加 `GoogleOAuthConfigSchema` + `oauth` 切片
- `apps/server/src/auth/auth.module.ts` — providers 加 `GoogleOAuthService`
- `apps/server/src/rest/auth.controller.ts` — 4 个新端点
- `apps/server/i18n/zh/account.json` / `apps/server/i18n/en/account.json` — 3 条文案
- `apps/server/test/setup/test-db.ts` — entities 加 `AccountIdentity`、migrations 加新迁移
- `apps/server/package.json` — 依赖 `google-auth-library`

---

## Task 1：装依赖 google-auth-library

**Files:** Modify `apps/server/package.json`

- [ ] **Step 1: 安装**

Run（仓库根）：`pnpm --filter @qriter/server add google-auth-library`
Expected: `apps/server/package.json` 的 `dependencies` 出现 `google-auth-library`，`pnpm-lock.yaml` 更新。

- [ ] **Step 2: Commit**

```bash
git add apps/server/package.json pnpm-lock.yaml
git commit -m "build(server): 添加 google-auth-library 依赖"
```

---

## Task 2：错误码 1003/1004/1005

**Files:** Modify `libs/account/src/errors/account.error-codes.ts`

- [ ] **Step 1: 加三个错误码（接 1002 连续）**

在 `defineErrorCode({...})` 的 `ACCOUNT_NOT_FOUND` 之后追加：

```ts
  /** Google 邮箱未验证（email_verified=false），不允许自动关联到已有账号。 */
  GOOGLE_EMAIL_UNVERIFIED: {
    code: 1003,
    message: "account.googleEmailUnverified",
    httpStatus: 409,
  },

  /** Google 换 code / 验 id_token 失败（或 oauth.google 未配置）。 */
  GOOGLE_OAUTH_FAILED: {
    code: 1004,
    message: "account.googleOauthFailed",
    httpStatus: 401,
  },

  /** OAuth state 验签失败（过期 / 篡改 / 标记不符）。 */
  GOOGLE_STATE_INVALID: {
    code: 1005,
    message: "account.googleStateInvalid",
    httpStatus: 400,
  },
```

- [ ] **Step 2: 跑错误码围栏**

Run: `pnpm check:error-code`
Expected: `DUPLICATE_CODE 0 / OUT_OF_RANGE 0 / GAP 0`，PASS。

- [ ] **Step 3: i18n 文案（zh / en）**

`apps/server/i18n/zh/account.json` 追加键：
```json
  "googleEmailUnverified": "Google 邮箱未验证，无法关联到已有账号",
  "googleOauthFailed": "Google 登录失败，请重试",
  "googleStateInvalid": "登录请求已过期或无效，请重试"
```
`apps/server/i18n/en/account.json` 追加键：
```json
  "googleEmailUnverified": "Google email not verified; cannot link to existing account",
  "googleOauthFailed": "Google sign-in failed, please try again",
  "googleStateInvalid": "Sign-in request expired or invalid, please try again"
```
（注意把已存在的最后一个键补上逗号；JSON 不能有尾逗号。）

- [ ] **Step 4: 校验 i18n 对齐**

Run: `pnpm sync:locales -- --check`
Expected: `Done (missing=0, asymmetric=0)`。

- [ ] **Step 5: Commit**

```bash
git add libs/account/src/errors/account.error-codes.ts apps/server/i18n
git commit -m "feat(account): 新增谷歌登录错误码 1003-1005 + 中英文案"
```

---

## Task 3：`AccountIdentity` 实体

**Files:** Create `libs/account/src/entities/account-identity.entity.ts`

- [ ] **Step 1: 写实体**

```ts
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

/**
 * 账号身份实体 —— 一个 Account 可绑定多个外部 provider 身份（google / 将来 github 等）。
 * 逻辑外键：account_id 为普通列 + 索引，不建库级外键。列名 snake_case 由 SnakeNamingStrategy 处理。
 */
@Entity("account_identity")
@Index("uq_account_identity_provider_account", ["provider", "providerAccountId"], {
  unique: true,
})
@Index("idx_account_identity_account_id", ["accountId"])
export class AccountIdentity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  /** provider 标识，如 "google"。 */
  @Column({ type: "varchar", length: 32 })
  provider!: string;

  /** provider 侧稳定用户 id（Google 的 sub）。 */
  @Column({ type: "varchar", length: 255 })
  providerAccountId!: string;

  /** 关联的 Account.id（逻辑外键）。 */
  @Column({ type: "uuid" })
  accountId!: string;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
```

- [ ] **Step 2: 导出**

`libs/account/src/index.ts` 追加：
```ts
export { AccountIdentity } from "./entities/account-identity.entity";
```

- [ ] **Step 3: 类型检查**

Run: `pnpm --filter @qriter/account typecheck`（或根 `pnpm typecheck`）
Expected: 通过（实体尚未被任何 Service 注入，check:repo 暂不会报，留到 Task 6）。

- [ ] **Step 4: Commit**

```bash
git add libs/account/src/entities/account-identity.entity.ts libs/account/src/index.ts
git commit -m "feat(account): 新增 AccountIdentity 实体"
```

---

## Task 4：`Account.passwordHash` 改 nullable

**Files:** Modify `libs/account/src/entities/account.entity.ts`、`libs/account/src/services/user.service.ts`

- [ ] **Step 1: 实体列改 nullable**

把：
```ts
  @Column({ type: "varchar", length: 255 })
  passwordHash!: string;
```
改为：
```ts
  @Column({ type: "varchar", length: 255, nullable: true })
  passwordHash!: string | null;
```

- [ ] **Step 2: 让密码登录拒绝无密码账号**

`user.service.ts` 的 `validateCredentials`，把 `bcrypt.compare` 前加守卫——`account.passwordHash` 为 null（谷歌-only 账号）时统一抛 `INVALID_CREDENTIALS`：

```ts
  async validateCredentials(input: LoginInput): Promise<Account> {
    const account = await this.accountRepo.findOne({
      where: { email: input.email },
    });
    if (!account || account.passwordHash == null) {
      throw new AppError(AccountErrorCode.INVALID_CREDENTIALS);
    }
    const ok = await bcrypt.compare(input.password, account.passwordHash);
    if (!ok) throw new AppError(AccountErrorCode.INVALID_CREDENTIALS);
    return account;
  }
```

- [ ] **Step 3: 类型检查**

Run: `pnpm --filter @qriter/account typecheck`
Expected: 通过。

- [ ] **Step 4: Commit**

```bash
git add libs/account/src/entities/account.entity.ts libs/account/src/services/user.service.ts
git commit -m "feat(account): password_hash 改 nullable（谷歌-only 账号无密码）"
```

---

## Task 5：`UserService` 加 `findByEmail` / `createSocialAccount`

**Files:** Modify `libs/account/src/services/user.service.ts`

- [ ] **Step 1: 加两个方法**

在 `findById` 旁追加：

```ts
  /** 按邮箱查找账号，不存在返回 null。 */
  async findByEmail(email: string): Promise<Account | null> {
    return this.accountRepo.findOne({ where: { email } });
  }

  /**
   * 创建一个社交登录账号（无密码）。仅单表 insert，无需 @Transactional。
   * 由 AccountIdentityService.findOrCreateByGoogle 在其事务上下文内调用。
   */
  async createSocialAccount(input: {
    email: string;
    displayName: string;
  }): Promise<Account> {
    const account = this.accountRepo.create({
      email: input.email,
      passwordHash: null,
      displayName: input.displayName,
    });
    return this.accountRepo.save(account);
  }
```

- [ ] **Step 2: 类型检查**

Run: `pnpm --filter @qriter/account typecheck`
Expected: 通过。

- [ ] **Step 3: Commit**

```bash
git add libs/account/src/services/user.service.ts
git commit -m "feat(account): UserService 增 findByEmail / createSocialAccount"
```

---

## Task 6：`AccountIdentityService`（含 `findOrCreateByGoogle`）

**Files:**
- Create: `libs/account/src/services/account-identity.service.ts`
- Modify: `libs/account/src/account.module.ts`、`libs/account/src/index.ts`

- [ ] **Step 1: 写 Service**

```ts
import { Transactional } from "@qriter/common";
import { AppError } from "@qriter/shared";
import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { Repository } from "typeorm";

import { AccountIdentity } from "../entities/account-identity.entity";
import type { Account } from "../entities/account.entity";
import { AccountErrorCode } from "../errors/account.error-codes";
import { UserService } from "./user.service";

/** 由 OAuth 层归一化后的社交身份档案（provider 无关形状）。 */
export interface SocialProfile {
  provider: "google";
  /** provider 稳定用户 id（Google sub）。 */
  sub: string;
  email: string | null;
  emailVerified: boolean;
  /** 展示名（无则上游用 email/sub 兜底）。 */
  name: string;
}

/**
 * AccountIdentity 唯一归属 Service。封装外部身份的查询 / 落库，
 * 以及"按身份找或建账号"的 find-or-create 编排（跨 account_identity + account 两表写）。
 */
@Injectable()
export class AccountIdentityService {
  constructor(
    @InjectRepository(AccountIdentity)
    private readonly identityRepo: Repository<AccountIdentity>,
    private readonly users: UserService,
  ) {}

  /** 按 (provider, providerAccountId) 查身份，不存在返回 null。 */
  async findByProviderAccount(
    provider: string,
    providerAccountId: string,
  ): Promise<AccountIdentity | null> {
    return this.identityRepo.findOne({
      where: { provider, providerAccountId },
    });
  }

  /** 落一条身份记录（单表 insert）。 */
  async createIdentity(
    accountId: string,
    provider: string,
    providerAccountId: string,
  ): Promise<AccountIdentity> {
    const identity = this.identityRepo.create({
      accountId,
      provider,
      providerAccountId,
    });
    return this.identityRepo.save(identity);
  }

  /**
   * 按 Google 身份找或建账号。跨两表写 → @Transactional（事务经 ALS 传播到 UserService）。
   * - 命中既有身份 → 返回其账号；
   * - 否则按邮箱找：命中且 email_verified=true → 关联；命中但未验证 → 抛 GOOGLE_EMAIL_UNVERIFIED；
   * - 邮箱无账号 → 建无密码账号 + 落身份。
   */
  @Transactional()
  async findOrCreateByGoogle(profile: SocialProfile): Promise<Account> {
    const existing = await this.findByProviderAccount(
      profile.provider,
      profile.sub,
    );
    if (existing) {
      const account = await this.users.findById(existing.accountId);
      if (!account) throw new AppError(AccountErrorCode.ACCOUNT_NOT_FOUND);
      return account;
    }

    if (!profile.email) throw new AppError(AccountErrorCode.GOOGLE_OAUTH_FAILED);

    const byEmail = await this.users.findByEmail(profile.email);
    if (byEmail) {
      if (!profile.emailVerified) {
        throw new AppError(AccountErrorCode.GOOGLE_EMAIL_UNVERIFIED);
      }
      await this.createIdentity(byEmail.id, profile.provider, profile.sub);
      return byEmail;
    }

    const created = await this.users.createSocialAccount({
      email: profile.email,
      displayName: profile.name,
    });
    await this.createIdentity(created.id, profile.provider, profile.sub);
    return created;
  }
}
```

- [ ] **Step 2: 注册 + 导出**

`libs/account/src/account.module.ts`：
```ts
import { TxTypeOrmModule } from "@qriter/common";
import { Module } from "@nestjs/common";

import { AccountIdentity } from "./entities/account-identity.entity";
import { Account } from "./entities/account.entity";
import { AccountIdentityService } from "./services/account-identity.service";
import { UserService } from "./services/user.service";

@Module({
  imports: [TxTypeOrmModule.forFeature([Account, AccountIdentity])],
  providers: [UserService, AccountIdentityService],
  exports: [UserService, AccountIdentityService],
})
export class AccountModule {}
```

`libs/account/src/index.ts` 追加：
```ts
export { AccountIdentityService } from "./services/account-identity.service";
export type { SocialProfile } from "./services/account-identity.service";
```

- [ ] **Step 3: 跑 Repo + 事务围栏**

Run: `pnpm check:repo && pnpm check:tx`
Expected: `check:repo` 把 `AccountIdentity → AccountIdentityService` 列入归属映射、0 finding；`check:tx` 0 finding。
> 若 `check:tx` 对 `findOrCreateByGoogle` 报 `REDUNDANT`（跨 Service 写未被静态计数）：装饰是为 account+identity 原子性所必需，依 `service-tx-lock-cache` 技能确认语义后保留；按该技能指引把该方法纳入 baseline。

- [ ] **Step 4: 类型检查 + Commit**

Run: `pnpm typecheck`
Expected: 通过。
```bash
git add libs/account/src/services/account-identity.service.ts libs/account/src/account.module.ts libs/account/src/index.ts
git commit -m "feat(account): AccountIdentityService + 谷歌 find-or-create（@Transactional 跨表写）"
```

---

## Task 7：迁移（password_hash nullable + account_identity 表）

**Files:**
- Create: `apps/server/src/migrations/1780776290465-AddAccountIdentity.ts`
- Modify: `apps/server/test/setup/test-db.ts`

- [ ] **Step 1: 写迁移**

```ts
import type { MigrationInterface, QueryRunner } from "typeorm";

/** 谷歌登录：password_hash 放空 + 新增 account_identity 表。 */
export class AddAccountIdentity1780776290465 implements MigrationInterface {
  name = "AddAccountIdentity1780776290465";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    await queryRunner.query(
      `ALTER TABLE "account" ALTER COLUMN "password_hash" DROP NOT NULL`,
    );
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "account_identity" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "provider" varchar(32) NOT NULL,
        "provider_account_id" varchar(255) NOT NULL,
        "account_id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_account_identity" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_account_identity_provider_account" ON "account_identity" ("provider", "provider_account_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_account_identity_account_id" ON "account_identity" ("account_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "account_identity"`);
    await queryRunner.query(
      `ALTER TABLE "account" ALTER COLUMN "password_hash" SET NOT NULL`,
    );
  }
}
```

- [ ] **Step 2: 测试 DataSource 纳入新实体 + 迁移**

`apps/server/test/setup/test-db.ts`：
- 顶部加：
```ts
import { AccountIdentity } from "../../../../libs/account/src/entities/account-identity.entity";
import { AddAccountIdentity1780776290465 } from "../../src/migrations/1780776290465-AddAccountIdentity";
```
- `dataSourceOptions` 里：`entities: [Account, AccountIdentity]`、`migrations: [InitialSchema1780502575371, AddAccountIdentity1780776290465]`。

- [ ] **Step 3: 起本地库并跑迁移**

Run: `pnpm dev:db:up`（若未起）然后 `pnpm migration run`
Expected: 日志显示执行 `AddAccountIdentity1780776290465`，无报错。

- [ ] **Step 4: 验证回滚可用**

Run: `pnpm migration revert` 然后再 `pnpm migration run`
Expected: revert 删表 + 恢复 NOT NULL（注意：若此时 account 表已有 null 密码行，SET NOT NULL 会失败——开发库应为空，符合预期）；再 run 重新建表。

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/migrations/1780776290465-AddAccountIdentity.ts apps/server/test/setup/test-db.ts
git commit -m "feat(server): 迁移 password_hash nullable + account_identity 表"
```

---

## Task 8：config 加 `oauth.google` 切片

**Files:** Modify `apps/server/src/config/app-config.schema.ts`

- [ ] **Step 1: 加 schema**

在 `LlmConfigSchema` 之后、`AppConfigSchema` 之前加：
```ts
/** Google OAuth 配置（可选）。未配置则谷歌登录端点抛 GOOGLE_OAUTH_FAILED。 */
export const GoogleOAuthConfigSchema = z.object({
  clientId: z.string(),
  clientSecret: z.string(),
  /** = 前端回调页地址，如 http://localhost:3001/auth/google。 */
  redirectUri: z.string().url(),
  scopes: z.array(z.string()).default(["openid", "email", "profile"]),
});

export const OAuthConfigSchema = z.object({
  google: GoogleOAuthConfigSchema,
});
```
`AppConfigSchema` 内加一行：`oauth: OAuthConfigSchema.optional(),`
文件底部 type 区加：
```ts
export type GoogleOAuthConfig = z.infer<typeof GoogleOAuthConfigSchema>;
```

- [ ] **Step 2: 本地配置样例**

在 `apps/server/config/application.yml`（若存在）追加（凭证留空占位，真值写 gitignore 的 `application.local.yml`）：
```yaml
oauth:
  google:
    clientId: ""
    clientSecret: ""
    redirectUri: http://localhost:3001/auth/google
    scopes: [openid, email, profile]
```

- [ ] **Step 3: 类型检查 + Commit**

Run: `pnpm --filter @qriter/server typecheck`
Expected: 通过。
```bash
git add apps/server/src/config/app-config.schema.ts apps/server/config/application.yml
git commit -m "feat(server): 配置增 oauth.google 切片"
```

---

## Task 9：`GoogleOAuthService`（TDD：先 state 单测）

**Files:**
- Create: `apps/server/src/auth/google-oauth.service.ts`
- Create: `apps/server/src/auth/google-oauth.service.spec.ts`

- [ ] **Step 1: 写失败单测（state 往返 + 篡改）**

`google-oauth.service.spec.ts`：
```ts
import { JwtService } from "@nestjs/jwt";
import { AppError } from "@qriter/shared";
import { AccountErrorCode } from "@qriter/account";

import { APP_CONFIG, type AppConfig } from "../config/app-config.schema";
import { GoogleOAuthService } from "./google-oauth.service";

const CONFIG = {
  oauth: {
    google: {
      clientId: "cid",
      clientSecret: "secret",
      redirectUri: "http://localhost:3001/auth/google",
      scopes: ["openid", "email", "profile"],
    },
  },
} as unknown as AppConfig;

function build(): GoogleOAuthService {
  const jwt = new JwtService({ secret: "unit-secret-1234567890" });
  return new GoogleOAuthService(CONFIG, jwt);
}

describe("GoogleOAuthService.state", () => {
  it("signState → verifyState 往返通过", () => {
    const svc = build();
    const state = svc.signState();
    expect(() => svc.verifyState(state)).not.toThrow();
  });

  it("篡改 / 非法 state 抛 GOOGLE_STATE_INVALID", () => {
    const svc = build();
    try {
      svc.verifyState("not-a-jwt");
      fail("应当抛错");
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).errorCode).toBe(AccountErrorCode.GOOGLE_STATE_INVALID);
    }
  });

  it("buildConsentUrl 含 client_id 与 state", () => {
    const svc = build();
    const url = svc.buildConsentUrl();
    expect(url).toContain("accounts.google.com");
    expect(url).toContain("client_id=cid");
    expect(url).toContain("state=");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @qriter/server test -- google-oauth.service.spec`
Expected: FAIL（`Cannot find module './google-oauth.service'`）。

- [ ] **Step 3: 写实现**

`google-oauth.service.ts`：
```ts
import { AccountErrorCode } from "@qriter/account";
import { AppError } from "@qriter/shared";
import { Inject, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { OAuth2Client } from "google-auth-library";

import {
  APP_CONFIG,
  type AppConfig,
  type GoogleOAuthConfig,
} from "../config/app-config.schema";

/** 归一化后的 Google 用户档案。 */
export interface GoogleProfile {
  sub: string;
  email: string | null;
  emailVerified: boolean;
  name: string;
}

const STATE_TTL = "10m";
const STATE_MARKER = "oauth_state";

/**
 * Google OAuth 服务（无 DB）：构造同意页 URL、用 JwtService 签/验无状态 state、
 * 用 code 换 token 并验 id_token。oauth.google 未配置时各方法抛 GOOGLE_OAUTH_FAILED。
 */
@Injectable()
export class GoogleOAuthService {
  private readonly google: GoogleOAuthConfig | null;

  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    private readonly jwt: JwtService,
  ) {
    this.google = config.oauth?.google ?? null;
  }

  /** 签发 10min 短 JWT 作为 CSRF state。 */
  signState(): string {
    return this.jwt.sign({ t: STATE_MARKER }, { expiresIn: STATE_TTL });
  }

  /** 验 state；过期 / 篡改 / 标记不符抛 GOOGLE_STATE_INVALID。 */
  verifyState(state: string): void {
    try {
      const payload = this.jwt.verify<{ t?: string }>(state);
      if (payload.t !== STATE_MARKER) throw new Error("bad marker");
    } catch {
      throw new AppError(AccountErrorCode.GOOGLE_STATE_INVALID);
    }
  }

  /** 构造 Google 同意页 URL（内嵌签名 state）。 */
  buildConsentUrl(): string {
    const client = this.requireClient();
    return client.generateAuthUrl({
      scope: this.google!.scopes,
      state: this.signState(),
      prompt: "select_account",
    });
  }

  /** 用 code 换 token 并验 id_token，返回归一化档案；失败抛 GOOGLE_OAUTH_FAILED。 */
  async exchangeCode(code: string): Promise<GoogleProfile> {
    const client = this.requireClient();
    try {
      const { tokens } = await client.getToken(code);
      const idToken = tokens.id_token;
      if (!idToken) throw new Error("no id_token");
      const ticket = await client.verifyIdToken({
        idToken,
        audience: this.google!.clientId,
      });
      const payload = ticket.getPayload();
      if (!payload?.sub) throw new Error("no sub");
      return {
        sub: payload.sub,
        email: payload.email ?? null,
        emailVerified: payload.email_verified === true,
        name: payload.name ?? payload.email ?? payload.sub,
      };
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(AccountErrorCode.GOOGLE_OAUTH_FAILED);
    }
  }

  private requireClient(): OAuth2Client {
    if (!this.google) throw new AppError(AccountErrorCode.GOOGLE_OAUTH_FAILED);
    return new OAuth2Client({
      clientId: this.google.clientId,
      clientSecret: this.google.clientSecret,
      redirectUri: this.google.redirectUri,
    });
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @qriter/server test -- google-oauth.service.spec`
Expected: PASS（3 个用例）。

- [ ] **Step 5: 加 exchangeCode 的 mock 单测**

在 spec 末尾追加（mock `OAuth2Client` 原型方法）：
```ts
import { OAuth2Client } from "google-auth-library";

describe("GoogleOAuthService.exchangeCode", () => {
  afterEach(() => jest.restoreAllMocks());

  it("成功换取并归一化 profile", async () => {
    jest
      .spyOn(OAuth2Client.prototype, "getToken")
      // @ts-expect-error 只需要 id_token 字段
      .mockResolvedValue({ tokens: { id_token: "idtok" } });
    jest.spyOn(OAuth2Client.prototype, "verifyIdToken").mockResolvedValue({
      getPayload: () => ({
        sub: "g-sub-1",
        email: "a@b.com",
        email_verified: true,
        name: "Alice",
      }),
    } as unknown as Awaited<ReturnType<OAuth2Client["verifyIdToken"]>>);

    const profile = await build().exchangeCode("code-xyz");
    expect(profile).toEqual({
      sub: "g-sub-1",
      email: "a@b.com",
      emailVerified: true,
      name: "Alice",
    });
  });

  it("换取失败抛 GOOGLE_OAUTH_FAILED", async () => {
    jest
      .spyOn(OAuth2Client.prototype, "getToken")
      .mockRejectedValue(new Error("invalid_grant"));
    await expect(build().exchangeCode("bad")).rejects.toMatchObject({
      errorCode: AccountErrorCode.GOOGLE_OAUTH_FAILED,
    });
  });
});
```

- [ ] **Step 6: 跑全 spec + Commit**

Run: `pnpm --filter @qriter/server test -- google-oauth.service.spec`
Expected: PASS（5 个用例）。
```bash
git add apps/server/src/auth/google-oauth.service.ts apps/server/src/auth/google-oauth.service.spec.ts
git commit -m "feat(server): GoogleOAuthService（state 签验 + code 换取）+ 单测"
```

---

## Task 10：`GoogleCodeSchema` + DTO

**Files:**
- Modify: `libs/types/src/account/account.schema.ts`
- Modify: `libs/account/src/dto/index.ts`

- [ ] **Step 1: 共享 schema**

`account.schema.ts` 末尾追加：
```ts
/** 谷歌回调换 code 请求体：授权码 + CSRF state。 */
export const GoogleCodeSchema = z.object({
  code: z.string().min(1, { message: "validation.required" }),
  state: z.string().min(1, { message: "validation.required" }),
});

export type GoogleCodeInput = z.infer<typeof GoogleCodeSchema>;
```

- [ ] **Step 2: DTO**

`libs/account/src/dto/index.ts`：import 加 `AccountSchema`、`GoogleCodeSchema`、`type GoogleCodeInput`；文件末尾追加：
```ts
// biome-ignore lint/suspicious/noUnsafeDeclarationMerging: intentional class+interface merge to expose zod-inferred fields
export class GoogleCodeDto extends createI18nZodDto(GoogleCodeSchema) {}
export interface GoogleCodeDto extends GoogleCodeInput {}

/** 账号公开档案 DTO —— 仅供 Swagger 声明 @ApiOkResponse 的 type。 */
export class AccountDto extends createI18nZodDto(AccountSchema) {}
```

- [ ] **Step 3: 类型检查 + Commit**

Run: `pnpm typecheck`
Expected: 通过。
```bash
git add libs/types/src/account/account.schema.ts libs/account/src/dto/index.ts
git commit -m "feat(account): GoogleCodeSchema + GoogleCodeDto / AccountDto"
```

---

## Task 11：AuthModule 注册 GoogleOAuthService

**Files:** Modify `apps/server/src/auth/auth.module.ts`

- [ ] **Step 1: 注册 provider**

import 加 `import { GoogleOAuthService } from "./google-oauth.service";`；`providers: [JwtStrategy, GoogleOAuthService]`；`exports` 末尾加 `GoogleOAuthService`（供 AuthController 注入）。AuthController 已在 `apps/server` rest 层、AuthModule 之外——确认 AuthController 所在 module（通常 `app.module.ts` 或 rest module）import 了 AuthModule；若 AuthController 由 AppModule 直接声明，则它能注入 AuthModule 导出的 provider。

- [ ] **Step 2: 类型检查 + Commit**

Run: `pnpm --filter @qriter/server typecheck`
Expected: 通过。
```bash
git add apps/server/src/auth/auth.module.ts
git commit -m "feat(server): AuthModule 注册 GoogleOAuthService"
```

---

## Task 12：AuthController 四个端点

**Files:** Modify `apps/server/src/rest/auth.controller.ts`

- [ ] **Step 1: 补 import**

```ts
import { Get, Redirect } from "@nestjs/common";           // 合并进现有 @nestjs/common import
import { SkipResponseEnvelope } from "@qriter/common";
import { AppError } from "@qriter/shared";
import {
  AccountDto,
  AccountErrorCode,
  AccountIdentityService,
  GoogleCodeDto,
} from "@qriter/account";
import type { Account as AccountProfile } from "@qriter/types";
import { GoogleOAuthService } from "../auth/google-oauth.service";
import { CurrentUser, type CurrentUserPayload } from "../auth/current-user.decorator";
```

- [ ] **Step 2: 构造注入**

构造函数参数加：
```ts
    private readonly identities: AccountIdentityService,
    private readonly googleOAuth: GoogleOAuthService,
```

- [ ] **Step 3: 四个端点**

类内追加：
```ts
  @Public()
  @SkipResponseEnvelope()
  @ApiOperation({ summary: "重定向到 Google 同意页" })
  @Get("google")
  @Redirect()
  googleStart(): { url: string } {
    return { url: this.googleOAuth.buildConsentUrl() };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: "用 Google 授权码换取 JWT" })
  @ApiBody({ type: GoogleCodeDto })
  @ApiOkResponse({ description: "登录成功，data 为 accessToken + 档案", type: AuthResponseDto })
  @Post("google")
  @HttpCode(200)
  async googleCallback(@Body() dto: GoogleCodeDto): Promise<AuthResponse> {
    this.googleOAuth.verifyState(dto.state);
    const profile = await this.googleOAuth.exchangeCode(dto.code);
    const account = await this.identities.findOrCreateByGoogle({
      provider: "google",
      sub: profile.sub,
      email: profile.email,
      emailVerified: profile.emailVerified,
      name: profile.name,
    });
    return this.signResponse(account);
  }

  @ApiOperation({ summary: "当前登录账号公开档案" })
  @ApiOkResponse({ description: "当前账号档案", type: AccountDto })
  @Get("profile")
  async profile(@CurrentUser() user: CurrentUserPayload): Promise<AccountProfile> {
    const account = await this.users.findById(user.userId);
    if (!account) throw new AppError(AccountErrorCode.ACCOUNT_NOT_FOUND);
    return this.users.toProfile(account);
  }

  @ApiOperation({ summary: "签发 60s 短时效 WS ticket" })
  @Get("ws-ticket")
  wsTicket(@CurrentUser() user: CurrentUserPayload): { ticket: string } {
    const ticket = this.jwt.sign(
      { userId: user.userId, email: user.email, t: "ws" },
      { expiresIn: "60s" },
    );
    return { ticket };
  }
```
> `signResponse(user)` 现有签名形参类型是实体 `Account`；`findOrCreateByGoogle` / `findById` 返回的正是实体 `Account`，直接传入即可。

- [ ] **Step 4: 类型检查 + 围栏**

Run: `pnpm --filter @qriter/server typecheck && pnpm check:repo`
Expected: 通过；`check:repo` 确认 Controller 未注入 Repository（只注入了 Service）。

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/rest/auth.controller.ts
git commit -m "feat(server): auth 端点 google 起跳/换码 + profile + ws-ticket"
```

---

## Task 13：e2e（mock Google）

**Files:** Create `apps/server/test/e2e/google-auth.spec.ts`

- [ ] **Step 1: 写 e2e**

以 `apps/server/test/e2e/auth-flow.spec.ts` 的 bootstrap 为范式，构建测试 module 并 `overrideProvider(GoogleOAuthService)` 注入可控 fake：

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
import { JwtModule, JwtService } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { Test } from "@nestjs/testing";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  AcceptLanguageResolver,
  HeaderResolver,
  I18nJsonLoader,
  I18nModule,
} from "nestjs-i18n";
import request from "supertest";

import { JwtAuthGuard } from "../../src/auth/jwt-auth.guard";
import { JwtStrategy } from "../../src/auth/jwt.strategy";
import { GoogleOAuthService } from "../../src/auth/google-oauth.service";
import { type AppConfig, APP_CONFIG } from "../../src/config/app-config.schema";
import { AuthController } from "../../src/rest/auth.controller";
import { createTestDb, isPostgresReachable, type TestDbContext } from "../setup/test-db";

const I18N_PATH = path.join(__dirname, "..", "..", "i18n");
const JWT_SECRET = "e2e-google-secret-1234567890";

const TEST_CONFIG = {
  port: 3000,
  database: {
    type: "postgres", host: "localhost", port: 5433,
    username: "qriter", password: "qriter", database: "qriter",
    synchronize: false, autoLoadEntities: true,
  },
  jwt: { secret: JWT_SECRET, expires: "1h" },
} as unknown as AppConfig;

/** 可控的 GoogleOAuthService 替身：state 用固定串，exchangeCode 由每个用例预置。 */
class FakeGoogleOAuth {
  next: { sub: string; email: string | null; emailVerified: boolean; name: string } = {
    sub: "g-1", email: "g1@ex.com", emailVerified: true, name: "G One",
  };
  stateOk = true;
  buildConsentUrl() { return "https://accounts.google.com/o/oauth2/v2/auth?state=stub"; }
  verifyState(_s: string) { if (!this.stateOk) { const { AppError } = require("@qriter/shared"); const { AccountErrorCode } = require("@qriter/account"); throw new AppError(AccountErrorCode.GOOGLE_STATE_INVALID); } }
  async exchangeCode(_c: string) { return this.next; }
}

describe("server google-auth e2e", () => {
  let app: INestApplication;
  let dbCtx: TestDbContext | null = null;
  let skip: string | null = null;
  const fakeGoogle = new FakeGoogleOAuth();

  beforeAll(async () => {
    if (!(await isPostgresReachable())) {
      skip = "Postgres 不可达，跑 `pnpm dev:db:up`";
      console.warn(skip);
      return;
    }
    dbCtx = await createTestDb();
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({ ...dbCtx.dataSourceOptions, autoLoadEntities: true }),
        JwtModule.register({ secret: JWT_SECRET, signOptions: { expiresIn: "1h" } }),
        PassportModule,
        CommonModule.forRoot({ global: true }),
        I18nModule.forRoot({
          fallbackLanguage: "zh",
          loader: I18nJsonLoader,
          loaderOptions: { path: I18N_PATH, watch: false },
          resolvers: [new HeaderResolver(["x-lang"]), AcceptLanguageResolver],
        }),
        AccountModule,
      ],
      controllers: [AuthController],
      providers: [
        JwtStrategy,
        { provide: APP_CONFIG, useValue: TEST_CONFIG },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        GoogleOAuthService,
      ],
    })
      .overrideProvider(GoogleOAuthService)
      .useValue(fakeGoogle)
      .compile();

    app = moduleRef.createNestApplication();
    app.use(traceIdMiddleware);
    app.useGlobalPipes(new I18nZodValidationPipe());
    app.useGlobalInterceptors(new ResponseInterceptor(app.get(Reflector)));
    app.useGlobalFilters(new ErrorsFilter(app.get(Reflector), app.get((await import("nestjs-i18n")).I18nService)));
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await dbCtx?.cleanup();
  });

  const maybe = () => (skip ? it.skip : it);

  it("POST /auth/google 新用户 → 201/200 返回 accessToken + user", async () => {
    if (skip) return;
    fakeGoogle.stateOk = true;
    fakeGoogle.next = { sub: "new-1", email: "new1@ex.com", emailVerified: true, name: "New One" };
    const res = await request(app.getHttpServer())
      .post("/auth/google").send({ code: "c", state: "s" }).expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.user.email).toBe("new1@ex.com");
  });

  it("POST /auth/google 同 sub 再次登录 → 命中既有身份，同一账号", async () => {
    if (skip) return;
    fakeGoogle.next = { sub: "repeat-1", email: "rep@ex.com", emailVerified: true, name: "Rep" };
    const a = await request(app.getHttpServer()).post("/auth/google").send({ code: "c", state: "s" }).expect(200);
    const b = await request(app.getHttpServer()).post("/auth/google").send({ code: "c", state: "s" }).expect(200);
    expect(b.body.data.user.id).toBe(a.body.data.user.id);
  });

  it("POST /auth/google state 非法 → 400 GOOGLE_STATE_INVALID", async () => {
    if (skip) return;
    fakeGoogle.stateOk = false;
    await request(app.getHttpServer()).post("/auth/google").send({ code: "c", state: "bad" }).expect(400);
    fakeGoogle.stateOk = true;
  });

  it("POST /auth/google 未验证邮箱撞已有账号 → 409", async () => {
    if (skip) return;
    // 先建一个会被撞的账号（用既有注册端点不在本 controller，直接造数据：用一次 verified 登录建账号）
    fakeGoogle.next = { sub: "owner-1", email: "collide@ex.com", emailVerified: true, name: "Owner" };
    await request(app.getHttpServer()).post("/auth/google").send({ code: "c", state: "s" }).expect(200);
    // 另一个 sub、同邮箱、未验证 → 拒绝
    fakeGoogle.next = { sub: "other-1", email: "collide@ex.com", emailVerified: false, name: "Other" };
    await request(app.getHttpServer()).post("/auth/google").send({ code: "c", state: "s" }).expect(409);
  });

  it("GET /auth/profile 带 token → 200 当前账号；无 token → 401", async () => {
    if (skip) return;
    fakeGoogle.next = { sub: "prof-1", email: "prof@ex.com", emailVerified: true, name: "Prof" };
    const login = await request(app.getHttpServer()).post("/auth/google").send({ code: "c", state: "s" }).expect(200);
    const token = login.body.data.accessToken as string;
    const ok = await request(app.getHttpServer()).get("/auth/profile").set("Authorization", `Bearer ${token}`).expect(200);
    expect(ok.body.data.email).toBe("prof@ex.com");
    await request(app.getHttpServer()).get("/auth/profile").expect(401);
  });

  it("GET /auth/ws-ticket 带 token → 200 返回可验证 ticket", async () => {
    if (skip) return;
    fakeGoogle.next = { sub: "ws-1", email: "ws@ex.com", emailVerified: true, name: "Ws" };
    const login = await request(app.getHttpServer()).post("/auth/google").send({ code: "c", state: "s" }).expect(200);
    const token = login.body.data.accessToken as string;
    const res = await request(app.getHttpServer()).get("/auth/ws-ticket").set("Authorization", `Bearer ${token}`).expect(200);
    const ticket = res.body.data.ticket as string;
    const payload = new JwtService({ secret: JWT_SECRET }).verify(ticket);
    expect(payload.t).toBe("ws");
  });
});
```
> 若本仓 CommonModule / I18n / ErrorsFilter 的 bootstrap 写法与 `auth-flow.spec.ts` 不同，以 `auth-flow.spec.ts` 现行写法为准对齐（providers / forRoot 形参）。本用例的关键不变量：`overrideProvider(GoogleOAuthService).useValue(fakeGoogle)` + 直连 `createTestDb` 的隔离 schema。

- [ ] **Step 2: 跑 e2e**

Run: `pnpm dev:db:up` 然后 `pnpm --filter @qriter/server test -- google-auth.spec`
Expected: 6 个用例 PASS（Postgres 不可达时整体 skip）。

- [ ] **Step 3: Commit**

```bash
git add apps/server/test/e2e/google-auth.spec.ts
git commit -m "test(server): 谷歌登录 e2e（新建/复用/state/未验证/profile/ws-ticket）"
```

---

## Task 14：全量围栏 + 收尾

- [ ] **Step 1: 全量检查**

Run: `pnpm check && pnpm typecheck && pnpm test`
Expected: 6 道围栏 0 finding；类型检查通过；单测 + e2e 通过。

- [ ] **Step 2: 格式化**

Run: `pnpm check:format`
Expected: 无残留 diff（或自动修复后 `git add`）。

- [ ] **Step 3: 若有格式化改动则 Commit**

```bash
git add -A
git commit -m "chore(server): 谷歌登录后端围栏 + 格式化收尾"
```

---

## 自检（spec 覆盖对照）

- 账号模型（§4）：Task 3/4/5/6/7 ✅（实体 + nullable + 服务 + 迁移）
- 关联策略 email_verified（决策 5 / §4）：Task 6 `findOrCreateByGoogle` 分支 + Task 13 用例 ✅
- 错误码 1003-1005（§4）：Task 2 ✅
- GoogleOAuthService / state / exchange（§5）：Task 9 ✅
- 端点 google/profile/ws-ticket（§5/§7）：Task 12 ✅
- 配置 oauth.google（§5）：Task 8 ✅
- 测试（§9）：Task 9 单测 + Task 13 e2e ✅
- **不在本 plan**（属 Plan B 前端）：`proxy.ts`、cookie route handlers、apiClient/AuthGuard 改造、`/auth/google` 页面、WS ticket 前端接入。

> 注：`GET /auth/google` 的 `@Redirect()` 依赖 `@SkipResponseEnvelope()` 绕过 envelope（Task 12 已含）。后端完成后老 Bearer 链路不受影响，可独立部署。
