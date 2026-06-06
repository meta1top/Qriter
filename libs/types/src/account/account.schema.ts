import { z } from "zod";

/**
 * 注册新账号。message 写 i18n key，由 `I18nZodValidationPipe` 翻译。
 */
export const RegisterSchema = z.object({
  email: z
    .string()
    .email({ message: "validation.invalidEmail" })
    .max(255, { message: "validation.stringTooLong" }),
  password: z
    .string()
    .min(8, { message: "validation.passwordTooShort" })
    .max(72, { message: "validation.stringTooLong" }),
  displayName: z
    .string()
    .min(1, { message: "validation.required" })
    .max(64, { message: "validation.stringTooLong" }),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;

/** 登录。密码不在 schema 层校验长度（错误密码统一抛 invalidCredentials）。 */
export const LoginSchema = z.object({
  email: z.string().email({ message: "validation.invalidEmail" }),
  password: z.string().min(1, { message: "validation.required" }),
});

export type LoginInput = z.infer<typeof LoginSchema>;

/**
 * 账号公开档案 —— 返回给前端的安全字段子集（不含 passwordHash 等敏感列）。
 */
export const AccountSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string(),
  createdAt: z.string().datetime(),
});

export type Account = z.infer<typeof AccountSchema>;

/**
 * 登录 / 注册成功响应：JWT 访问令牌 + 当前账号公开档案。
 * 前端据此写入 auth store 并落 token；后端用它生成 Swagger 响应 DTO。
 */
export const AuthResponseSchema = z.object({
  accessToken: z.string().describe("JWT 访问令牌，放 Authorization: Bearer"),
  user: AccountSchema,
});

export type AuthResponse = z.infer<typeof AuthResponseSchema>;
