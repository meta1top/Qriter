import { createI18nZodDto } from "@qriter/shared";
import { AgentRunRequestSchema } from "@qriter/types";
import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";

import {
  CurrentUser,
  type CurrentUserPayload,
} from "../auth/current-user.decorator";
import { AgentRunnerService } from "./agent.runner.service";

/**
 * agent run 请求 DTO —— class + interface 合并，暴露 zod 推断字段。
 */
// biome-ignore lint/suspicious/noUnsafeDeclarationMerging: intentional class+interface merge to expose zod-inferred fields
export class AgentRunDto extends createI18nZodDto(AgentRunRequestSchema) {}
export interface AgentRunDto {
  sessionId?: string;
  projectId: string;
  message: string;
}

/**
 * Agent 端点。`POST /api/agent/run` 发起一次 run（鉴权后由 JwtAuthGuard 全局保护）。
 *
 * Controller 只接收请求 + 取当前用户 + 调 AgentRunnerService，业务下沉到 service。
 */
@ApiTags("agent")
@ApiBearerAuth("jwt")
@Controller("agent")
export class AgentController {
  constructor(private readonly runner: AgentRunnerService) {}

  @ApiOperation({
    summary: "发起一次 agent run（结果经 WS /ws/session 流式回推）",
  })
  @Post("run")
  @HttpCode(202)
  async run(
    @Body() dto: AgentRunDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<{ sessionId: string }> {
    return this.runner.run({
      projectId: dto.projectId,
      sessionId: dto.sessionId,
      message: dto.message,
      userId: user.userId,
    });
  }
}
