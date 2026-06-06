import { ChatAnthropic } from "@langchain/anthropic";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatDeepSeek } from "@langchain/deepseek";
import { ChatOpenAI } from "@langchain/openai";

/** 构造 chat model 的凭证。 */
export interface ChatModelConfig {
  /** "anthropic" | "openai" | "deepseek"（deepseek 走原生 ChatDeepSeek；其它 openai 兼容端点用 openai + baseUrl）。 */
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
 * provider：anthropic（ChatAnthropic）/ deepseek（ChatDeepSeek，@langchain/deepseek 原生）/
 * openai（ChatOpenAI，含 openai 兼容端点 + baseUrl）。google/ollama 已裁剪。
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
  if (config.providerType === "deepseek") {
    // 用 LangChain 原生 deepseek（@langchain/deepseek 的 ChatDeepSeek，
    // 继承 ChatOpenAI；不走「openai 兼容」hack）。
    return new ChatDeepSeek({
      model: config.model,
      apiKey: config.apiKey,
      streaming,
      ...(config.baseUrl ? { configuration: { baseURL: config.baseUrl } } : {}),
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
