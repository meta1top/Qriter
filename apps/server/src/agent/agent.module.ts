import {
  AgentModule as AgentCoreModule,
  CHECKPOINTER_CONN_STRING,
  GraphService,
  LLM_OPTIONS,
  NOVEL_STORE_PORT,
} from "@qriter/agent";
import { BookModule } from "@qriter/book";
import { Global, Module, type OnApplicationBootstrap } from "@nestjs/common";
import { type AppConfig, APP_CONFIG } from "../config/app-config.schema";

import { AuthModule } from "../auth/auth.module";
import { SessionGateway } from "../ws/session.gateway";
import { AgentController } from "./agent.controller";
import { AgentRunnerService } from "./agent.runner.service";
import { NovelStoreAdapter } from "./novel-store.adapter";

/**
 * server 端 Agent 模块 —— 把 agent core（libs/agent）接到 qriter 后端。
 *
 * - 引入 AgentCoreModule（GraphService 等图编排能力）+ BookModule（书籍域）。
 * - 绑定 agent core 留给 app 层的注入 token：
 *   - `CHECKPOINTER_CONN_STRING`：LangGraph PostgresSaver 连接串（由 config.database 拼出）；
 *   - `NOVEL_STORE_PORT`：写作域持久化适配器（NovelStoreAdapter）。
 * - AgentRunnerService：编排 run + EventEmitter2 广播。
 * - SessionGateway：WS 流式转发（依赖 AuthModule 的 JwtService）。
 *
 * `onApplicationBootstrap`：进程启动时调一次 `GraphService.setup()`，幂等建表
 * LangGraph checkpointer 所需的 Postgres 表结构（这些表不走 TypeORM 迁移，
 * 由 PostgresSaver.setup() 自建）。
 *
 * `@Global()` + `exports`：`CHECKPOINTER_CONN_STRING` / `NOVEL_STORE_PORT` 的消费者
 * （GraphService / CharacterCreateTool）都声明在 AgentCoreModule 内 —— 父模块
 * import 子模块时，子模块的 provider 看不到父模块的本地 provider。把这两个 token
 * **导出**并将模块标为全局，才能让 AgentCoreModule 内部解析到它们
 * （`@Global()` 只全局化「已导出」的 provider，必须配合 exports）。
 */
@Global()
@Module({
  imports: [AgentCoreModule, BookModule, AuthModule],
  controllers: [AgentController],
  providers: [
    {
      // LangGraph PostgresSaver 连接串 —— 由 config.database 拼出（与 TypeORM 同库）。
      provide: CHECKPOINTER_CONN_STRING,
      inject: [APP_CONFIG],
      useFactory: ({ database: d }: AppConfig): string =>
        `postgresql://${encodeURIComponent(d.username)}:${encodeURIComponent(
          d.password,
        )}@${d.host}:${d.port}/${d.database}`,
    },
    { provide: NOVEL_STORE_PORT, useClass: NovelStoreAdapter },
    {
      // LLM 选项从 config.llm 绑定（来自 Nacos / YAML）；未配则 undefined → agent 回退 env。
      provide: LLM_OPTIONS,
      inject: [APP_CONFIG],
      useFactory: (cfg: AppConfig) => cfg.llm,
    },
    AgentRunnerService,
    SessionGateway,
  ],
  exports: [CHECKPOINTER_CONN_STRING, NOVEL_STORE_PORT, LLM_OPTIONS],
})
export class AgentModule implements OnApplicationBootstrap {
  constructor(private readonly graph: GraphService) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.graph.setup();
  }
}
