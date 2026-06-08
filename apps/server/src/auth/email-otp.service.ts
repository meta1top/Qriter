import { createHash, randomInt } from "node:crypto";

import { AccountErrorCode, UserService } from "@qriter/account";
import { CACHE_PROVIDER, type CacheProvider } from "@qriter/common";
import { AppError } from "@qriter/shared";
import { Inject, Injectable } from "@nestjs/common";

import type { Account } from "@qriter/account";
import { EMAIL_SENDER, type EmailSender } from "./email-sender";

const CODE_TTL_MS = 5 * 60_000;
const COOLDOWN_MS = 60_000;
const MAX_ATTEMPTS = 5;

interface OtpRecord {
  codeHash: string;
  attempts: number;
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/**
 * 邮箱验证码登录编排（无 DB 直连）：OTP 存 redis（CACHE_PROVIDER）、发码经 EmailSender、
 * 验码后 find-or-create 账号（复用 UserService 公开方法，不注入 Repository、不写 account_identity）。
 */
@Injectable()
export class EmailOtpService {
  constructor(
    @Inject(CACHE_PROVIDER) private readonly cache: CacheProvider,
    @Inject(EMAIL_SENDER) private readonly email: EmailSender,
    private readonly users: UserService,
  ) {}

  /** 发码：冷却校验 → 生成 6 位码 → 存 redis（hash）→ 发邮件（或日志）。 */
  async sendCode(rawEmail: string): Promise<void> {
    const email = rawEmail.trim().toLowerCase();
    const cooldownKey = `otp:cooldown:${email}`;
    if (await this.cache.get(cooldownKey)) {
      throw new AppError(AccountErrorCode.EMAIL_CODE_COOLDOWN);
    }
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    await this.cache.set<OtpRecord>(
      `otp:login:${email}`,
      { codeHash: sha256(code), attempts: 0 },
      CODE_TTL_MS,
    );
    await this.cache.set(cooldownKey, 1, COOLDOWN_MS);
    await this.email.sendCode(email, code);
  }

  /** 验码 + find-or-create：返回账号实体（由 controller 签 JWT）。 */
  async verifyAndFindOrCreate(
    rawEmail: string,
    code: string,
  ): Promise<Account> {
    const email = rawEmail.trim().toLowerCase();
    const key = `otp:login:${email}`;
    const rec = await this.cache.get<OtpRecord>(key);
    if (!rec) throw new AppError(AccountErrorCode.EMAIL_CODE_INVALID);
    if (rec.attempts >= MAX_ATTEMPTS) {
      await this.cache.del(key);
      throw new AppError(AccountErrorCode.EMAIL_CODE_TOO_MANY_ATTEMPTS);
    }
    if (sha256(code) !== rec.codeHash) {
      await this.cache.set<OtpRecord>(
        key,
        { codeHash: rec.codeHash, attempts: rec.attempts + 1 },
        CODE_TTL_MS,
      );
      throw new AppError(AccountErrorCode.EMAIL_CODE_INVALID);
    }
    await this.cache.del(key);
    const existing = await this.users.findByEmail(email);
    if (existing) return existing;
    return this.users.createSocialAccount({
      email,
      displayName: email.split("@")[0],
    });
  }
}
