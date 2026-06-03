import { randomUUID } from "node:crypto";
import type { BaseMessage } from "@langchain/core/messages";
import {
  AIMessageChunk,
  HumanMessage,
  RemoveMessage,
  SystemMessage,
} from "@langchain/core/messages";
import type { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { Inject, Injectable, Optional } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import {
  CHECKPOINTER_CONN_STRING,
  createPostgresCheckpointer,
} from "../checkpoint/postgres-checkpointer";
import {
  type ModelMeta,
  MODEL_META,
  MODEL_PROVIDER,
} from "../llm/model-provider";
import { ToolRegistry } from "../tools/tool-registry";
import type { GraphState } from "./graph.builder";
import { buildSupervisorGraph } from "./graph.builder";
import type { ModelProvider } from "./nodes/supervisor.node";

/** 注入会话首轮系统提示词的可选 token。 */
export const SYSTEM_PROMPT = Symbol("QRITER_SYSTEM_PROMPT");

export interface AgentConfig {
  model: string;
  temperature?: number;
  systemPrompt?: string;
  tools?: string[];
}

export type ThreadId = string;

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  /**
   * 推理模型的思考过程，来源于 AIMessage.additional_kwargs.reasoning_content。
   * checkpointer 一直会持久化它，刷新会话也能拿回；非推理模型为 undefined。
   */
  reasoning?: string;
}

/**
 * 流式 run 产出的事件：
 * - human：本批次每条 user 消息以 HumanMessage 形式写入 checkpointer 时各 yield 一次；
 * - reasoning：单个 reasoning token；
 * - chunk：单个 assistant content token；
 * - reasoning_done：本轮 LLM 第一次出现非空 tool_calls 字段（reasoning_content 阶段
 *   结束、转入 tool_calls token 流）。前端据此尽早锁 reasoningDurationMs；
 * - tool_calls：LLM 本轮调用的全部工具调用（本轮 LLM 结束、tools 节点开跑前 yield）；
 * - assistant_done：本轮 LLM 完整结束（finish=stop 或 finish=tool_calls）。runner 据此
 *   持久化一条 assistant；ReAct 多轮里会 emit 多次（每轮一次）。
 *   usage 跟随同一轮的 assistant_done 之后立即 yield。
 * - usage：调用结束的 token 用量。
 */
export type StreamChunk =
  | { kind: "human"; messageId: string }
  | { kind: "reasoning"; messageId: string; delta: string }
  | { kind: "chunk"; messageId: string; delta: string }
  | { kind: "reasoning_done"; messageId: string }
  | {
      kind: "tool_calls";
      messageId: string;
      /** LangChain AIMessage.tool_calls 原始数组（含 id/name/args）。 */
      toolCalls: unknown[];
    }
  | {
      kind: "assistant_done";
      messageId: string;
      content: string;
      reasoning: string;
      toolCalls: unknown[] | null;
    }
  | {
      kind: "usage";
      messageId: string;
      providerType: string;
      model: string;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      cacheReadTokens: number;
      cacheCreationTokens: number;
      reasoningTokens: number;
      durationMs: number;
    };

@Injectable()
export class GraphService {
  private readonly checkpointer: PostgresSaver;
  private readonly checkpointerSetup: () => Promise<void>;
  private graph: ReturnType<typeof buildSupervisorGraph>;
  /**
   * 当前活跃模型的 provider/model meta，用于 usage 事件标注。
   */
  private readonly modelMeta: ModelMeta;
  /**
   * 最终使用的 ModelProvider。summarize 等非 graph 路径通过此字段调 invoke。
   */
  private readonly modelProvider: ModelProvider;

  constructor(
    private readonly toolRegistry: ToolRegistry,
    private readonly eventEmitter: EventEmitter2,
    @Inject(MODEL_PROVIDER) modelProvider: ModelProvider,
    @Inject(CHECKPOINTER_CONN_STRING) connString: string,
    @Optional() @Inject(MODEL_META) modelMeta?: ModelMeta,
    @Optional() @Inject(SYSTEM_PROMPT) private readonly systemPrompt?: string,
  ) {
    const { saver, setup } = createPostgresCheckpointer(connString);
    this.checkpointer = saver;
    this.checkpointerSetup = setup;
    this.modelProvider = modelProvider;
    // sessionId / messageId / signal 不经由 GraphService 单例字段闭包传给
    // toolsNode —— 而是 toolsNode 内部从 LangGraph 注入的 RunnableConfig 取，
    // 多 session 并发跑同一 GraphService 实例不再相互覆盖 ctx。
    this.graph = buildSupervisorGraph(
      this.checkpointer,
      this.modelProvider,
      this.toolRegistry,
      this.eventEmitter,
    );
    this.modelMeta = modelMeta ?? { providerType: "unknown", model: "unknown" };
  }

