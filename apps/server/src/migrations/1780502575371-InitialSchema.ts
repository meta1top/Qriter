import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * qriter 首批 schema（地基）。建账号 / 书籍 / 章节三张表，作为写作平台的核心数据模型。
 *
 * 设计要点：
 * - `IF NOT EXISTS` 保证幂等
 * - `pgcrypto` 提供 `gen_random_uuid()`，主键统一 UUID
 * - 不写数据库 FK 约束（项目约定 logical FK）：`book.owner_id` / `chapter.book_id`
 *   为普通列 + 索引，关联在 service 层用逻辑外键表达
 * - 列名 snake_case 由 `SnakeNamingStrategy` 处理
 * - 表名与 Entity（@Entity("account") 等单数命名）对齐
 * - LangGraph checkpointer 表由 `PostgresSaver.setup()` 在 boot 时创建，不在此迁移建表
 * - 索引未用 CONCURRENTLY：runtime migrationsRun 会用事务包；后续高并发线上单独拆迁移 + transaction=false
 */
export class InitialSchema1780502575371 implements MigrationInterface {
  name = "InitialSchema1780502575371";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "account" (
        "id"            uuid          NOT NULL DEFAULT gen_random_uuid(),
        "email"         varchar(255)  NOT NULL,
        "password_hash" varchar(255)  NOT NULL,
        "display_name"  varchar(64)   NOT NULL,
        "created_at"    timestamptz   NOT NULL DEFAULT now(),
        "updated_at"    timestamptz   NOT NULL DEFAULT now(),
        CONSTRAINT "pk_account" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_account_email" ON "account" ("email")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "book" (
        "id"          uuid          NOT NULL DEFAULT gen_random_uuid(),
        "owner_id"    uuid          NOT NULL,
        "title"       varchar(200)  NOT NULL,
        "description" text,
        "status"      varchar(16)   NOT NULL DEFAULT 'draft',
        "created_at"  timestamptz   NOT NULL DEFAULT now(),
        "updated_at"  timestamptz   NOT NULL DEFAULT now(),
        CONSTRAINT "pk_book" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_book_owner_id" ON "book" ("owner_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "chapter" (
        "id"          uuid          NOT NULL DEFAULT gen_random_uuid(),
        "book_id"     uuid          NOT NULL,
        "title"       varchar(200)  NOT NULL,
        "content"     text          NOT NULL DEFAULT '',
        "order_index" integer       NOT NULL DEFAULT 0,
        "word_count"  integer       NOT NULL DEFAULT 0,
        "created_at"  timestamptz   NOT NULL DEFAULT now(),
        "updated_at"  timestamptz   NOT NULL DEFAULT now(),
        CONSTRAINT "pk_chapter" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_chapter_book_id" ON "chapter" ("book_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "chapter" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "book" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "account" CASCADE`);
  }
}
