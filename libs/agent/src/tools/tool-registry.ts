import { tool as createLcTool } from "@langchain/core/tools";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { Injectable, type OnModuleInit } from "@nestjs/common";
import { DiscoveryService } from "@nestjs/core";
import { TOOL_METADATA_KEY } from "./tool.decorator";
import type { QriterTool } from "./tool.types";

/** 注册项：执行用 qriterTool，bindTools 用 lcTool。两者一一对应。 */
interface Entry {
  qriterTool: QriterTool;
  lcTool: StructuredToolInterface;
}

/**
 * 启动时扫描所有 @Tool() provider 自注册；singleton；重名 fail-fast。
 *
 * 静态 @Tool() 的 lcTool 由 QriterTool meta 现造。
 *
 * asLangChainBindable() 返回的 LC tool 实例**不会**被 LangChain 真调（我们
 * 自写 toolsNode），仅用于 model.bindTools() 把 schema 注入 LLM。真正的
 * 执行在 toolsNode 里用 registry.get(name).execute(args, ctx)。
 */
@Injectable()
export class ToolRegistry implements OnModuleInit {
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly discovery: DiscoveryService) {}

  onModuleInit(): void {
    const providers = this.discovery.getProviders();
    for (const wrapper of providers) {
      const instance = wrapper.instance;
      if (!instance || typeof instance !== "object") continue;
      const ctor = (instance as object).constructor;
      if (!ctor) continue;
      const isTool = Reflect.getMetadata(TOOL_METADATA_KEY, ctor);
      if (!isTool) continue;
      const tool = instance as QriterTool;
      this.registerInternal(tool, buildLcTool(tool));
    }
  }

  /**
   * 动态注册一个 tool（插件等运行期来源）。重名抛错。
   * @param tool QriterTool 实现（提供 execute + 元信息）
   * @param lcTool 可选：用作 bindTools 的 LC tool。不传则按 QriterTool meta 现造。
   */
  register(tool: QriterTool, lcTool?: StructuredToolInterface): void {
    this.registerInternal(tool, lcTool ?? buildLcTool(tool));
  }

  /** 反注册（用于插件断开重连 / shutdown 清理）。 */
  unregister(name: string): void {
    this.entries.delete(name);
  }

  private registerInternal(
    tool: QriterTool,
    lcTool: StructuredToolInterface,
  ): void {
    if (this.entries.has(tool.name)) {
      throw new Error(`Duplicate tool name: ${tool.name}`);
    }
    this.entries.set(tool.name, { qriterTool: tool, lcTool });
  }

  /** LC tool 数组用于 model.bindTools()。 */
  asLangChainBindable(): StructuredToolInterface[] {
    return [...this.entries.values()].map((e) => e.lcTool);
  }

  get(name: string): QriterTool | undefined {
    return this.entries.get(name)?.qriterTool;
  }

  list(): QriterTool[] {
    return [...this.entries.values()].map((e) => e.qriterTool);
  }
}

/** 用 QriterTool meta 构造一个占位 LC tool（func 不会被真调，仅供 bindTools）。 */
function buildLcTool(t: QriterTool): StructuredToolInterface {
  return createLcTool(async () => "", {
    name: t.name,
    description: t.description,
    schema: t.schema,
  });
}
