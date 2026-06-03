import { defineErrorCode } from "@qriter/shared";

/**
 * 账号域业务错误码 —— 区段 **1000-1999**（按 `check:error-code` 围栏分配），连续无 gap。
 *
 * 抛出方式：
 * ```ts
 * import { AppError } from "@qriter/shared";
 * import { AccountErrorCode } from "@qriter/account";
 *
 * throw new AppError(AccountErrorCode.EMAIL_EXISTS);
 * ```
 *
 * i18n key 与 server 端 `i18n/{zh,en}/account.json` 同步。
 */
export const AccountErrorCode = defineErrorCode({
  /** 注册时邮箱已被占用。 */
  EMAIL_EXISTS: {
    code: 1000,
    message: "account.emailAlreadyExists",
    httpStatus: 409,
  },

  /** 登录凭证不匹配（邮箱不存在或密码错误，统一抛此码避免泄露账号存在性）。 */
  INVALID_CREDENTIALS: {
    code: 1001,
    message: "account.invalidCredentials",
    httpStatus: 401,
  },

  /** 按 id 查找账号不存在。 */
  ACCOUNT_NOT_FOUND: {
    code: 1002,
    message: "account.notFound",
    httpStatus: 404,
  },
});
