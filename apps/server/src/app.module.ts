import path from "node:path";
import { AccountModule } from "@qriter/account";
import { BookModule } from "@qriter/book";
import {
  CommonModule,
  type CommonModuleOptions,
  FailOpenThrottlerStorage,
  PlainTextLogger,
  ProxyThrottlerGuard,
  RedisCacheProvider,
  RedisHealthIndicator,
  RedisLockProvider,
} from "@qriter/shared";
import { type DynamicModule, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { TerminusModule } from "@nestjs/terminus";
import {
  type ThrottlerModuleOptions,
  ThrottlerModule,
} from "@nestjs/throttler";
import { type TypeOrmModuleOptions, TypeOrmModule } from "@nestjs/typeorm";
import { ThrottlerStorageRedisService } from "@nest-lab/throttler-storage-redis";
import type Redis from "ioredis";
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
import { AppConfigModule } from "./config/app-config.module";
import type { AppConfig } from "./config/app-config.schema";
import { HealthController } from "./health.controller";
import { REDIS_CLIENT, RedisModule } from "./redis.module";
import { AuthController } from "./rest/auth.controller";
import { HealthGateway } from "./ws/health.gateway";

/**
 * 根模块走 `forRoot(config)` 动态模块形态。
 *
 * 配置加载在 Nest 生命周期之外完成（`main.ts` 里的 `loadAppConfig` 从 YAML / Nacos
 * 读成强类型嵌套 `AppConfig`），再经 `AppModule.forRoot(config)` 把各切片分发给对应
 * 模块：`TypeOrmModule.forRoot(config.database)`、`RedisModule`（读 config.redis）、
 * `AuthModule`（读 config.jwt）等；并通过 `AppConfigModule` 把整份 `APP_CONFIG`
 * 暴露到全局，供任意 service 注入按需取用。
 */
@Module({})
export class AppModule {
  static forRoot(config: AppConfig): DynamicModule {
    const isProd = config.node_env === "production";
    return {
      module: AppModule,
      imports: [
        // 全局 APP_CONFIG（各模块按需 inject 取切片）
        AppConfigModule.forRoot(config),
        // 全局 Redis 连接（读 config.redis，导出 REDIS_CLIENT 供下面 forRootAsync inject）
        RedisModule,
        // 锁 / 缓存：通过 REDIS_CLIENT 共享同一 Redis 实例
        CommonModule.forRootAsync({
          inject: [REDIS_CLIENT],
          useFactory: (redis: Redis | null): CommonModuleOptions =>
            redis
              ? {
                  lock: new RedisLockProvider(redis),
                  cache: new RedisCacheProvider(redis),
                }
              : {},
        }),
        I18nModule.forRoot({
          fallbackLanguage: "zh",
          loader: I18nJsonLoader,
          loaderOptions: {
            path: path.join(__dirname, "i18n"),
            watch: !isProd,
          },
          resolvers: [
            new CookieResolver(["locale"]),
            new HeaderResolver(["x-lang"]),
            new AcceptLanguageResolver(),
            new QueryResolver(["lang"]),
          ],
        }),
        // 数据库：整块 config.database 透传给 TypeORM，再补 namingStrategy /
        // migrations / migrationsRun 等应用级项（生产不自动跑迁移）。
        TypeOrmModule.forRoot({
          ...config.database,
          namingStrategy: new SnakeNamingStrategy(),
          migrations: [path.join(__dirname, "migrations", "*.{js,ts}")],
          migrationsRun: !isProd,
          ...(isProd ? { logger: new PlainTextLogger() } : {}),
        } as TypeOrmModuleOptions),
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
    };
  }
}
