import { Module } from "@nestjs/common";
import { DiscoveryModule } from "@nestjs/core";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ContextCompactor } from "./compaction/context-compactor.service";
import { GraphService } from "./graph/graph.service";
import { createEnvModelProvider, MODEL_PROVIDER } from "./llm/model-provider";
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
      provide: MODEL_PROVIDER,
      useFactory: () => createEnvModelProvider(),
    },
    GraphService,
  ],
  exports: [GraphService, ToolRegistry, SkillService, ContextCompactor],
})
export class AgentModule {}
