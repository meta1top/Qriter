import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { ModelProvider } from "../graph/nodes/supervisor.node";
import { createChatModel } from "./llm.factory";

export type { ModelProvider } from "../graph/nodes/supervisor.node";

/** 注入 ModelProvider 的 token（app 层可 useFactory 覆盖默认 env 实现）。 */
export const MODEL_PROVIDER = Symbol("MODEL_PROVIDER");

/** 注入 modelMeta 的 token（usage 事件标注 provider/model 用，可选）。 */
export const MODEL_META = Symbol("MODEL_META");

/** 当前活跃模型的 provider/model 元信息。 */
export interface ModelMeta {
  providerType: string;
  model: string;
}

/**
 * 从环境变量解析当前模型凭证。
 *
 * 选择优先级：
 * - `QRITER_MODEL_PROVIDER` 显式指定（"anthropic" / "openai"）；
 * - 否则按可用 key 推断：有 ANTHROPIC_API_KEY → anthropic，否则 openai。
 *
 * 模型 id 取 `QRITER_MODEL`，缺省按 provider 给一个合理默认。
 */
export function resolveModelMetaFromEnv(): ModelMeta {
  const explicit = process.env.QRITER_MODEL_PROVIDER?.toLowerCase();
  const providerType =
    explicit === "anthropic" || explicit === "openai"
      ? explicit
      : process.env.ANTHROPIC_API_KEY
        ? "anthropic"
        : "openai";
  const model =
    process.env.QRITER_MODEL ??
    (providerType === "anthropic" ? "claude-3-5-sonnet-latest" : "gpt-4o-mini");
  return { providerType, model };
}

/**
 * 默认 ModelProvider：每次 run 重新读 env 构造 chat model（lazy + 凭证热更新友好）。
 *
 * 内部带缓存：key 由 provider|model|apiKey 拼成，env 不变直接复用实例，
 * 避免每次 runOnce 都重建 client。
 */
export function createEnvModelProvider(): ModelProvider {
  const cache = new Map<string, BaseChatModel>();
  return async (): Promise<BaseChatModel> => {
    const meta = resolveModelMetaFromEnv();
    const apiKey =
      meta.providerType === "anthropic"
        ? process.env.ANTHROPIC_API_KEY
        : process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        `没有可用的模型凭证：缺少 ${meta.providerType === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY"}`,
      );
    }
    const key = `${meta.providerType}|${meta.model}|${apiKey}`;
    const cached = cache.get(key);
    if (cached) return cached;
    const model = await createChatModel({
      providerType: meta.providerType,
      model: meta.model,
      apiKey,
      baseUrl: process.env.QRITER_MODEL_BASE_URL,
    });
    cache.set(key, model);
    return model;
  };
}
