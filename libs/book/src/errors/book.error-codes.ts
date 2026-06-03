import { defineErrorCode } from "@qriter/shared";

/**
 * 书籍域业务错误码 —— 区段 **2000-2999**（按 `check:error-code` 围栏分配），连续无 gap。
 *
 * 抛出方式：
 * ```ts
 * import { AppError } from "@qriter/shared";
 * import { BookErrorCode } from "@qriter/book";
 *
 * throw new AppError(BookErrorCode.BOOK_NOT_FOUND);
 * ```
 *
 * i18n key 与 server 端 `i18n/{zh,en}/book.json` 同步。
 */
export const BookErrorCode = defineErrorCode({
  /** 按 id 查找书籍不存在。 */
  BOOK_NOT_FOUND: {
    code: 2000,
    message: "book.notFound",
    httpStatus: 404,
  },

  /** 按 id 查找章节不存在。 */
  CHAPTER_NOT_FOUND: {
    code: 2001,
    message: "book.chapterNotFound",
    httpStatus: 404,
  },

  /** 当前账号无权访问 / 修改该书籍（ownerId 不匹配）。 */
  BOOK_FORBIDDEN: {
    code: 2002,
    message: "book.forbidden",
    httpStatus: 403,
  },
});
