import { randomUUID } from "node:crypto";
import type {
  CharacterView,
  CreateCharacterInput,
  NovelStorePort,
} from "@qriter/agent";
import { BookService } from "@qriter/book";
import { Injectable } from "@nestjs/common";

/**
 * NovelStorePort 的 server 端实现 —— 把 agent core 的「写作持久化」抽象端口
 * 接到 qriter 的书籍域（BookService）。
 *
 * agent core（libs/agent）框架无关、零数据库；它通过 `NOVEL_STORE_PORT` 注入
 * 一个存储端口。本适配器是 server 侧的具体实现，由 server 端 AgentModule 绑定。
 *
 * 地基阶段：character_create / list 暂返回内存占位视图（结构占位，保证可编译
 * 并满足 tool 的 JSON 序列化），后续接独立角色表（或 BookService）落库。
 * 保留 BookService 注入以便后续 wiring（assertOwner / projectId 校验等）。
 */
@Injectable()
export class NovelStoreAdapter implements NovelStorePort {
  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: 地基阶段保留 BookService 注入，后续角色落库 wiring 用
  constructor(private readonly books: BookService) {}

  /**
   * 创建角色。地基占位实现：生成 id 后回填入参字段返回视图，不落库。
   * 后续接角色表（或 BookService）后替换为真实持久化。
   */
  async createCharacter(input: CreateCharacterInput): Promise<CharacterView> {
    return {
      id: randomUUID(),
      projectId: input.projectId,
      name: input.name,
      role: input.role,
      traits: input.traits,
      summary: input.summary,
    };
  }

  /**
   * 列出某项目下的全部角色。地基占位实现：返回空列表。
   * 后续接角色表后替换为真实查询。
   */
  async listCharacters(_projectId: string): Promise<CharacterView[]> {
    return [];
  }
}
