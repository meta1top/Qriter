/**
 * TypeORM CLI 用 DataSource —— 仅供 `pnpm migration <cmd>` 使用。
 * runtime 走 `app.module.ts` 里的 `TypeOrmModule.forRoot(config.database)`，不动这个文件。
 *
 * 配置与 server 同源：经 `loadAppConfig` 走 Nacos（`.env` 配了 NACOS_SERVER_ADDR）
 * 或本地 YAML 回退，只取 database 切片。导出 `Promise<DataSource>`，TypeORM CLI 会 await。
 *
 * 入口 entities 用 glob 指向 libs/{account,book} 源码 + 编译产物，CLI 两种形态都吃。
 * 路径以本文件所在目录为基准（typeorm-ts-node-commonjs 是 CJS，__dirname 可用）。
 */
import "reflect-metadata";
import path from "node:path";
import { loadAppConfig } from "@qriter/shared";
import { DataSource, type DataSourceOptions } from "typeorm";
import { SnakeNamingStrategy } from "typeorm-naming-strategies";
import { z } from "zod";
import { DatabaseConfigSchema } from "./config/app-config.schema";

const SRC_DIR = __dirname;
const APP_ROOT = path.join(SRC_DIR, "..");
const REPO_ROOT = path.join(APP_ROOT, "..", "..");

// 迁移只需 database 切片（不要 jwt 等），用仅含 database 的 schema 校验。
const MigrationConfigSchema = z.object({ database: DatabaseConfigSchema });

export default loadAppConfig(MigrationConfigSchema, {
  cwd: APP_ROOT,
  envFiles: [".env"],
  yamlFiles: ["config/application.yml", "config/application.local.yml"],
}).then(({ database }) => {
  // autoLoadEntities 是 @nestjs/typeorm 专属项，原生 DataSource 不认；剥掉，用显式 entities glob。
  const { autoLoadEntities: _autoLoad, ...dbOptions } = database;
  return new DataSource({
    ...dbOptions,
    entities: [
      path.join(REPO_ROOT, "libs", "account", "src", "**", "*.entity.{ts,js}"),
      path.join(REPO_ROOT, "libs", "book", "src", "**", "*.entity.{ts,js}"),
    ],
    migrations: [path.join(SRC_DIR, "migrations", "*.{ts,js}")],
    namingStrategy: new SnakeNamingStrategy(),
  } as DataSourceOptions);
});