  /** 幂等建表：进程启动时调一次，确保 checkpointer 表结构就绪。 */
  async setup(): Promise<void> {
    await this.checkpointerSetup();
  }

  /**
   * 创建会话，返回 thread id。
   *
   * 仅生成 UUID；system prompt 在每次 streamMessage 时按需前置，
   * 不在此处写入 checkpointer（checkpointer.put 直写 API 易出错）。
   */
  async startSession(_config: AgentConfig): Promise<ThreadId> {
    const threadId = randomUUID();
    return threadId;
  }

  /**
   * 向会话发送一批消息并逐 token 流式产出 assistant 回复。
   *
   * 每条入参构造一条带显式 id 的 HumanMessage（id = 调用方的 PendingMessage.id），
   * 让 checkpointer 里的 user 消息与 pending 表可对齐去重。
   * system prompt 仅在首轮注入（无历史时）。透传 signal 支持中断。
   *
   * @param inputs 至少一条 —— 调用方保证非空批次。
   * @param meta 可选透传给 toolsNode 的 run 归属（userId / projectId）。
   */
  async *streamMessage(
    threadId: ThreadId,
    inputs: { id: string; content: string }[],
    signal?: AbortSignal,
    meta?: { userId?: string; projectId?: string },
  ): AsyncGenerator<StreamChunk> {
    yield* this.streamMessageImpl(threadId, inputs, signal, meta);
  }

  private async *streamMessageImpl(
    threadId: ThreadId,
    inputs: { id: string; content: string }[],
    signal?: AbortSignal,
    meta?: { userId?: string; projectId?: string },
  ): AsyncGenerator<StreamChunk> {
    await this.sanitizeOrphanToolCalls(threadId);
    const state = await this.graph.getState({
      configurable: { thread_id: threadId },
    });
    const hasHistory =
      Array.isArray((state.values as GraphState)?.messages) &&
      (state.values as GraphState).messages.length > 0;
    const inputMessages: BaseMessage[] = [];
    if (this.systemPrompt && !hasHistory) {
      inputMessages.push(new SystemMessage(this.systemPrompt));
    }
    for (const input of inputs) {
      inputMessages.push(
        new HumanMessage({ content: input.content, id: input.id }),
      );
    }
    // 先把本批次 user 消息以 human 事件 yield 出去，runner 据此 emit run.human，
    // 让 frontend 在 chunk 到达之前把 user 气泡从 pending 区迁到聊天区末尾。
    for (const input of inputs) {
      yield { kind: "human", messageId: input.id };
    }
    yield* this.runGraphStream(
      threadId,
      { messages: inputMessages },
      signal,
      meta,
    );
  }

  /**
   * 剪掉 checkpointer 里 trailing 的孤儿 tool_calls —— 即末尾 AIMessage 带
   * `tool_calls` 但后面没有对应数量的 ToolMessage。
   *
   * 触发场景：上一次 run 在 supervisor emit tool_calls 之后、tools 节点完成之前
   * 中断。下次 resume 时 LLM 会校验「tool_calls 必须有 ToolMessage 跟随」直接 400，
   * 会话彻底卡死。剪掉脏 tail 让 LLM 自然重新决策。
   *
   * 用 RemoveMessage + updateState：reducer 识别 RemoveMessage 后从 state 里删
   * 对应 id（messages.reducer 已扩展过）。
   */
  private async sanitizeOrphanToolCalls(threadId: ThreadId): Promise<void> {
    const snapshot = await this.graph.getState({
      configurable: { thread_id: threadId },
    });
    const msgs = (snapshot.values as GraphState | undefined)?.messages;
    if (!Array.isArray(msgs) || msgs.length === 0) return;
    const toRemove: string[] = [];
    // 从末尾向前找：连续的「带 tool_calls 但没有对应 ToolMessage 收尾」AIMessage
    // 都剪掉，直到遇到一个干净的。
    let i = msgs.length - 1;
    while (i >= 0) {
      const m = msgs[i] as BaseMessage & { tool_calls?: unknown[] };
      const toolCalls = Array.isArray(m.tool_calls) ? m.tool_calls : [];
      if (m._getType() !== "ai" || toolCalls.length === 0) break;
      const expectedIds = new Set(
        toolCalls
          .map((c) => (c as { id?: string }).id)
          .filter((id): id is string => typeof id === "string"),
      );
      for (let j = i + 1; j < msgs.length; j++) {
        const after = msgs[j] as BaseMessage & { tool_call_id?: string };
        if (after._getType() === "tool" && after.tool_call_id) {
          expectedIds.delete(after.tool_call_id);
        }
      }
      if (expectedIds.size === 0) break; // 已全覆盖，干净
      if (m.id) toRemove.push(m.id);
      i--;
    }
    if (toRemove.length === 0) return;
    console.warn(
      `[graph] sanitizeOrphanToolCalls thread=${threadId} 剪掉 ${toRemove.length} 条孤儿 tool_calls AI 消息：${toRemove.join(", ")}`,
    );
    await this.graph.updateState(
      { configurable: { thread_id: threadId } },
      { messages: toRemove.map((id) => new RemoveMessage({ id })) },
    );
  }

