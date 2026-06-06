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
