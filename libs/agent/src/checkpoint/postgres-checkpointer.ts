import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

/** 注入 checkpointer Postgres 连接串的 token（app 层从 config useValue 提供）。 */
export const CHECKPOINTER_CONN_STRING = Symbol("CHECKPOINTER_CONN_STRING");

/**
 * 创建 LangGraph 的 Postgres checkpointer。
 *
 * connString 由 app config 注入（不在工厂内读 process.env，除连接串这一个入参外）。
 * 首次使用前必须调一次 `saver.setup()` 建表 —— 见返回包装的 `setup()`。
 */
export function createPostgresCheckpointer(connString: string): {
  saver: PostgresSaver;
  /** 幂等地建表 / 迁移 checkpointer 所需的表结构。仅需在进程启动时跑一次。 */
  setup(): Promise<void>;
} {
  const saver = PostgresSaver.fromConnString(connString);
  let didSetup = false;
  return {
    saver,
    async setup(): Promise<void> {
      if (didSetup) return;
      didSetup = true;
      await saver.setup();
    },
  };
}
