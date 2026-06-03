import {
  Global,
  Inject,
  Logger,
  Module,
  type OnModuleDestroy,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

/**
 * 共享 Redis 连接的 token —— CommonModule、ThrottlerModule、RedisHealthIndicator
 * 等都 inject 同一份 Redis 实例，避免多个连接池。
 *
 * value：`Redis | null`。`REDIS_URL` 未配置时为 null，消费方按 null 走 memory 兜底。
 *
 * 放在独立的 `@Global()` 模块里导出，而非塞进 AppModule.providers：
 * Nest 11 的模块封装更严，被 import 的动态模块（ThrottlerModule/CommonModule
 * 的 forRootAsync）其工厂 `inject` 无法穿透到宿主模块「未导出」的 provider，
 * 必须靠全局模块导出才能被解析。
 */
export const REDIS_CLIENT = Symbol("REDIS_CLIENT");

/**
 * 共享 Redis 连接的生命周期管理 —— 应用关闭 / 热重载时 `quit()`，避免连接泄漏
 * （测试 / dev watch 反复重启会累积）。
 *
 * `REDIS_CLIENT` 是 useFactory 裸值 provider，本身没有 NestJS 销毁钩子；
 * 用一个独立 provider 持有引用并实现 `OnModuleDestroy` 来兜底关闭。
 */
class RedisLifecycle implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis | null) {}

  async onModuleDestroy(): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.quit();
    } catch {
      // 关闭阶段出错无需上抛，强制断开即可
      this.redis.disconnect();
    }
  }
}

/**
 * 全局 Redis 模块 —— 提供并导出 `REDIS_CLIENT`，供锁 / 缓存 / 限流 / 健康检查共享。
 *
 * 依赖全局 `ConfigService`（ConfigModule.forRoot({ isGlobal: true })）读取 `REDIS_URL`。
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (cfg: ConfigService): Redis | null => {
        const url = cfg.get<string>("REDIS_URL");
        if (!url) return null;
        // 启动失败让 server 整体 fail-fast，不悄悄退化到 memory
        const redis = new Redis(url, {
          maxRetriesPerRequest: 3,
          lazyConnect: false,
        });
        // 必须监听 'error'：ioredis 运行期断连 / 重连失败会 emit 'error'，
        // EventEmitter 'error' 无监听器时 Node 默认抛未捕获异常 → 整进程崩溃。
        // lock / cache / throttler / health 全依赖这一连接，绝不能因 Redis
        // 抖动拖垮整个 server。这里只记录，让 ioredis 自行重连。
        redis.on("error", (err: Error) => {
          new Logger("RedisClient").error(
            `Redis 连接错误（ioredis 将自动重连）：${err.message}`,
          );
        });
        return redis;
      },
    },
    RedisLifecycle,
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