  /**
   * 从 checkpointer state 里剪掉 cutoff message 之后的所有消息（含 assistant
   * / tool / 后续轮 user）。cutoff 本身保留。供「重生成」流程用。
   *
   * 用 RemoveMessage + updateState（messages reducer 已支持 RemoveMessage）。
   * 找不到 cutoff message 时静默 no-op。
   */
  async cutMessagesAfter(
    threadId: ThreadId,
    cutoffMessageId: string,
  ): Promise<void> {
    const snapshot = await this.graph.getState({
      configurable: { thread_id: threadId },
    });
    const msgs = (snapshot.values as GraphState | undefined)?.messages ?? [];
    const idx = msgs.findIndex((m) => m.id === cutoffMessageId);
    if (idx < 0) return;
    const toRemove = msgs
      .slice(idx + 1)
      .map((m) => m.id)
      .filter((id): id is string => typeof id === "string");
    if (toRemove.length === 0) return;
    console.warn(
      `[graph] cutMessagesAfter thread=${threadId} cutoff=${cutoffMessageId} 剪掉 ${toRemove.length} 条后续消息：${toRemove.join(", ")}`,
    );
    await this.graph.updateState(
      { configurable: { thread_id: threadId } },
      { messages: toRemove.map((id) => new RemoveMessage({ id })) },
    );
  }

  /**
   * 拿出 checkpointer 里当前 thread 的 messages 数组快照。
   *
   * 给 ContextCompactor 用于切分计算。返回空数组表示线程没历史。
   */
  async getMessagesSnapshot(threadId: ThreadId): Promise<BaseMessage[]> {
    const snapshot = await this.graph.getState({
      configurable: { thread_id: threadId },
    });
    const msgs = (snapshot.values as GraphState | undefined)?.messages;
    return Array.isArray(msgs) ? msgs : [];
  }

