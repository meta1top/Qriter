import { createI18nZodDto } from "@qriter/shared";
import {
  BookSchema,
  type CreateBookInput,
  CreateBookSchema,
  type CreateChapterInput,
  CreateChapterSchema,
  type UpdateBookInput,
  UpdateBookSchema,
  type UpdateChapterInput,
  UpdateChapterSchema,
} from "@qriter/types";

/**
 * 每个 DTO 用 class + interface 声明合并暴露解析后字段：
 * - class 部分：派生自 createI18nZodDto，NestJS 反射 / Swagger 看见构造函数 + isZodDto
 * - interface 部分：把 z.infer 的字段平铺到实例类型，让 controller 内 dto.xxx 通过 TS 检查
 *
 * 不写 interface 合并的话，`class X extends createI18nZodDto(S) {}` 派生类的实例字段不会自动暴露
 * （TS 限制：基类签名 `new(): T` 难以贯穿到子类 instance type）。
 *
 * Biome 的 noUnsafeDeclarationMerging 在此场景是合理误判（确为有意合并），逐个豁免。
 */

// biome-ignore lint/suspicious/noUnsafeDeclarationMerging: intentional class+interface merge to expose zod-inferred fields
export class CreateBookDto extends createI18nZodDto(CreateBookSchema) {}
export interface CreateBookDto extends CreateBookInput {}

// biome-ignore lint/suspicious/noUnsafeDeclarationMerging: intentional class+interface merge to expose zod-inferred fields
export class UpdateBookDto extends createI18nZodDto(UpdateBookSchema) {}
export interface UpdateBookDto extends UpdateBookInput {}

// biome-ignore lint/suspicious/noUnsafeDeclarationMerging: intentional class+interface merge to expose zod-inferred fields
export class CreateChapterDto extends createI18nZodDto(CreateChapterSchema) {}
export interface CreateChapterDto extends CreateChapterInput {}

// biome-ignore lint/suspicious/noUnsafeDeclarationMerging: intentional class+interface merge to expose zod-inferred fields
export class UpdateChapterDto extends createI18nZodDto(UpdateChapterSchema) {}
export interface UpdateChapterDto extends UpdateChapterInput {}

/**
 * 书籍公开形态的响应 DTO —— 仅供 Swagger `@ApiOkResponse({ type: BookDto })` 标注，
 * 不参与请求校验。沿用 AccountDto 的裸 class 模式（无需 interface 合并暴露字段）。
 */
export class BookDto extends createI18nZodDto(BookSchema) {}
