import { z } from "zod";

/**
 * 路径参数 `:id` 的通用 schema —— 所有按 UUID 主键定位资源的端点共用。
 * qriter 主键策略统一为 UUID（`@PrimaryGeneratedColumn("uuid")`）。
 */
export const IdParamSchema = z.object({
  id: z.string().uuid({ message: "validation.invalidUuid" }),
});

export type IdParam = z.infer<typeof IdParamSchema>;

/**
 * 通用「操作成功」结果 —— 无返回体的写操作（删除 / 归档等）共用。
 * `ok` 恒为 true；失败走错误通道（`ErrorsFilter`），不进 envelope.data。
 */
export const OkResultSchema = z.object({
  ok: z.literal(true),
});

export type OkResult = z.infer<typeof OkResultSchema>;

/**
 * 通用「删除成功」结果 —— DELETE 端点共用，`deleted` 恒为 true。
 */
export const DeletedResultSchema = z.object({
  deleted: z.literal(true),
});

export type DeletedResult = z.infer<typeof DeletedResultSchema>;
