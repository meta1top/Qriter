import {
  BookDto,
  BookService,
  CreateBookDto,
  UpdateBookDto,
} from "@qriter/book";
import type { Book as BookProfile } from "@qriter/types";
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";

import {
  CurrentUser,
  type CurrentUserPayload,
} from "../auth/current-user.decorator";

/**
 * 书籍域 REST endpoint —— 全部受全局 JwtAuthGuard 保护（需登录）。
 * Controller 只接 DTO + 取当前用户 + 委托 BookService，不持有 Repository。
 * 写动作（改 / 删）先 `assertOwner` 校验归属，非本人书抛 BOOK_FORBIDDEN(403)。
 */
@ApiTags("books")
@Controller("books")
export class BookController {
  constructor(private readonly books: BookService) {}

  @ApiOperation({ summary: "列出当前账号的全部书籍（按更新时间倒序）" })
  @ApiOkResponse({ description: "我的书籍列表", type: [BookDto] })
  @Get()
  async list(@CurrentUser() user: CurrentUserPayload): Promise<BookProfile[]> {
    const books = await this.books.listBooksByOwner(user.userId);
    return books.map((book) => this.books.toProfile(book));
  }

  @ApiOperation({ summary: "新建书籍（仅书本身，0 章；首章在工作台创建）" })
  @ApiCreatedResponse({ description: "新建的书籍", type: BookDto })
  @Post()
  async create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateBookDto,
  ): Promise<BookProfile> {
    const book = await this.books.createBook(user.userId, dto);
    return this.books.toProfile(book);
  }

  @ApiOperation({ summary: "更新书籍 title / description / status" })
  @ApiOkResponse({ description: "更新后的书籍", type: BookDto })
  @Patch(":id")
  async update(
    @CurrentUser() user: CurrentUserPayload,
    @Param("id") id: string,
    @Body() dto: UpdateBookDto,
  ): Promise<BookProfile> {
    await this.books.assertOwner(id, user.userId);
    const book = await this.books.updateBook(id, dto);
    return this.books.toProfile(book);
  }

  @ApiOperation({ summary: "删除书籍及其全部章节" })
  @ApiOkResponse({ description: "删除成功" })
  @Delete(":id")
  async remove(
    @CurrentUser() user: CurrentUserPayload,
    @Param("id") id: string,
  ): Promise<{ ok: true }> {
    await this.books.assertOwner(id, user.userId);
    await this.books.deleteBook(id);
    return { ok: true };
  }
}
