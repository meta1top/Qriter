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
 *
 * 安全假设：码以 sha256 存（不存明文），但 6 位码空间仅 1e6，sha256 不抗离线暴力 ——
 * 因此**视 redis 为机密存储**（生产应开 ACL + TLS）；真正的防护是 5min TTL + 5 次失败上限
 * + 60s 发送冷却 + IP 限流（在线攻击被这几道挡住）。若将来要抗「redis 泄露」级威胁，
 * 改用 128bit 随机 lookupToken 作键、值存 {email, codeHash}。
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
    // 先发邮件再设冷却：发送失败（SMTP 异常）时不应把用户锁进 60s 冷却
    // （否则用户既没收到码、又发不了新码）。发成功才落冷却键。
    await this.email.sendCode(email, code);
    await this.cache.set(cooldownKey, 1, COOLDOWN_MS);
  }

  /**
   * 验码 + find-or-create：校验通过返回账号实体（由 controller 签 JWT）。新邮箱自动建免密号。
   *
   * @throws {AppError} EMAIL_CODE_INVALID 码不存在 / 过期 / 不匹配；
   *   EMAIL_CODE_TOO_MANY_ATTEMPTS 失败次数超上限（码已作废）。
   */
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
