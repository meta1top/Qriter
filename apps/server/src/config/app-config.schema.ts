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

/**
 * Redis 配置（可选）—— host / port / db / password 离散字段。
 * 未配置 → 锁 / 缓存 / 限流走 memory 兜底（仅单实例正确）。
 */
export const RedisConfigSchema = z.object({
  host: z.string(),
  port: z.coerce.number().int().min(1).max(65535).default(6379),
  db: z.coerce.number().int().min(0).max(15).default(0),
  password: z.string().optional(),
});

/**
 * LLM 配置（可选）—— agent 模型凭证。配了从这里取（来自 Nacos / YAML），
 * 避免散落环境变量。未配置则 agent 不可跑模型（lazy，实际取模型时才报错）。
 */
export const LlmConfigSchema = z.object({
  // deepseek 走 OpenAI 兼容协议（baseUrl=https://api.deepseek.com），由 agent 的工厂
  // 用 ChatOpenAI + baseUrl 路由，无需额外依赖。
  provider: z.enum(["anthropic", "openai", "deepseek"]).optional(),
  model: z.string().optional(),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
});

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

/**
 * 邮件发送配置（可选）—— 阿里云邮件推送 DirectMail 的 SMTP。
 * 未配置 → 验证码走 LogEmailSender 日志兜底（本地开发用）。
 */
export const EmailConfigSchema = z.object({
  host: z.string().default("smtpdm.aliyun.com"),
  port: z.coerce.number().int().min(1).max(65535).default(465),
  secure: z.boolean().default(true),
  /** 发信地址（DirectMail 控制台创建的发信地址）。 */
  user: z.string(),
  /** SMTP 密码（DirectMail 控制台为发信地址设置）。 */
  pass: z.string(),
  /** From 头，可含显示名，如 "Qriter <no-reply@mail.example.com>"；默认取 user。 */
  from: z.string().optional(),
});

/**
 * qriter server 应用配置 —— 由 YAML / Nacos 加载成「多层级对象」，经本 schema 校验。
 *
 * `loadAppConfig(AppConfigSchema, ...)` 在 Nest 生命周期外完成加载 + 校验，
 * 再经 `AppModule.forRoot(config)` 把各切片分发给对应模块。
 */
export const AppConfigSchema = z.object({
  // 注意：运行模式（dev/prod）不在这里 —— 它是「部署环境身份」而非业务配置，
  // 由 process.env.NODE_ENV 决定（prod 镜像烤 production、本地不设=dev、jest=test），
  // 不放 Nacos（避免与 NODE_ENV 两份来源打架 + 漏配静默退化的坑）。
  port: z.coerce.number().int().min(1).max(65535).default(3000),
  database: DatabaseConfigSchema,
  jwt: JwtConfigSchema,
  redis: RedisConfigSchema.optional(),
  llm: LlmConfigSchema.optional(),
  oauth: OAuthConfigSchema.optional(),
  email: EmailConfigSchema.optional(),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;
export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>;
export type JwtConfig = z.infer<typeof JwtConfigSchema>;
export type RedisConfig = z.infer<typeof RedisConfigSchema>;
export type LlmConfig = z.infer<typeof LlmConfigSchema>;
export type GoogleOAuthConfig = z.infer<typeof GoogleOAuthConfigSchema>;
export type EmailConfig = z.infer<typeof EmailConfigSchema>;

/**
 * 全局 DI token —— 持有「强类型嵌套 AppConfig」。
 * 任意 service 可 `@Inject(APP_CONFIG) config: AppConfig` 按需取自己关心的切片。
 */
export const APP_CONFIG = Symbol("APP_CONFIG");
