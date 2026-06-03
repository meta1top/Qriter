/** libs/agent → apps/server 解耦的注入边界。
 *
 * apps/server 在 agent 集成模块里用 useFactory adapter 提供实现，
 * 把写作域的持久化（characters / worldview / timeline 等）从 Agent Core 解耦。
 */
export const NOVEL_STORE_PORT = Symbol("NOVEL_STORE_PORT");

/** 创建角色的入参（最小投影，够 demo tool 用）。 */
export interface CreateCharacterInput {
  /** 归属书籍 / 项目（逻辑外键）。 */
  projectId: string;
  /** 角色名。 */
  name: string;
  /** 角色定位（主角 / 配角 / 反派等，自由文本）。 */
  role: string;
  /** 性格特征标签列表。 */
  traits: string[];
  /** 角色一句话简介。 */
  summary: string;
}

/** Tool 对外可见的角色最小投影（Tool 序列化用，只做 JSON.stringify 给 LLM）。 */
export interface CharacterView {
  id: string;
  projectId: string;
  name: string;
  role: string;
  traits: string[];
  summary: string;
}

export interface NovelStorePort {
  /** 创建一个角色，返回落库后的视图（含生成的 id）。 */
  createCharacter(input: CreateCharacterInput): Promise<CharacterView>;
  /** 列出某项目下的全部角色。 */
  listCharacters(projectId: string): Promise<CharacterView[]>;
}
