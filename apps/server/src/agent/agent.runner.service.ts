import { randomUUID } from "node:crypto";
import { GraphService, type StreamChunk } from "@qriter/agent";
import { AGENT_WS_EVENTS } from "@qriter/types";
import { Injectable, Logger } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";

/** 发起一次 run 的入参。 */
export interface AgentRunInput {
  /** run 归属的书籍 / 项目（逻辑外键）。 */
  projectId: string;
  /** 会话 id；不传则由本服务新建一个。 */
  sessionId?: string;
  /** 本轮用户消息正文。 */
  message: string;
  /** 发起 run 的账号 id。 */
  userId: string;
}

/**
 * Agent run 编排服务（精简版）。
 *
 * 职责：给定一次 run 请求，调用 `GraphService.streamMessage` 逐块取流，
 * 把每个 `StreamChunk` 翻译成 EventEmitter2 的 `run.*` 事件广播出去，
 * 由 `SessionGateway` 监听后转发到对应 socket 房间。
 *
 * 边界（地基版，后续会补全为完整 RunnerService）：
 * - **不做 DB 持久化**：qriter 暂无 Session / SessionMessage 实体。
 * - **每会话单 inflight**：用 `inflight` Set 去重，同 sessionId 第二次 run 直接拒绝。
 * - 不做 resume / 中断 / 压缩（留待后续领域逻辑）。
 */
@Injectable()
export class AgentRunnerService {
  private readonly logger = new Logger(AgentRunnerService.name);

  /** 正在跑的 sessionId 集合，保证每会话同一时刻至多一个 inflight run。 */
  private readonly inflight = new Set<string>();

  constructor(
    private readonly graph: GraphService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * 发起一次 run。返回最终的 sessionId（新建时为生成值）。
   *
   * 流式过程异步推进：本方法 await 整个流跑完后 resolve；调用方（controller）
   * 通常 fire-and-forget，前端经 WS 房间实时收 `run.*` 事件。
   */
  async run(input: AgentRunInput): Promise<{ sessionId: string }> {
    const sessionId = input.sessionId ?? randomUUID();
    if (this.inflight.has(sessionId)) {
      this.logger.warn(`会话已有 inflight run，忽略重复 kick：${sessionId}`);
      return { sessionId };
    }
    this.inflight.add(sessionId);
    try {
      await this.consume(sessionId, input);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`run 失败 session=${sessionId}：${message}`);
      this.events.emit(AGENT_WS_EVENTS.runError, { sessionId, message });
    } finally {
      this.inflight.delete(sessionId);
    }
    return { sessionId };
  }

  /**
   * 消费 GraphService 流，把每个 chunk 翻译为 `run.*` 事件。
   *
   * StreamChunk 的判别字段是 `kind`（agent core 约定），此处按 kind 映射到
   * qriter 的 WS 事件名 + payload（payload 统一带 `sessionId` 供 gateway 路由）。
   */
  private async consume(
    sessionId: string,
    input: AgentRunInput,
  ): Promise<void> {
    const stream = this.graph.streamMessage(
      sessionId,
      [{ id: randomUUID(), content: input.message }],
      undefined,
      { userId: input.userId, projectId: input.projectId },
    );
    for await (const chunk of stream) {
      this.dispatch(sessionId, chunk);
    }
  }

  private dispatch(sessionId: string, chunk: StreamChunk): void {
    switch (chunk.kind) {
      case "chunk":
        this.events.emit(AGENT_WS_EVENTS.runChunk, {
          type: "chunk",
          sessionId,
          messageId: chunk.messageId,
          delta: chunk.delta,
        });
        return;
      case "tool_calls":
        this.events.emit(AGENT_WS_EVENTS.runToolCallStart, {
          type: "tool_calls",
          sessionId,
          messageId: chunk.messageId,
          toolCalls: chunk.toolCalls,
        });
        return;
      case "assistant_done":
        this.events.emit(AGENT_WS_EVENTS.runAssistantDone, {
          type: "assistant_done",
          sessionId,
          messageId: chunk.messageId,
          content: chunk.content,
        });
        return;
      default:
        // human / reasoning / reasoning_done / usage 等暂不转发（精简地基）
        return;
    }
  }
}
