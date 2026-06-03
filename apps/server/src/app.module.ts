import path from "node:path";
import { AccountModule } from "@qriter/account";
import { BookModule } from "@qriter/book";
import {
  CommonModule,
  type CommonModuleOptions,
  createEnvValidator,
  FailOpenThrottlerStorage,
  PlainTextLogger,
  ProxyThrottlerGuard,
  RedisCacheProvider,
  RedisHealthIndicator,
  RedisLockProvider,
} from "@qriter/shared";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { TerminusModule } from "@nestjs/terminus";
import {
  type ThrottlerModuleOptions,
  ThrottlerModule,
} from "@nestjs/throttler";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ThrottlerStorageRedisService } from "@nest-lab/throttler-storage-redis";
import Redis from "ioredis";
import {
  AcceptLanguageResolver,
  CookieResolver,
  HeaderResolver,
  I18nJsonLoader,
  I18nModule,
  QueryResolver,
} from "nestjs-i18n";
import { SnakeNamingStrategy } from "typeorm-naming-strategies";
import { AgentModule } from "./agent/agent.module";
import { AuthModule } from "./auth/auth.module";
import { JwtAuthGuard } from "./auth/jwt-auth.guard";
import { EnvSchema } from "./env.schema";
import { HealthController } from "./health.controller";
import { REDIS_CLIENT, RedisModule } from "./redis.module";
import { AuthController } from "./rest/auth.controller";
import { HealthGateway } from "./ws/health.gateway";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env.development", ".env"],
      // 启动期 Zod 校验，缺失 / 非法 env 直接 fail-fast
      validate: createEnvValidator(EnvSchema),
    }),
    // 全局 Redis 连接（导出 REDIS_CLIENT，供下面的 forRootAsync inject）
    RedisModule,
    // 锁 / 缓存：通过 REDIS_CLIENT 共享同一 Redis 实例
    CommonModule.forRootAsync({
      inject: [REDIS_CLIENT],
      useFactory: (redis: Redis | null): CommonModuleOptions => {
        if (!redis) return {};
        return {
          lock: new RedisLockProvider(redis),
          cache: new RedisCacheProvider(redis),
        };
      },
    }),
    I18nModule.forRoot({
      fallbackLanguage: "zh",
      loader: I18nJsonLoader,
      loaderOptions: {
        path: path.join(__dirname, "i18n"),
        watch: process.env.NODE_ENV !== "production",
      },
      resolvers: [
        new CookieResolver(["locale"]),
        new HeaderResolver(["x-lang"]),
        new AcceptLanguageResolver(),
        new QueryResolver(["lang"]),
      ],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => {
        const isProd = process.env.NODE_ENV === "production";
        return {
          type: "postgres" as const,
          url: cfg.getOrThrow<string>("DATABASE_URL"),
          autoLoadEntities: true,
          namingStrategy: new SnakeNamingStrategy(),
          synchronize: false,
          migrationsRun: !isProd,
          migrations: [path.join(__dirname, "migrations", "*.{js,ts}")],
          logging: isProd ? ["error"] : ["error", "warn", "migration"],
          // production 切纯文本 logger + 强制 UTC 时区
          ...(isProd
            ? {
                logger: new PlainTextLogger(),
                extra: { options: "-c timezone=UTC" },
              }
            : {}),
        };
      },
    }),
    // 全局限流，proxy-aware。Redis 存在时走共享 storage（多副本计数一致）；
    // 否则 memory（单实例）。Redis 故障时 fail-open（限流暂失效优于全站 500）。
    ThrottlerModule.forRootAsync({
      inject: [REDIS_CLIENT],
      useFactory: (redis: Redis | null): ThrottlerModuleOptions => ({
        throttlers: [
          { name: "short", ttl: 1000, limit: 30 },
          { name: "medium", ttl: 60_000, limit: 300 },
          { name: "long", ttl: 3_600_000, limit: 5000 },
        ],
        ...(redis
          ? {
              storage: new FailOpenThrottlerStorage(
                new ThrottlerStorageRedisService(redis),
              ),
            }
          : {}),
      }),
    }),
    // 结构化健康检查（DB + Redis 分组上报）
    TerminusModule,
    // run.* 事件总线：AgentRunnerService 发，SessionGateway 收
    EventEmitterModule.forRoot(),
    AuthModule,
    AccountModule,
    BookModule,
    AgentModule,
  ],
  controllers: [HealthController, AuthController],
  providers: [
    RedisHealthIndicator,
    HealthGateway,
    // 注意：guard 注册顺序 = 执行顺序（先 throttle、后 jwt）
    { provide: APP_GUARD, useClass: ProxyThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
