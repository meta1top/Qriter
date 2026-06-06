import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

/**
 * 账号身份实体 —— 一个 Account 可绑定多个外部 provider 身份（google / 将来 github 等）。
 * 逻辑外键：account_id 为普通列 + 索引，不建库级外键。列名 snake_case 由 SnakeNamingStrategy 处理。
 */
@Entity("account_identity")
@Index(
  "uq_account_identity_provider_account",
  ["provider", "providerAccountId"],
  {
    unique: true,
  },
)
@Index("idx_account_identity_account_id", ["accountId"])
export class AccountIdentity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  /** provider 标识，如 "google"。 */
  @Column({ type: "varchar", length: 32 })
  provider!: string;

  /** provider 侧稳定用户 id（Google 的 sub）。 */
  @Column({ type: "varchar", length: 255 })
  providerAccountId!: string;

  /** 关联的 Account.id（逻辑外键）。 */
  @Column({ type: "uuid" })
  accountId!: string;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
