import { Inject } from "@nestjs/common";
import { z } from "zod";
import {
  NOVEL_STORE_PORT,
  type NovelStorePort,
} from "../ports/novel-store.port";
import { Tool } from "../tool.decorator";
import type { QriterTool, ToolContext } from "../tool.types";

const ArgsSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(80)
    .describe("Character name. Keep it consistent with the novel's setting."),
  role: z
    .string()
    .min(1)
    .max(120)
    .describe(
      "The character's narrative role, e.g. 'protagonist', 'antagonist', " +
        "'mentor', 'love interest'. Free text.",
    ),
  traits: z
    .array(z.string().min(1))
    .default([])
    .describe(
      "Short personality / appearance trait tags, e.g. ['stubborn', 'cynical', " +
        "'scar over left eye']. One concept per item.",
    ),
  summary: z
    .string()
    .min(1)
    .max(2000)
    .describe(
      "A one-paragraph summary of who this character is, their motivation and " +
        "their arc seed. This grounds later chapter drafting.",
    ),
});
type Args = z.input<typeof ArgsSchema>;

/**
 * character_create —— 在当前项目（书籍）下创建一个角色档案。
 *
 * projectId 来自 ToolContext（由 run 透传，不让 LLM 填），保证写入归属正确。
 * 实际持久化经 NOVEL_STORE_PORT 解耦，app 层用 useFactory adapter 绑定。
 */
@Tool()
export class CharacterCreateTool implements QriterTool<Args, string> {
  readonly name = "character_create";
  readonly description =
    "Create a character profile in the CURRENT writing project. " +
    "Provide name, narrative role, trait tags and a one-paragraph summary. " +
    "The project is taken from the current session context (do NOT ask the " +
    "user for a project id). Returns the created character id and a confirmation.";
  readonly schema = ArgsSchema;

  constructor(
    @Inject(NOVEL_STORE_PORT)
    private readonly store: NovelStorePort,
  ) {}

  /** 创建角色并返回落库后的 id 与确认信息。 */
  async execute(args: Args, ctx: ToolContext): Promise<string> {
    if (!ctx.projectId) {
      return "Error: no project bound to this session; cannot create a character.";
    }
    const parsed = ArgsSchema.parse(args);
    const created = await this.store.createCharacter({
      projectId: ctx.projectId,
      name: parsed.name,
      role: parsed.role,
      traits: parsed.traits,
      summary: parsed.summary,
    });
    return `Created character "${created.name}" (id=${created.id}, role=${created.role}) in project ${created.projectId}.`;
  }
}
