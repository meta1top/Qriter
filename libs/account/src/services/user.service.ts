import { AppError } from "@qriter/shared";
import type {
  Account as AccountProfile,
  LoginInput,
  RegisterInput,
} from "@qriter/types";
import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import * as bcrypt from "bcrypt";
import type { Repository } from "typeorm";

import { Account } from "../entities/account.entity";
import { AccountErrorCode } from "../errors/account.error-codes";

const BCRYPT_COST = 12;

/**
 * 账号 Service —— Account 实体的唯一归属者（唯一 `@InjectRepository(Account)`）。
 * 提供注册 / 登录 / 按 id 查询 / 公开档案投影，作为 qriter 账号域业务基线。
 */
@Injectable()
export class UserService {
  constructor(
    @InjectRepository(Account)
    private readonly accountRepo: Repository<Account>,
  ) {}

  /**
   * 注册新账号。先校验邮箱是否已被占用，再用 bcrypt 哈希密码后落库。
   * 仅单次 insert，无跨表写入，故无需 `@Transactional()`。
   *
   * @throws {AppError} EMAIL_EXISTS 当邮箱已注册时。
   */
  async register(input: RegisterInput): Promise<Account> {
    const existing = await this.accountRepo.findOne({
      where: { email: input.email },
    });
    if (existing) throw new AppError(AccountErrorCode.EMAIL_EXISTS);

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
    const account = this.accountRepo.create({
      email: input.email,
      passwordHash,
      displayName: input.displayName,
    });
    return this.accountRepo.save(account);
  }

  /**
   * 校验登录凭证并返回账号。邮箱不存在或密码错误统一抛 INVALID_CREDENTIALS，
   * 避免泄露账号是否存在。谷歌-only 账号（passwordHash 为 null）同样视为凭证无效。
   *
   * @throws {AppError} INVALID_CREDENTIALS 当邮箱不存在、账号无密码或密码不匹配时。
   */
  async validateCredentials(input: LoginInput): Promise<Account> {
    const account = await this.accountRepo.findOne({
      where: { email: input.email },
    });
    if (!account || account.passwordHash == null) {
      throw new AppError(AccountErrorCode.INVALID_CREDENTIALS);
    }
    const ok = await bcrypt.compare(input.password, account.passwordHash);
    if (!ok) throw new AppError(AccountErrorCode.INVALID_CREDENTIALS);
    return account;
  }

  /**
   * 登录 —— `validateCredentials` 的语义别名，供上层 auth controller 直接调用。
   *
   * @throws {AppError} INVALID_CREDENTIALS 当凭证不匹配时。
   */
  async login(input: LoginInput): Promise<Account> {
    return this.validateCredentials(input);
  }

  /**
   * 按 id 查找账号，不存在返回 null（调用方按需决定是否抛 ACCOUNT_NOT_FOUND）。
   */
  async findById(id: string): Promise<Account | null> {
    return this.accountRepo.findOne({ where: { id } });
  }

  /**
   * 投影为公开档案 —— 剥离 passwordHash 等敏感列，仅返回前端可见的安全字段子集。
   */
  toProfile(account: Account): AccountProfile {
    return {
      id: account.id,
      email: account.email,
      displayName: account.displayName,
      createdAt: account.createdAt.toISOString(),
    };
  }
}
