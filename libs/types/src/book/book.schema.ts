import { z } from "zod";

/** 书籍状态：draft = 草稿；writing = 写作中；done = 已完成。 */
export const BookStatus = z.enum(["draft", "writing", "done"]);
export type BookStatus = z.infer<typeof BookStatus>;

/**
 * 书籍实体的公开形态 —— controller / service 返回类型与前端共用。
 * `ownerId` 为逻辑外键（指向 Account.id），qriter 不建库级外键约束。
 */
export const BookSchema = z.object({
  id: z.string().uuid(),
  ownerId: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  status: BookStatus,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Book = z.infer<typeof BookSchema>;

/**
 * 创建书籍入参。message 写 i18n key，由 `I18nZodValidationPipe` 翻译。
 */
export const CreateBookSchema = z.object({
  title: z
    .string()
    .min(1, { message: "validation.required" })
    .max(200, { message: "validation.stringTooLong" }),
  description: z
    .string()
    .max(2000, { message: "validation.stringTooLong" })
    .optional(),
});

export type CreateBookInput = z.infer<typeof CreateBookSchema>;

/**
 * 更新书籍入参 —— 全字段可选（partial），可单独改 title / description / status。
 */
export const UpdateBookSchema = z.object({
  title: z
    .string()
    .min(1, { message: "validation.required" })
    .max(200, { message: "validation.stringTooLong" })
    .optional(),
  description: z
    .string()
    .max(2000, { message: "validation.stringTooLong" })
    .optional(),
  status: BookStatus.optional(),
});

export type UpdateBookInput = z.infer<typeof UpdateBookSchema>;

/**
 * 章节实体的公开形态。`bookId` 为逻辑外键（指向 Book.id），无库级外键约束。
 * `orderIndex` 用于章节排序；`wordCount` 由服务端按 content 计算。
 */
export const ChapterSchema = z.object({
  id: z.string().uuid(),
  bookId: z.string().uuid(),
  title: z.string(),
  content: z.string(),
  orderIndex: z.number().int(),
  wordCount: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Chapter = z.infer<typeof ChapterSchema>;

/**
 * 创建章节入参。content 默认可空（新建空章节）；orderIndex 由服务端追加到末尾。
 */
export const CreateChapterSchema = z.object({
  title: z
    .string()
    .min(1, { message: "validation.required" })
    .max(200, { message: "validation.stringTooLong" }),
  content: z.string().optional(),
  orderIndex: z.number().int().min(0).optional(),
});

export type CreateChapterInput = z.infer<typeof CreateChapterSchema>;

/**
 * 更新章节入参 —— 全字段可选（partial）。改 content 时服务端重算 wordCount。
 */
export const UpdateChapterSchema = z.object({
  title: z
    .string()
    .min(1, { message: "validation.required" })
    .max(200, { message: "validation.stringTooLong" })
    .optional(),
  content: z.string().optional(),
  orderIndex: z.number().int().min(0).optional(),
});

export type UpdateChapterInput = z.infer<typeof UpdateChapterSchema>;
