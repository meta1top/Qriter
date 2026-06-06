import { RedisHealthIndicator, SkipResponseEnvelope } from "@qriter/common";
import { Controller, Get } from "@nestjs/common";
import {
  HealthCheck,
  type HealthCheckResult,
  HealthCheckService,
  TypeOrmHealthIndicator,
} from "@nestjs/terminus";

import { Public } from "./auth/public.decorator";

/**
 * 结构化健康检查。
 *
 * GET /api/health 返回 Terminus shape：
 * ```json
 * {
 *   "status": "ok",
 *   "info": { "database": { "status": "up" }, "redis": { "status": "up" } },
 *   "error": {},
 *   "details": { ... }
 * }
 * ```
 *
 * 任一组件 down → status 503 + 标记哪个组件失败，运维 / 网关可精准判断。
 *
 * `@SkipResponseEnvelope()` 让 ResponseInterceptor 不包装 Terminus 自有 shape。
 */
@Controller("health")
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly redis: RedisHealthIndicator,
  ) {}

  @Public()
  @SkipResponseEnvelope()
  @Get()
  @HealthCheck()
  check(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.db.pingCheck("database"),
      () => this.redis.isHealthy("redis"),
    ]);
  }
}
