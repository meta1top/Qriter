import { Transactional } from "@qriter/common";
import { AppError } from "@qriter/shared";
import type {
  Book as BookProfile,
  CreateBookInput,
  CreateChapterInput,
  UpdateBookInput,
} from "@qriter/types";
import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { Repository } from "typeorm";

import { Book } from "../entities/book.entity";
import { BookErrorCode } from "../errors/book.error-codes";
import { ChapterService } from "./chapter.service";

/**
 * 书籍 Service —— Book 实体的唯一归属者（唯一 `@InjectRepository(Book)`）。
 * 章节相关写入通过 ChapterService 发起（不直接注入 Chapter Repository），
 * 跨表写动作（建书 + 首章 / 删书 + 级联章节）走 `@Transactional()`。
 */
@Injectable()
export class BookService {
  constructor(
    @InjectRepository(Book)
    private readonly bookRepo: Repository<Book>,
    private readonly chapterService: ChapterService,
  ) {}

  /**
   * 创建书籍（仅书籍本身，无首章）。单次 insert，无需事务。status 默认 draft。
   */
  async createBook(ownerId: string, input: CreateBookInput): Promise<Book> {
    const book = this.bookRepo.create({
      ownerId,
      title: input.title,
      description: input.description ?? null,
      status: "draft",
    });
    return this.bookRepo.save(book);
  }

  /**
   * 创建书籍并附带首个章节 —— 公开 API，瘦委托到私有事务方法。
   * 跨表写入（Book + Chapter）的原子性由 `createBookWithFirstChapterInTx`
   * 上的 `@Transactional()` 保证，二者要么都成功要么都回滚。
   */
  async createBookWithFirstChapter(
    ownerId: string,
    input: CreateBookInput,
    firstChapter: CreateChapterInput,
  ): Promise<Book> {
    return this.createBookWithFirstChapterInTx(ownerId, input, firstChapter);
  }

  /**
   * 按 id 获取书籍，不存在抛 BOOK_NOT_FOUND。
   *
   * @throws {AppError} BOOK_NOT_FOUND
   */
  async getBook(id: string): Promise<Book> {
    const book = await this.bookRepo.findOne({ where: { id } });
    if (!book) throw new AppError(BookErrorCode.BOOK_NOT_FOUND);
    return book;
  }

  /**
   * 列出某账号拥有的全部书籍，按更新时间倒序。
   */
  async listBooksByOwner(ownerId: string): Promise<Book[]> {
    return this.bookRepo.find({
      where: { ownerId },
      order: { updatedAt: "DESC" },
    });
  }

  /**
   * 更新书籍的 title / description / status（全字段可选）。
   *
   * @throws {AppError} BOOK_NOT_FOUND 当书籍不存在时。
   */
  async updateBook(id: string, input: UpdateBookInput): Promise<Book> {
    const book = await this.getBook(id);
    if (input.title !== undefined) book.title = input.title;
    if (input.description !== undefined) book.description = input.description;
    if (input.status !== undefined) book.status = input.status;
    return this.bookRepo.save(book);
  }

  /**
   * 删除书籍及其全部章节 —— 公开 API，瘦委托到私有事务方法。
   * 跨表删除（Book + Chapter）的原子性由 `deleteBookInTx` 上的 `@Transactional()` 保证。
   */
  async deleteBook(id: string): Promise<void> {
    return this.deleteBookInTx(id);
  }

  /**
   * 校验书籍归属 —— ownerId 不匹配抛 BOOK_FORBIDDEN，供上层在改 / 删前调用。
   *
   * @throws {AppError} BOOK_NOT_FOUND 书籍不存在；BOOK_FORBIDDEN 非本人书籍。
   */
  async assertOwner(id: string, ownerId: string): Promise<Book> {
    const book = await this.getBook(id);
    if (book.ownerId !== ownerId) {
      throw new AppError(BookErrorCode.BOOK_FORBIDDEN);
    }
    return book;
  }

  /**
   * 投影为公开形态 —— Date 转 ISO 字符串，status 收窄为 BookStatus 字面量联合。
   */
  toProfile(book: Book): BookProfile {
    return {
      id: book.id,
      ownerId: book.ownerId,
      title: book.title,
      description: book.description,
      status: book.status as BookProfile["status"],
      createdAt: book.createdAt.toISOString(),
      updatedAt: book.updatedAt.toISOString(),
    };
  }

  /**
   * 建书 + 首章的事务内实现。先落书拿到 id，再经 ChapterService 写首章。
   * 私有 `@Transactional` 方法，命名以 `InTx` 结尾以满足 `check:naming` 围栏。
   */
  @Transactional()
  private async createBookWithFirstChapterInTx(
    ownerId: string,
    input: CreateBookInput,
    firstChapter: CreateChapterInput,
  ): Promise<Book> {
    const book = await this.bookRepo.save(
      this.bookRepo.create({
        ownerId,
        title: input.title,
        description: input.description ?? null,
        status: "draft",
      }),
    );
    await this.chapterService.createChapter(book.id, firstChapter);
    return book;
  }

  /**
   * 删书的事务内实现。先级联删章节，再删书；书籍不存在抛 BOOK_NOT_FOUND。
   * 私有 `@Transactional` 方法，命名以 `InTx` 结尾以满足 `check:naming` 围栏。
   */
  @Transactional()
  private async deleteBookInTx(id: string): Promise<void> {
    await this.getBook(id);
    await this.chapterService.deleteChaptersByBook(id);
    await this.bookRepo.delete({ id });
  }
}
