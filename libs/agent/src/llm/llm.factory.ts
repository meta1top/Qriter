import { ChatAnthropic } from "@langchain/anthropic";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatOpenAI } from "@langchain/openai";

/** 构造 chat model 的凭证。 */
export interface ChatModelConfig {
  /** "anthropic" | "openai"（openai 兼容代理也走 openai + baseUrl）。 */
  providerType: string;
  /** 模型 id。 */
  model: string;
  /** API key。 */
  apiKey: string;
  /** 可选自定义 baseUrl（openai 兼容代理用）。 */
  baseUrl?: string;
}

/** createChatModel 的可选项。 */
export interface CreateChatModelOptions {
  /** 覆盖 streaming，title / one-shot 场景设 false 跳过 stream 开销。 */
  streaming?: boolean;
}

/**
 * 按模型凭证构造一个支持流式的 LangChain chat model。
 *
 * 仅保留 anthropic + openai 两个 provider（其余 deepseek/google/ollama 已裁剪）。
 * `streaming: true` 让 `.stream()` 走 token 级增量输出。
 */
export async function createChatModel(
  config: ChatModelConfig,
  options?: CreateChatModelOptions,
): Promise<BaseChatModel> {
  const streaming = options?.streaming ?? true;
  if (config.providerType === "anthropic") {
    return new ChatAnthropic({
      model: config.model,
      apiKey: config.apiKey,
      streaming,
      ...(config.baseUrl ? { clientOptions: { baseURL: config.baseUrl } } : {}),
    });
  }
  // openai 与 openai 兼容代理（通过 configuration.baseURL 路由）。
  return new ChatOpenAI({
    model: config.model,
    apiKey: config.apiKey,
    streaming,
    ...(config.baseUrl ? { configuration: { baseURL: config.baseUrl } } : {}),
  });
}
