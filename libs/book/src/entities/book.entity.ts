import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

/**
 * 书籍实体。`ownerId` 为逻辑外键（指向 Account.id），qriter 不建库级外键约束，
 * 仅加普通索引以支持按拥有者检索。列名 snake_case 由 SnakeNamingStrategy 处理。
 */
@Entity("book")
@Index("idx_book_owner_id", ["ownerId"])
export class Book {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  ownerId!: string;

  @Column({ type: "varchar", length: 200 })
  title!: string;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({ type: "varchar", length: 16, default: "draft" })
  status!: string;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
