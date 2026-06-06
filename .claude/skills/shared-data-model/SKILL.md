---
name: shared-data-model
description: "前后端共享数据模型 — types schema、业务 DTO、Entity 分层 Use when files matching libs/types/**,libs/**/src/dto/**,apps/**/src/rest/**,packages/web-common/**/types/** change, or when explicitly invoked."
---

# 共享数据模型（类型包 + 业务模块）

## 类型包

qriter 用**单一类型包** `libs/types`（别名 `@qriter/types`）承载所有跨前后端共享的 Zod schema：

| 包 | 别名 | 内容范围 |
|----|------|---------|
| `libs/types` | `@qriter/types` | 全部共享类型：`account/`、`book/`、`agent/`、`common/`（page / result 等）的 `*.schema.ts` |

类型包规范：

1. 用 **Zod** 定义 **Schema**（`*.schema.ts`），并导出 `z.infer` 得到的 **TypeScript 类型**。
2. **字段描述**：每个对象字段在链式末尾使用 **`.describe("…")`** 写明语义、单位或格式（如 ISO 8601、枚举含义）。说明供 OpenAPI、协作与 `createI18nZodDto` 构建时采集；新建或修改 Schema 时应补齐。**优先使用中文短句**；全文件内语言风格保持一致。
3. 可放置与 HTTP / 分页等相关的**纯类型**（如 `PageData`、`PageRequest`、`Envelope`、`OkResult`），供前后端与 Nest 共用。
4. **禁止**在类型包中依赖 NestJS 或 TypeORM。

> 当前 `@qriter/types` barrel 已导出：`AccountSchema` / `LoginSchema` / `RegisterSchema` / `AuthResponse`（account）；`BookSchema` / `ChapterSchema` / `CreateBookSchema` / `UpdateBookSchema` / `CreateChapterSchema` / `UpdateChapterSchema` / `BookStatus`（book）；`AgentRunRequestSchema` / `AgentStreamChunk` / `SessionStatus` / `AGENT_WS_*`（agent）；`PageRequestSchema` / `PageData` / `Envelope`（common/page）；`IdParamSchema` / `OkResultSchema` / `DeletedResultSchema`（common/result）。import 时按 barrel 实际导出对齐。

## 业务库 DTO

业务域库（`libs/account` / `libs/book` / `libs/agent`）在 **`src/<sub-domain>/dto/`** 中基于 `@qriter/types` 的 Schema，用 **`createI18nZodDto`**（`@qriter/shared`）包装成 **DTO 类**，用于校验、OpenAPI、控制器入参/出参声明；该工厂会在构建时采集 Schema 中的校验文案以支持 **i18n**（`nestjs-zod` 的 `createZodDto` 仅作其内部实现，业务代码不要直接使用）。

```ts
import { createI18nZodDto } from "@qriter/shared";
import { BookSchema, CreateBookSchema } from "@qriter/types";

export class BookDataDto extends createI18nZodDto(BookSchema) {}
export class CreateBookDto extends createI18nZodDto(CreateBookSchema) {}
```

- **不要**在 DTO 文件里重复手写与类型包不一致的 `z.object`；Schema 的单一来源是 `libs/types`。
- 新 DTO 必须在所属业务库的 `src/dto/index.ts`（或 `src/<sub-domain>/dto/index.ts`）中导出。

## Entity

仍放在对应业务域库的 **`entity/`**（或子域 `<sub-domain>/entity/`），只面向数据库与 ORM；**不要**把 Entity 与对外 API 的 Zod Schema 混在同一职责里。

## 前端（apps/web）

- 共享类型从 **`@qriter/types`** 引用
- **避免**在 `rest` 层手写与后端重复的 `type` / `interface`

## 命名与导出

- Schema 文件以 `*.schema.ts` 结尾；导出 `XxxSchema` 与 `Xxx` 领域名类型，便于前后端一致引用。
- 业务库如需对外暴露 Schema，可从 DTO 文件 **re-export** 类型包中的同名符号，避免分叉。

## 主键策略：UUID（单一策略）

每个 Entity 主键统一用 **UUID**：

```ts
import { Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Entity("book")
@Index(["ownerAccountId"])
export class Book {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  // 逻辑外键：普通列 + 索引，不用 @ManyToOne / @JoinColumn
  @Column({ type: "uuid" })
  ownerAccountId!: string;

  // ...其余列
}
```

要点：

- **统一 UUID**，不再使用 Snowflake / NODE_ID（移植时已删除）。需要随机不可猜测 token 时用 `crypto.randomUUID()` 或 `base64url(randomBytes)`。
- 迁移 DDL 用 `gen_random_uuid()` 作默认值，并 `CREATE EXTENSION IF NOT EXISTS pgcrypto`。
- **逻辑外键**：关联用普通 `uuid` 列 + 索引表达，禁止 `@ManyToOne` / `@OneToMany` / `@JoinColumn` 与数据库级外键约束。
- 列名 snake_case（`SnakeNamingStrategy` 自动转）。

## 软删除模式

当业务需求要求「删除后保留审计 / 可恢复」时，采用 TypeORM 软删除：

```ts
import { DeleteDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Entity("chapter")
@Index(["bookId", "title"], { unique: true, where: '"deleted_at" IS NULL' })
export class Chapter {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  // ...其余列

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deletedAt!: Date | null;
}
```

要点：

- 时间戳列名固定 `deletedAt` → `deleted_at`（SnakeNamingStrategy 自动转）
- **凡涉及唯一约束的字段必须配部分唯一索引**：`@Index([...], { where: '"deleted_at" IS NULL' })`，否则软删后无法重建同名记录
- 删除走 `softRemove` / `softDelete`；查含软删 `find({ withDeleted: true })`；恢复 `recover` / `restore`
- **不**用 ORM cascade 软删；子实体由各自 Service 显式处理（与 `@ManyToOne` / cascade 全禁用一致）
