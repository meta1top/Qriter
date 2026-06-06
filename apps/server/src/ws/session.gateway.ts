import {
  BaseWebSocketGateway,
  WsAuthGuard,
  WsExceptionFilter,
} from "@qriter/common";
import {
  AGENT_WS_EVENTS,
  AGENT_WS_NAMESPACE,
  type AgentStreamChunk,
} from "@qriter/types";
import { UseFilters, UseGuards } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { JwtService } from "@nestjs/jwt";
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from "@nestjs/websockets";
import type { Socket } from "socket.io";

/** session.subscribe 订阅入参：以 sessionId 为房间名。 */
interface SessionTopic {
  sessionId: string;
}

/**
 * 会话流式 WebSocket Gateway。端点：ws://<host>/ws/session
 *
 * - 复用 BaseWebSocketGateway 的握手鉴权 + 未鉴权宽限回收
 * - 客户端 session.subscribe：join 以 sessionId 为名的房间
 * - AgentRunnerService 经 EventEmitter2 发的 run.* 事件，由本 Gateway @OnEvent
 *   监听后按 payload.sessionId 转发到对应房间
 *
 * 精简版：不做 inflight 快照 / 中断（qriter 暂无 Session 持久化），仅做订阅与转发。
 */
@WebSocketGateway({ namespace: AGENT_WS_NAMESPACE, cors: true })
@UseFilters(WsExceptionFilter)
export class SessionGateway extends BaseWebSocketGateway {
  constructor(private readonly jwt: JwtService) {
    super();
  }

  protected jwtVerify(token: string): unknown {
    return this.jwt.verify(token);
  }

  /** 订阅会话：join 房间。 */
  @UseGuards(WsAuthGuard)
  @SubscribeMessage(AGENT_WS_EVENTS.subscribe)
  handleSubscribe(
    @MessageBody() body: SessionTopic,
    @ConnectedSocket() client: Socket,
  ): void {
    client.join(body.sessionId);
  }

  /** AgentRunnerService → run.chunk → 转发到房间（assistant 正文增量）。 */
  @OnEvent(AGENT_WS_EVENTS.runChunk)
  onRunChunk(payload: Extract<AgentStreamChunk, { type: "chunk" }>): void {
    this.server.to(payload.sessionId).emit(AGENT_WS_EVENTS.runChunk, payload);
  }

  /** AgentRunnerService → run.tool_call_start → 转发到房间。 */
  @OnEvent(AGENT_WS_EVENTS.runToolCallStart)
  onRunToolCallStart(
    payload: Extract<AgentStreamChunk, { type: "tool_calls" }>,
  ): void {
    this.server
      .to(payload.sessionId)
      .emit(AGENT_WS_EVENTS.runToolCallStart, payload);
  }

  /**
   * AgentRunnerService → run.tool_call_end → 转发到房间。
   * 剥掉可能很大的 `args` 字段（前端只需知道工具调用已结束），
   * 完整内容留在 NestJS event bus 供未来落库消费（不上 socket）。
   */
  @OnEvent(AGENT_WS_EVENTS.runToolCallEnd)
  onRunToolCallEnd(
    payload: Extract<AgentStreamChunk, { type: "tool_calls" }>,
  ): void {
    const { args: _args, ...wireOut } = payload;
    this.server
      .to(payload.sessionId)
      .emit(AGENT_WS_EVENTS.runToolCallEnd, wireOut);
  }

  /** AgentRunnerService → run.assistant_done → 转发到房间。 */
  @OnEvent(AGENT_WS_EVENTS.runAssistantDone)
  onRunAssistantDone(
    payload: Extract<AgentStreamChunk, { type: "assistant_done" }>,
  ): void {
    this.server
      .to(payload.sessionId)
      .emit(AGENT_WS_EVENTS.runAssistantDone, payload);
  }

  /** AgentRunnerService → run.error → 转发到房间。 */
  @OnEvent(AGENT_WS_EVENTS.runError)
  onRunError(payload: { sessionId: string; message: string }): void {
    this.server.to(payload.sessionId).emit(AGENT_WS_EVENTS.runError, payload);
  }

  /** AgentRunnerService → run.interrupted → 转发到房间。 */
  @OnEvent(AGENT_WS_EVENTS.runInterrupted)
  onRunInterrupted(payload: { sessionId: string }): void {
    this.server
      .to(payload.sessionId)
      .emit(AGENT_WS_EVENTS.runInterrupted, payload);
  }
}
