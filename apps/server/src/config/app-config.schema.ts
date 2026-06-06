import { z } from "zod";

/**
 * 数据库配置 —— 直接映射 TypeORM `DataSourceOptions`（postgres）。
 *
 * `AppModule.forRoot` 把整块 `{...config.database}` 透传给 `TypeOrmModule.forRoot`，
 * 再补 `namingStrategy` / `migrations` / `migrationsRun` 等应用级项。`.passthrough()`
 * 允许在 YAML 里追加其它 TypeORM 选项（如 `ssl` / `extra` / `poolSize`）而无需改 schema。
 */
export const DatabaseConfigSchema = z
  .object({
    type: z.literal("postgres").default("postgres"),
    host: z.string().default("localhost"),
    port: z.coerce.number().int().min(1).max(65535).default(5432),
    username: z.string(),
    password: z.string(),
    database: z.string(),
    synchronize: z.boolean().default(false),
    autoLoadEntities: z.boolean().default(true),
    logging: z.union([z.boolean(), z.array(z.string())]).optional(),
  })
  .passthrough();

/** JWT 签名配置。 */
export const JwtConfigSchema = z.object({
  secret: z
    .string()
    .min(16, "jwt.secret 至少 16 字符（生产建议 32 字节随机串）"),
  expires: z
    .string()
    .regex(/^\d+[smhd]$/, "jwt.expires 形如 7d / 12h / 60m / 3600s")
    .default("7d"),
});

/** Redis 配置（可选）。未配置 → 锁 / 缓存 / 限流走 memory 兜底（仅单实例正确）。 */
export const RedisConfigSchema = z.object({
  url: z
    .string()
    .regex(/^rediss?:\/\//, "redis.url 必须以 redis:// 或 rediss:// 开头"),
});

/**
 * LLM 配置（可选）—— agent 模型凭证。配了从这里取（来自 Nacos / YAML），
 * 避免散落环境变量。未配置则 agent 不可跑模型（lazy，实际取模型时才报错）。
 */
export const LlmConfigSchema = z.object({
  provider: z.enum(["anthropic", "openai"]).optional(),
  model: z.string().optional(),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
});

/**
 * qriter server 应用配置 —— 由 YAML / Nacos 加载成「多层级对象」，经本 schema 校验。
 *
 * `loadAppConfig(AppConfigSchema, ...)` 在 Nest 生命周期外完成加载 + 校验，
 * 再经 `AppModule.forRoot(config)` 把各切片分发给对应模块。
 */
export const AppConfigSchema = z.object({
  // 必填：不给默认值 —— 漏配 node_env 会让「生产」按 development 跑（自动迁移 + 挂 Swagger），
  // 安全默认应是 fail-fast 而非静默退化。application.yml / Nacos 配置都须显式给出。
  node_env: z.enum(["development", "production", "test"]),
  port: z.coerce.number().int().min(1).max(65535).default(3000),
  database: DatabaseConfigSchema,
  jwt: JwtConfigSchema,
  redis: RedisConfigSchema.optional(),
  llm: LlmConfigSchema.optional(),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;
export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>;
export type JwtConfig = z.infer<typeof JwtConfigSchema>;
export type RedisConfig = z.infer<typeof RedisConfigSchema>;
export type LlmConfig = z.infer<typeof LlmConfigSchema>;

/**
 * 全局 DI token —— 持有「强类型嵌套 AppConfig」。
 * 任意 service 可 `@Inject(APP_CONFIG) config: AppConfig` 按需取自己关心的切片。
 */
export const APP_CONFIG = Symbol("APP_CONFIG");