  /**
   * 调摘要 LLM。serialized 已经是拍扁的对话文本（含 [user]/[assistant]/[tool]
   * 前缀、tool result 截断等），由调用方负责。这里只关心把 system prompt +
   * 用户串组合后丢给 enabled model invoke，并截 maxTokens。
   *
   * 用 AbortController 实现 timeoutMs；超时直接抛 Error("Summarize timeout")。
   */
  async summarize(
    serialized: string,
    opts: { systemPrompt: string; timeoutMs: number; maxTokens: number },
  ): Promise<string> {
    const model = await this.modelProvider();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
    try {
      const resp = await model.invoke(
        [new SystemMessage(opts.systemPrompt), new HumanMessage(serialized)],
        { signal: controller.signal, maxTokens: opts.maxTokens } as never,
      );
      const content = resp.content;
      return typeof content === "string" ? content : JSON.stringify(content);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * 一次性 updateState 重排压缩结果，让 LLM 看到的顺序是：
   *   [原系统提示词（若有，无 id 不会被删，自动留在最前）] [新摘要 system] [保留区 messages]
   *
   * 实现：reducer 是 `kept.concat(appended)`，只能 append、不能插中间。所以：
   * - removeIds 传入「所有带 id 的消息」（摘要区 + 保留区），把它们从 state 删掉；
   * - 系统提示词由 `new SystemMessage(prompt)` 创建时无 id，reducer 的 `!m.id`
   *   分支让它无条件保留在原位（首条）；
   * - 然后按 [摘要, ...保留区原对象] 顺序 append。保留区消息复用原对象（id 不变），
   *   被删后又重新加回 → 等效"移动到摘要之后"。
   *
   * 最终 state = [system(留), summary, ...keep]，摘要位于保留区之前，时序正确。
   */
  async applyCompaction(
    threadId: ThreadId,
    params: {
      removeIds: string[];
      summaryText: string;
      keep: BaseMessage[];
    },
  ): Promise<void> {
    const ops: BaseMessage[] = params.removeIds.map(
      (id) => new RemoveMessage({ id }),
    );
    ops.push(
      new SystemMessage({
        content: `[Earlier conversation summary]\n${params.summaryText}`,
        id: `compaction-summary-${randomUUID()}`,
      }),
    );
    ops.push(...params.keep);
    await this.graph.updateState(
      { configurable: { thread_id: threadId } },
      { messages: ops },
    );
  }

  /**
   * 不加新消息，从 checkpointer 现有状态恢复并流式产出 assistant 回复。
   *
   * 用于重试 —— failed 消息的 HumanMessage 已在会话里（最后一条），
   * 重试只让 graph 基于现有状态重跑产出回复。
   *
   * 传 `{ messages: [] }` 而非 `null`：已完成的图没有 pending task，
   * `stream(null)` 会原地返回不重跑；给一个空 messages 输入（concat reducer
   * 对空数组无副作用，不新增 user 消息）才会触发 START → supervisor 重新跑一轮。
   */
  async *resumeStream(
    threadId: ThreadId,
    signal?: AbortSignal,
    meta?: { userId?: string; projectId?: string },
  ): AsyncGenerator<StreamChunk> {
    await this.sanitizeOrphanToolCalls(threadId);
    yield* this.runGraphStream(threadId, { messages: [] }, signal, meta);
  }

  /**
   * 执行 graph.stream 并把 AIMessageChunk 逐个 yield 成 StreamChunk；末尾 yield
   * usage 事件。
   */
  private async *runGraphStream(
    threadId: ThreadId,
    input: { messages: BaseMessage[] },
    signal?: AbortSignal,
    meta?: { userId?: string; projectId?: string },
  ): AsyncGenerator<StreamChunk> {
    const stream = await this.graph.stream(input, {
      configurable: {
        thread_id: threadId,
        ...(meta?.userId ? { userId: meta.userId } : {}),
        ...(meta?.projectId ? { projectId: meta.projectId } : {}),
      },
      streamMode: ["messages", "updates"] as const,
      signal,
      // LangGraph 默认 recursionLimit=25，长会话 + 频繁 tool 调用容易撞墙
      // （报 GraphRecursionError）。可通过 QRITER_GRAPH_RECURSION_LIMIT 调整。
      recursionLimit: resolveRecursionLimit(),
    });
    // 每轮 LLM 单独累加：同一轮 chunk 共享 msg.id；msg.id 变化即轮次切换 → flush 上一轮。
    let currentId: string | null = null;
    let currentAcc: AIMessageChunk | undefined;
    let currentRoundStartedAt = Date.now();
    // 本轮是否已 yield reasoning_done —— 见首个非空 tool_calls 即 yield 一次。
    let reasoningDoneYielded = false;
    const flushRound = function* (this: GraphService): Generator<StreamChunk> {
      if (currentId === null || currentAcc === undefined) return;
      const content =
        typeof currentAcc.content === "string" ? currentAcc.content : "";
      const reasoning =
        typeof currentAcc.additional_kwargs?.reasoning_content === "string"
          ? currentAcc.additional_kwargs.reasoning_content
          : "";
      const toolCalls = currentAcc.tool_calls ?? [];
      if (toolCalls.length > 0) {
        yield {
          kind: "tool_calls",
          messageId: currentId,
          toolCalls,
        };
      }
      yield {
        kind: "assistant_done",
        messageId: currentId,
        content,
        reasoning,
        toolCalls: toolCalls.length > 0 ? toolCalls : null,
      };
      const extracted = extractUsage(currentAcc);
      if (extracted) {
        yield {
          kind: "usage",
          messageId: currentId,
          providerType: this.modelMeta.providerType,
          model: this.modelMeta.model,
          inputTokens: extracted.inputTokens,
          outputTokens: extracted.outputTokens,
          totalTokens: extracted.totalTokens,
          cacheReadTokens: extracted.cacheReadTokens,
          cacheCreationTokens: extracted.cacheCreationTokens,
          reasoningTokens: extracted.reasoningTokens,
          durationMs: Date.now() - currentRoundStartedAt,
        };
      } else {
        console.warn(
          `LLM provider ${this.modelMeta.providerType} (${this.modelMeta.model}) 未上报 usage, thread=${threadId} msg=${currentId}`,
        );
      }
    }.bind(this);

    for await (const part of stream) {
      // 多 mode 流：每个 yield 是 [mode, payload]
      // mode === "messages" → payload = [BaseMessage, metadata]
      // mode === "updates" → payload = { nodeName: stateUpdate }
      if (!Array.isArray(part) || part.length !== 2) {
        console.warn(
          `[graph stream] unexpected yield shape, len=${Array.isArray(part) ? part.length : "n/a"}; type=${typeof part}`,
        );
        continue; // 防御：未知 yield 形状
      }
      const [mode, payload] = part as [string, unknown];

      if (mode === "updates") {
        // supervisor 节点 return → 立即 flush 这一轮 assistant，避免等到 tools
        // 跑完 ToolMessage 进 stream 才 flush（慢 tool 几十秒空窗）。
        const updates = payload as Record<string, unknown> | null;
        if (updates && "supervisor" in updates) {
          if (currentId !== null && currentAcc !== undefined) {
            yield* flushRound();
            currentAcc = undefined;
            currentId = null;
            currentRoundStartedAt = Date.now();
            reasoningDoneYielded = false;
          }
        }
        continue;
      }

      if (mode !== "messages") continue;

      // messages 模式：payload = [BaseMessage, metadata]
      const messagePart = payload as unknown[];
      const msg = Array.isArray(messagePart) ? messagePart[0] : messagePart;
      if (!(msg instanceof AIMessageChunk)) {
        // 非 AIMessageChunk（ToolMessage 等）：上面 updates 路径已把 supervisor 出口
        // flush 过了；这里保留为 backup 兜底，防 updates 事件意外缺失。
        if (currentId !== null && currentAcc !== undefined) {
          yield* flushRound();
          currentAcc = undefined;
          currentId = null;
          currentRoundStartedAt = Date.now();
          reasoningDoneYielded = false;
        }
        continue;
      }
      const messageId = msg.id ?? randomUUID();
      // 轮次切换：flush 上一轮，重置累加。
      if (currentId !== null && currentId !== messageId) {
        yield* flushRound();
        currentAcc = undefined;
        currentRoundStartedAt = Date.now();
        reasoningDoneYielded = false;
      }
      currentId = messageId;
      // 本轮首次见到非空 tool_calls：yield reasoning_done。
      const prevToolCallsLen = currentAcc?.tool_calls?.length ?? 0;
      currentAcc = currentAcc === undefined ? msg : currentAcc.concat(msg);
      const nextToolCallsLen = currentAcc.tool_calls?.length ?? 0;
      if (
        !reasoningDoneYielded &&
        prevToolCallsLen === 0 &&
        nextToolCallsLen > 0
      ) {
        reasoningDoneYielded = true;
        yield { kind: "reasoning_done", messageId };
      }
      const reasoningDelta =
        typeof msg.additional_kwargs?.reasoning_content === "string"
          ? msg.additional_kwargs.reasoning_content
          : "";
      if (reasoningDelta) {
        yield { kind: "reasoning", messageId, delta: reasoningDelta };
      }
      const delta = typeof msg.content === "string" ? msg.content : "";
      if (!delta) continue;
      yield { kind: "chunk", messageId, delta };
    }
    // 流结束：flush 最后一轮
    yield* flushRound();
  }

  /**
   * 取会话已处理消息历史（来自 checkpointer）。
   *
   * 过滤掉无可显示文本的消息（tool_call-only 的 AIMessage、中断/失败留下的空
   * AIMessage），避免前端渲染空气泡。缺 id 的也跳过。
   */
  async getHistory(threadId: ThreadId): Promise<Message[]> {
    const snapshot = await this.graph.getState({
      configurable: { thread_id: threadId },
    });
    const values = snapshot.values as GraphState;
    if (!values?.messages) return [];
    const result: Message[] = [];
    for (const m of values.messages) {
      if (!m.id) continue;
      const content = typeof m.content === "string" ? m.content : "";
      if (!content) continue;
      const reasoning =
        typeof m.additional_kwargs?.reasoning_content === "string"
          ? m.additional_kwargs.reasoning_content
          : undefined;
      result.push({
        id: m.id,
        role: this.roleOf(m),
        content,
        ...(reasoning ? { reasoning } : {}),
      });
    }
    return result;
  }

  private roleOf(m: BaseMessage): "user" | "assistant" | "system" {
    const t = m._getType();
    if (t === "human") return "user";
    if (t === "system") return "system";
    return "assistant";
  }
}

/** 从累计 AIMessageChunk 提取规范化 token 用量。 */
interface ExtractedUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  reasoningTokens: number;
}

/**
 * 从累计 AIMessageChunk 兜底提取 token 用量。
 *
 * 取数优先级：
 * 1. `usage_metadata` —— LangChain 0.3 跨厂商标准字段
 * 2. `response_metadata.usage` —— OpenAI 兼容路径原始字段
 * 3. `response_metadata.tokenUsage` —— LangChain 旧版 camelCase 字段
 * 4. `additional_kwargs.usage` —— 个别集成包的位置
 *
 * 全部缺失返回 null。
 */
function extractUsage(msg: AIMessageChunk | undefined): ExtractedUsage | null {
  if (!msg) return null;

  // 1) LangChain 标准 usage_metadata
  const meta = msg.usage_metadata;
  if (meta && (meta.input_tokens || meta.output_tokens || meta.total_tokens)) {
    return {
      inputTokens: meta.input_tokens ?? 0,
      outputTokens: meta.output_tokens ?? 0,
      totalTokens: meta.total_tokens ?? 0,
      cacheReadTokens: meta.input_token_details?.cache_read ?? 0,
      cacheCreationTokens: meta.input_token_details?.cache_creation ?? 0,
      reasoningTokens: meta.output_token_details?.reasoning ?? 0,
    };
  }

  const rawMsg = msg as unknown as {
    response_metadata?: Record<string, unknown>;
    additional_kwargs?: Record<string, unknown>;
  };

  // 2) response_metadata.usage —— OpenAI 兼容字段（snake_case）
  const respUsage = rawMsg.response_metadata?.usage as
    | {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
        prompt_tokens_details?: { cached_tokens?: number };
        completion_tokens_details?: { reasoning_tokens?: number };
      }
    | undefined;
  if (
    respUsage &&
    (respUsage.prompt_tokens ||
      respUsage.completion_tokens ||
      respUsage.total_tokens)
  ) {
    const inputTokens = respUsage.prompt_tokens ?? 0;
    const outputTokens = respUsage.completion_tokens ?? 0;
    return {
      inputTokens,
      outputTokens,
      totalTokens: respUsage.total_tokens ?? inputTokens + outputTokens,
      cacheReadTokens: respUsage.prompt_tokens_details?.cached_tokens ?? 0,
      cacheCreationTokens: 0,
      reasoningTokens:
        respUsage.completion_tokens_details?.reasoning_tokens ?? 0,
    };
  }

  // 3) response_metadata.tokenUsage —— LangChain 旧式 camelCase
  const tokenUsage = rawMsg.response_metadata?.tokenUsage as
    | {
        promptTokens?: number;
        completionTokens?: number;
        totalTokens?: number;
      }
    | undefined;
  if (tokenUsage && (tokenUsage.promptTokens || tokenUsage.completionTokens)) {
    const inputTokens = tokenUsage.promptTokens ?? 0;
    const outputTokens = tokenUsage.completionTokens ?? 0;
    return {
      inputTokens,
      outputTokens,
      totalTokens: tokenUsage.totalTokens ?? inputTokens + outputTokens,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      reasoningTokens: 0,
    };
  }

  // 4) additional_kwargs.usage
  const altUsage = rawMsg.additional_kwargs?.usage as
    | {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      }
    | undefined;
  if (altUsage && (altUsage.prompt_tokens || altUsage.completion_tokens)) {
    const inputTokens = altUsage.prompt_tokens ?? 0;
    const outputTokens = altUsage.completion_tokens ?? 0;
    return {
      inputTokens,
      outputTokens,
      totalTokens: altUsage.total_tokens ?? inputTokens + outputTokens,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      reasoningTokens: 0,
    };
  }

  return null;
}

/**
 * 从环境变量解析 LangGraph recursion 上限。默认 100（够应付绝大多数 ReAct
 * 长链 + 多 tool 串调）。非法值（NaN / <=0）回落默认值。
 *
 * 一次 supervisor↔tools 往返算 2 个 super-step；25 默认上限只能撑 ~12 轮
 * tool 调用，长会话很容易撞 GraphRecursionError。
 */
function resolveRecursionLimit(): number {
  const raw = process.env.QRITER_GRAPH_RECURSION_LIMIT;
  if (!raw) return 100;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return 100;
  return n;
}
