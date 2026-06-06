import { Transactional } from "@qriter/common";
import { AppError } from "@qriter/shared";
import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { Repository } from "typeorm";

import { AccountIdentity } from "../entities/account-identity.entity";
import type { Account } from "../entities/account.entity";
import { AccountErrorCode } from "../errors/account.error-codes";
import { UserService } from "./user.service";

/** 由 OAuth 层归一化后的社交身份档案（provider 无关形状）。 */
export interface SocialProfile {
  provider: "google";
  /** provider 稳定用户 id（Google sub）。 */
  sub: string;
  email: string | null;
  emailVerified: boolean;
  /** 展示名（无则上游用 email/sub 兜底）。 */
  name: string;
}

/**
 * AccountIdentity 唯一归属 Service。封装外部身份的查询，
 * 以及"按身份找或建账号"的 find-or-create 编排（跨 account_identity + account 两表写）。
 */
@Injectable()
export class AccountIdentityService {
  constructor(
    @InjectRepository(AccountIdentity)
    private readonly identityRepo: Repository<AccountIdentity>,
    private readonly userService: UserService,
  ) {}

  /** 按 (provider, providerAccountId) 查身份，不存在返回 null。 */
  async findByProviderAccount(
    provider: string,
    providerAccountId: string,
  ): Promise<AccountIdentity | null> {
    return this.identityRepo.findOne({
      where: { provider, providerAccountId },
    });
  }

  /**
   * 按 Google 身份找或建账号。跨两表写 → @Transactional（事务经 ALS 传播到 UserService）。
   * - 命中既有身份 → 返回其账号；
   * - 否则按邮箱找：命中且 email_verified=true → 关联；命中但未验证 → 抛 GOOGLE_EMAIL_UNVERIFIED；
   * - 邮箱无账号 → 建无密码账号 + 落身份。
   */
  @Transactional()
  async findOrCreateByGoogle(profile: SocialProfile): Promise<Account> {
    const existing = await this.findByProviderAccount(
      profile.provider,
      profile.sub,
    );
    if (existing) {
      const account = await this.userService.findById(existing.accountId);
      if (!account) throw new AppError(AccountErrorCode.ACCOUNT_NOT_FOUND);
      return account;
    }

    if (!profile.email)
      throw new AppError(AccountErrorCode.GOOGLE_OAUTH_FAILED);

    const byEmail = await this.userService.findByEmail(profile.email);
    if (byEmail) {
      if (!profile.emailVerified) {
        throw new AppError(AccountErrorCode.GOOGLE_EMAIL_UNVERIFIED);
      }
      await this.identityRepo.save(
        this.identityRepo.create({
          accountId: byEmail.id,
          provider: profile.provider,
          providerAccountId: profile.sub,
        }),
      );
      return byEmail;
    }

    const created = await this.userService.createSocialAccount({
      email: profile.email,
      displayName: profile.name,
    });
    await this.identityRepo.save(
      this.identityRepo.create({
        accountId: created.id,
        provider: profile.provider,
        providerAccountId: profile.sub,
      }),
    );
    return created;
  }
}
