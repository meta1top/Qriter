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

  /** Google 邮箱未验证（email_verified=false），不允许自动关联到已有账号。 */
  GOOGLE_EMAIL_UNVERIFIED: {
    code: 1003,
    message: "account.googleEmailUnverified",
    httpStatus: 409,
  },

  /** Google 换 code / 验 id_token 失败（或 oauth.google 未配置）。 */
  GOOGLE_OAUTH_FAILED: {
    code: 1004,
    message: "account.googleOauthFailed",
    httpStatus: 401,
  },

  /** OAuth state 验签失败（过期 / 篡改 / 标记不符）。 */
  GOOGLE_STATE_INVALID: {
    code: 1005,
    message: "account.googleStateInvalid",
    httpStatus: 400,
  },

  /** 验证码发送过于频繁（60s 冷却内）。 */
  EMAIL_CODE_COOLDOWN: {
    code: 1006,
    message: "account.emailCodeCooldown",
    httpStatus: 429,
  },

  /** 验证码错误或已过期。 */
  EMAIL_CODE_INVALID: {
    code: 1007,
    message: "account.emailCodeInvalid",
    httpStatus: 401,
  },

  /** 验证码尝试次数过多（已作废，请重新获取）。 */
  EMAIL_CODE_TOO_MANY_ATTEMPTS: {
    code: 1008,
    message: "account.emailCodeTooManyAttempts",
    httpStatus: 429,
  },
});
