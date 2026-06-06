import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { ModelProvider } from "../graph/nodes/supervisor.node";
import { createChatModel } from "./llm.factory";

export type { ModelProvider } from "../graph/nodes/supervisor.node";

/** 注入 ModelProvider 的 token。 */
export const MODEL_PROVIDER = Symbol("MODEL_PROVIDER");

/** 注入 modelMeta 的 token（usage 事件标注 provider/model 用，可选）。 */
export const MODEL_META = Symbol("MODEL_META");

/**
 * 注入 LLM 选项的 token —— app 层从配置（Nacos / YAML 的 config.llm）绑定。
 * 未提供（standalone）时回退读环境变量。
 */
export const LLM_OPTIONS = Symbol("LLM_OPTIONS");

/** 当前活跃模型的 provider/model 元信息。 */
export interface ModelMeta {
  providerType: string;
  model: string;
}

/** LLM 凭证 / 选项（由 config.llm 提供，避免散落环境变量）。 */
export interface LlmOptions {
  provider?: "anthropic" | "openai";
  model?: string;
  apiKey?: string;
  baseUrl?: string;
}

/** 按 provider 给一个合理的默认模型 id。 */
function defaultModel(provider: string): string {
  return provider === "anthropic" ? "claude-3-5-sonnet-latest" : "gpt-4o-mini";
}

/** 从一组 LlmOptions 归一出 provider/model（provider 缺省 openai）。 */
export function resolveModelMeta(opts: LlmOptions): ModelMeta {
  const providerType = opts.provider ?? "openai";
  return { providerType, model: opts.model ?? defaultModel(providerType) };
}

/**
 * 从环境变量读出 LlmOptions —— 仅作 standalone / 未配 config.llm 时的回退。
 * 优先级：`QRITER_MODEL_PROVIDER` 显式 > 有 ANTHROPIC_API_KEY → anthropic > openai。
 */
export function llmOptionsFromEnv(): LlmOptions {
  const explicit = process.env.QRITER_MODEL_PROVIDER?.toLowerCase();
  const provider: "anthropic" | "openai" =
    explicit === "anthropic" || explicit === "openai"
      ? explicit
      : process.env.ANTHROPIC_API_KEY
        ? "anthropic"
        : "openai";
  return {
    provider,
    model: process.env.QRITER_MODEL,
    apiKey:
      provider === "anthropic"
        ? process.env.ANTHROPIC_API_KEY
        : process.env.OPENAI_API_KEY,
    baseUrl: process.env.QRITER_MODEL_BASE_URL,
  };
}

/** 向后兼容：从 env 解析 modelMeta（= resolveModelMeta(llmOptionsFromEnv())）。 */
export function resolveModelMetaFromEnv(): ModelMeta {
  return resolveModelMeta(llmOptionsFromEnv());
}

/**
 * 从 LlmOptions 构造 ModelProvider：lazy 构造 chat model，按 provider|model|apiKey 缓存实例。
 * 凭证缺失时在「实际取模型」那一刻才抛错（foundation 不跑模型则永不触发）。
 */
export function createModelProvider(opts: LlmOptions): ModelProvider {
  const cache = new Map<string, BaseChatModel>();
  return async (): Promise<BaseChatModel> => {
    const meta = resolveModelMeta(opts);
    if (!opts.apiKey) {
      throw new Error(
        `没有可用的模型凭证：未配置 ${meta.providerType} 的 apiKey（config.llm.apiKey）`,
      );
    }
    const key = `${meta.providerType}|${meta.model}|${opts.apiKey}`;
    const cached = cache.get(key);
    if (cached) return cached;
    const model = await createChatModel({
      providerType: meta.providerType,
      model: meta.model,
      apiKey: opts.apiKey,
      baseUrl: opts.baseUrl,
    });
    cache.set(key, model);
    return model;
  };
}

/** 默认 ModelProvider：从环境变量读 LlmOptions（未注入 LLM_OPTIONS 时的回退）。 */
export function createEnvModelProvider(): ModelProvider {
  return createModelProvider(llmOptionsFromEnv());
}
