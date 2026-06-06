import { RedisHealthIndicator, SkipResponseEnvelope } from "@qriter/common";
import { Controller, Get } from "@nestjs/common";
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from "@nestjs/swagger";
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
@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly redis: RedisHealthIndicator,
  ) {}

  @Public()
  @SkipResponseEnvelope()
  @ApiOperation({ summary: "结构化健康检查（DB + Redis 分组上报）" })
  @ApiOkResponse({
    description:
      "全部组件 up（Terminus 自有 shape，@SkipResponseEnvelope 不包 envelope）",
    schema: {
      type: "object",
      properties: {
        status: { type: "string", example: "ok" },
        info: {
          type: "object",
          example: { database: { status: "up" }, redis: { status: "up" } },
        },
        error: { type: "object", example: {} },
        details: {
          type: "object",
          example: { database: { status: "up" }, redis: { status: "up" } },
        },
      },
    },
  })
  @ApiServiceUnavailableResponse({
    description: "有组件 down → 503，error/details 指明失败组件",
  })
  @Get()
  @HealthCheck()
  check(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.db.pingCheck("database"),
      () => this.redis.isHealthy("redis"),
    ]);
  }
}
