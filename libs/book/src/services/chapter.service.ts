import { AppError } from "@qriter/shared";
import type { CreateChapterInput, UpdateChapterInput } from "@qriter/types";
import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { Repository } from "typeorm";

import { Chapter } from "../entities/chapter.entity";
import { BookErrorCode } from "../errors/book.error-codes";

/**
 * 按 content 计算字数：中文按字符、英文按空白分词，二者取和的简单估算。
 * 空内容返回 0。
 */
function countWords(content: string): number {
  const cjk = (content.match(/[一-鿿]/g) ?? []).length;
  const words = (content.replace(/[一-鿿]/g, " ").match(/\S+/g) ?? []).length;
  return cjk + words;
}

/**
 * 章节 Service —— Chapter 实体的唯一归属者（唯一 `@InjectRepository(Chapter)`）。
 * 提供章节的增删改查；修改 content 时重算 wordCount。跨书写入由 BookService 通过本类方法发起。
 */
@Injectable()
export class ChapterService {
  constructor(
    @InjectRepository(Chapter)
    private readonly chapterRepo: Repository<Chapter>,
  ) {}

  /**
   * 在指定书籍下创建章节。orderIndex 未指定时追加到该书末尾；wordCount 按 content 计算。
   * 仅单次 insert，调用方若需与建书放入同一事务，由其 `@Transactional()` 边界覆盖。
   */
  async createChapter(
    bookId: string,
    input: CreateChapterInput,
  ): Promise<Chapter> {
    const content = input.content ?? "";
    const orderIndex = input.orderIndex ?? (await this.nextOrderIndex(bookId));
    const chapter = this.chapterRepo.create({
      bookId,
      title: input.title,
      content,
      orderIndex,
      wordCount: countWords(content),
    });
    return this.chapterRepo.save(chapter);
  }

  /**
   * 按 id 获取章节，不存在抛 CHAPTER_NOT_FOUND。
   *
   * @throws {AppError} CHAPTER_NOT_FOUND
   */
  async getChapter(id: string): Promise<Chapter> {
    const chapter = await this.chapterRepo.findOne({ where: { id } });
    if (!chapter) throw new AppError(BookErrorCode.CHAPTER_NOT_FOUND);
    return chapter;
  }

  /**
   * 列出某书的全部章节，按 orderIndex 升序。
   */
  async listChaptersByBook(bookId: string): Promise<Chapter[]> {
    return this.chapterRepo.find({
      where: { bookId },
      order: { orderIndex: "ASC" },
    });
  }

  /**
   * 更新章节。改 content 时重算 wordCount。
   *
   * @throws {AppError} CHAPTER_NOT_FOUND 当章节不存在时。
   */
  async updateChapter(id: string, input: UpdateChapterInput): Promise<Chapter> {
    const chapter = await this.getChapter(id);
    if (input.title !== undefined) chapter.title = input.title;
    if (input.orderIndex !== undefined) chapter.orderIndex = input.orderIndex;
    if (input.content !== undefined) {
      chapter.content = input.content;
      chapter.wordCount = countWords(input.content);
    }
    return this.chapterRepo.save(chapter);
  }

  /**
   * 删除章节，不存在抛 CHAPTER_NOT_FOUND。
   *
   * @throws {AppError} CHAPTER_NOT_FOUND
   */
  async deleteChapter(id: string): Promise<void> {
    const result = await this.chapterRepo.delete({ id });
    if (!result.affected) throw new AppError(BookErrorCode.CHAPTER_NOT_FOUND);
  }

  /**
   * 删除某书下的全部章节 —— 供 BookService 在删书事务内级联清理使用。
   */
  async deleteChaptersByBook(bookId: string): Promise<void> {
    await this.chapterRepo.delete({ bookId });
  }

  /** 计算某书下一个可用的 orderIndex（追加到末尾）。 */
  private async nextOrderIndex(bookId: string): Promise<number> {
    const last = await this.chapterRepo.findOne({
      where: { bookId },
      order: { orderIndex: "DESC" },
    });
    return last ? last.orderIndex + 1 : 0;
  }
}
