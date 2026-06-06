import { Module } from "@nestjs/common";
import { DiscoveryModule } from "@nestjs/core";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ContextCompactor } from "./compaction/context-compactor.service";
import { GraphService } from "./graph/graph.service";
import {
  createEnvModelProvider,
  createModelProvider,
  LLM_OPTIONS,
  type LlmOptions,
  MODEL_PROVIDER,
} from "./llm/model-provider";
import { SkillService } from "./skills/skill.service";
import { CharacterCreateTool } from "./tools/builtins/character-create.tool";
import { SkillListTool } from "./tools/builtins/skill-list.tool";
import { SkillLoadTool } from "./tools/builtins/skill-load.tool";
import { ToolRegistry } from "./tools/tool-registry";

/**
 * Agent Core 模块（framework-agnostic）。
 *
 * 注册：GraphService、ToolRegistry、SkillService、ContextCompactor、内建 tool
 * （SkillList / SkillLoad / CharacterCreate），以及默认 ModelProvider（读 env）。
 *
 * **不绑定**以下 token —— 由 app 层（apps/server）在 import 本模块时一并提供：
 * - `CHECKPOINTER_CONN_STRING`：Postgres 连接串（GraphService 注入）；
 * - `NOVEL_STORE_PORT`：写作域持久化适配器（CharacterCreateTool 注入）；
 * - 可选 `MODEL_PROVIDER` / `MODEL_META` / `SYSTEM_PROMPT` / `SKILLS_DIR` /
 *   `COMPACTION_CONTEXT_WINDOW` 覆盖默认实现。
 *
 * EventEmitterModule.forRoot() 在 app 层（app.module）也会调；NestJS 对同一
 * module 类的重复 forRoot 调用做去重，最终全局只有一个 EventEmitter2 实例。
 * 本处仍 import 是为了 libs/agent 的独立集成测试能解析 GraphService 依赖。
 */
@Module({
  imports: [DiscoveryModule, EventEmitterModule.forRoot()],
  providers: [
    ToolRegistry,
    SkillService,
    SkillListTool,
    SkillLoadTool,
    CharacterCreateTool,
    ContextCompactor,
    {
      // opts 可能为 undefined 的两种来源，都走 env 回退（务必保留 opts 判空，不要写成 opts!）：
      //   1. standalone（libs/agent 单测）：没人提供 LLM_OPTIONS → optional 注入得 undefined；
      //   2. app 提供了 LLM_OPTIONS，但值 = config.llm 而 config.llm 未配 → undefined。
      provide: MODEL_PROVIDER,
      inject: [{ token: LLM_OPTIONS, optional: true }],
      useFactory: (opts?: LlmOptions) =>
        opts ? createModelProvider(opts) : createEnvModelProvider(),
    },
    GraphService,
  ],
  exports: [GraphService, ToolRegistry, SkillService, ContextCompactor],
})
export class AgentModule {}
