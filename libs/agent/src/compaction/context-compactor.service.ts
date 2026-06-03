import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { GraphService } from "../graph/graph.service";
import { COMPACTION_SYSTEM_PROMPT } from "../prompt/compactor.prompt";
import {
  expandToToolBoundary,
  findSplitIndex,
  serializeForSummary,
} from "./context-compactor.utils";

/** 注入压缩用上下文窗口大小（token 数）的可选 token。 */
export const COMPACTION_CONTEXT_WINDOW = Symbol("COMPACTION_CONTEXT_WINDOW");

/** 压缩相关 WS 事件名（与前端约定，避免裸字符串散落）。 */
export const COMPACTION_WS_EVENTS = {
  start: "run.compaction_start",
  done: "run.compaction_done",
  error: "run.compaction_error",
} as const;

// === 配置常量（v1 hardcoded；后续可挪到配置） ===
const COMPACTION_TRIGGER_RATIO = 0.9;
const COMPACTION_RECENT_RATIO = 0.1;
const COMPACTION_SUMMARY_MAX_TOKENS = 1500;
const COMPACTION_SUMMARIZE_TIMEOUT_MS = 60_000;
/** 未注入 contextWindow 时的兜底值（保守的 128k 窗口）。 */
const DEFAULT_CONTEXT_WINDOW = 128_000;

/** 触发场景标签，影响 WS 事件的 reason 字段。 */
export type CompactionReason = "threshold" | "ctx-exceeded";

export interface CompactOptions {
  /** force=true 时，即便没东西可压也抛 CompactionNothingToCompact（兜底场景）。 */
  force?: boolean;
  /** 触发原因，默认 "threshold"。 */
  reason?: CompactionReason;
}

export interface CompactionResult {
  removedCount: number;
  summary: string;
}

/** 压缩流程统一错误类（getState / summarize / updateState 失败均包装成此）。 */
export class CompactionError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "CompactionError";
  }
}

/** force 模式下没东西可压时抛此错。Runner 据此判定"压缩兜底彻底没救"。 */
export class CompactionNothingToCompact extends Error {
  constructor() {
    super("Nothing to compact (force=true)");
    this.name = "CompactionNothingToCompact";
  }
}

/**
 * 会话上下文压缩器（per-sessionId 锁 + 同步等待）。
 *
 * - `compact(sessionId)` 是入口：进锁 → 取 messages → 算切分 → summarize →
 *   applyCompaction → emit done。
 * - 失败时 emit error 抛 CompactionError；调用方（runner）决定是否兜底。
 * - 并发同 sessionId 第二次调用直接 await 第一次的 Promise。
 */
@Injectable()
export class ContextCompactor {
  private readonly logger = new Logger(ContextCompactor.name);
  private readonly locks = new Map<string, Promise<CompactionResult | null>>();
  private readonly contextWindow: number;

  constructor(
    private readonly graph: GraphService,
    private readonly emitter: EventEmitter2,
    @Optional()
    @Inject(COMPACTION_CONTEXT_WINDOW)
    contextWindow?: number,
  ) {
    this.contextWindow =
      contextWindow && contextWindow > 0
        ? contextWindow
        : DEFAULT_CONTEXT_WINDOW;
  }

  /** 给 runner pre-check 用：返 true 表示当前 lastInputTokens 已触阈值。 */
  shouldCompact(lastInputTokens: number, contextWindow?: number): boolean {
    const ctx = contextWindow ?? this.contextWindow;
    if (!ctx || ctx <= 0) return false;
    return lastInputTokens / ctx >= COMPACTION_TRIGGER_RATIO;
  }

  /** 入口：同步等待压缩完成。同 sessionId 并发会被锁串行化。 */
  async compact(
    sessionId: string,
    opts: CompactOptions = {},
  ): Promise<CompactionResult | null> {
    const existing = this.locks.get(sessionId);
    if (existing) return existing;
    const p = this.doCompact(sessionId, opts).finally(() =>
      this.locks.delete(sessionId),
    );
    this.locks.set(sessionId, p);
    return p;
  }

  private async doCompact(
    sessionId: string,
    opts: CompactOptions,
  ): Promise<CompactionResult | null> {
    const reason: CompactionReason = opts.reason ?? "threshold";
    const ctx = this.contextWindow;
    const messages = await this.graph.getMessagesSnapshot(sessionId);

    // 切分
    const keepBudget = Math.floor(ctx * COMPACTION_RECENT_RATIO);
    let splitIdx = findSplitIndex(messages, keepBudget);
    splitIdx = expandToToolBoundary(messages, splitIdx);
    if (splitIdx === 0) {
      if (opts.force) throw new CompactionNothingToCompact();
      return null;
    }
    // 保留区不足 2 条 → 强制把 splitIdx 往前挪（让 keep 区至少留 2 条）。
    if (messages.length - splitIdx < 2) {
      splitIdx = Math.max(0, messages.length - 2);
    }
    // 二次确认 splitIdx：若上面的调整把它压回 0，说明 messages 总条数
    // 太少，没东西可压。
    if (splitIdx === 0) {
      if (opts.force) throw new CompactionNothingToCompact();
      return null;
    }
    const toSummarize = messages.slice(0, splitIdx);
    const keep = messages.slice(splitIdx);

    // 发 start 事件
    this.emitter.emit(COMPACTION_WS_EVENTS.start, {
      sessionId,
      reason,
    });

    let summaryText: string;
    try {
      const serialized = serializeForSummary(toSummarize);
      summaryText = await this.graph.summarize(serialized, {
        systemPrompt: COMPACTION_SYSTEM_PROMPT,
        timeoutMs: COMPACTION_SUMMARIZE_TIMEOUT_MS,
        maxTokens: COMPACTION_SUMMARY_MAX_TOKENS,
      });
    } catch (err) {
      this.emitter.emit(COMPACTION_WS_EVENTS.error, {
        sessionId,
        error: err instanceof Error ? err.message : String(err),
      });
      throw new CompactionError("Summarize LLM call failed", err);
    }

    // 改写 checkpointer。removeIds 传「所有带 id 的消息」（摘要区 + 保留区）：
    // 摘要区删掉换摘要；保留区删掉后由 applyCompaction 按序重新 append 到摘要之后，
    // 实现 [system, summary, ...keep] 的目标顺序。系统提示词无 id，不在此列、自动留最前。
    try {
      await this.graph.applyCompaction(sessionId, {
        removeIds: messages
          .map((m) => m.id)
          .filter((id): id is string => typeof id === "string"),
        summaryText,
        keep,
      });
    } catch (err) {
      this.emitter.emit(COMPACTION_WS_EVENTS.error, {
        sessionId,
        error: err instanceof Error ? err.message : String(err),
      });
      throw new CompactionError("applyCompaction failed", err);
    }

    // done
    this.emitter.emit(COMPACTION_WS_EVENTS.done, {
      sessionId,
      removedCount: toSummarize.length,
      summaryPreview: summaryText.slice(0, 200),
    });

    this.logger.log(
      `compaction done session=${sessionId} removed=${toSummarize.length} reason=${reason}`,
    );
    return { removedCount: toSummarize.length, summary: summaryText };
  }
}
