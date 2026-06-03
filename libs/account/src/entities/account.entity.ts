import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

/**
 * 账号实体 —— qriter 写作平台的账号体系。列名 snake_case 由 SnakeNamingStrategy 处理。
 * 不建库级外键约束；关联关系（如 Book.ownerId）一律用逻辑外键 + 普通列 + 索引表达。
 */
@Entity("account")
@Index("idx_account_email", ["email"], { unique: true })
export class Account {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 255 })
  email!: string;

  @Column({ type: "varchar", length: 255 })
  passwordHash!: string;

  @Column({ type: "varchar", length: 64 })
  displayName!: string;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
