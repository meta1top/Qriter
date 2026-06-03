import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

/**
 * 章节实体。`bookId` 为逻辑外键（指向 Book.id），无库级外键约束，仅加索引支持按书检索。
 * `orderIndex` 用于章节排序；`wordCount` 由服务端按 content 计算。列名 snake_case。
 */
@Entity("chapter")
@Index("idx_chapter_book_id", ["bookId"])
export class Chapter {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  bookId!: string;

  @Column({ type: "varchar", length: 200 })
  title!: string;

  @Column({ type: "text", default: "" })
  content!: string;

  @Column({ type: "int" })
  orderIndex!: number;

  @Column({ type: "int", default: 0 })
  wordCount!: number;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
