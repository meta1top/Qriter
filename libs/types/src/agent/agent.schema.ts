import { z } from "zod";

/** 会话状态：idle = 无 run；running = 有 run 在跑。 */
export const SessionStatus = z.enum(["idle", "running"]);
export type SessionStatus = z.infer<typeof SessionStatus>;

/**
 * 发起一次 agent run 的入参。
 *
 * - `sessionId` 可选：不传则由服务端新建会话。
 * - `projectId`：run 归属的书籍 / 项目（逻辑外键）。
 * - `message`：本轮用户消息正文。
 */
export const AgentRunRequestSchema = z.object({
  sessionId: z.string().uuid().optional(),
  projectId: z.string().uuid({ message: "validation.invalidUuid" }),
  message: z.string().min(1, { message: "validation.required" }),
});

export type AgentRunRequestInput = z.infer<typeof AgentRunRequestSchema>;

/**
 * Agent 流式输出的判别联合（discriminated union）类型 —— 仅 TS 类型，不做运行时校验。
 *
 * runner 通过 WS 逐块推送；前端按 `type` 字段分派渲染：
 * - `human`：用户消息已写入 checkpointer（迁出 pending 区）。
 * - `reasoning`：推理模型的思考过程增量（不落库）。
 * - `chunk`：assistant 正文增量。
 * - `tool_calls`：本轮 tool 调用（开始执行）。
 * - `assistant_done`：assistant 消息完成。
 * - `usage`：单次 LLM 调用的 token 用量。
 */
export type AgentStreamChunk =
  | { type: "human"; sessionId: string; messageId: string; content: string }
  | { type: "reasoning"; sessionId: string; messageId: string; delta: string }
  | { type: "chunk"; sessionId: string; messageId: string; delta: string }
  | {
      type: "tool_calls";
      sessionId: string;
      messageId: string;
      toolCallId: string;
      name: string;
      args: unknown;
    }
  | {
      type: "assistant_done";
      sessionId: string;
      messageId: string;
      content: string;
    }
  | {
      type: "usage";
      sessionId: string;
      messageId: string;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
    };

/** WS namespace —— agent run 的 socket.io 命名空间。 */
export const AGENT_WS_NAMESPACE = "/ws/session";

/** WS 事件名常量 —— gateway 广播与前端订阅共用，避免裸字符串散落。 */
export const AGENT_WS_EVENTS = {
  /** 客户端：订阅某会话的 run 事件流。 */
  subscribe: "session.subscribe",
  /** 服务端：assistant 正文增量。 */
  runChunk: "run.chunk",
  /** 服务端：tool 即将开始执行。 */
  runToolCallStart: "run.tool_call_start",
  /** 服务端：tool 执行结束（成功 / 失败）。 */
  runToolCallEnd: "run.tool_call_end",
  /** 服务端：assistant 消息完成。 */
  runAssistantDone: "run.assistant_done",
  /** 服务端：run 出错。 */
  runError: "run.error",
  /** 服务端：run 被中断。 */
  runInterrupted: "run.interrupted",
} as const;

export type AgentWsEvent =
  (typeof AGENT_WS_EVENTS)[keyof typeof AGENT_WS_EVENTS];
