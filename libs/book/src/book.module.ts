import { TxTypeOrmModule } from "@qriter/common";
import { Module } from "@nestjs/common";

import { Book } from "./entities/book.entity";
import { Chapter } from "./entities/chapter.entity";
import { BookService } from "./services/book.service";
import { ChapterService } from "./services/chapter.service";

/**
 * 书籍域业务模块。
 *
 * 约定：
 * - Entity → Service 一对一归属（`check:repo` 围栏）：Book 归 BookService、Chapter 归 ChapterService
 * - 跨表写动作（建书 + 首章 / 删书 + 级联章节）走 `@Transactional()`，
 *   章节写入由 BookService 通过 ChapterService 的方法发起（不注 Chapter Repository）
 * - 私有事务方法命名 `*InTx`（`check:naming` 围栏）
 *
 * `TxTypeOrmModule.forFeature` 替代原生 `TypeOrmModule.forFeature`，
 * Repository 会自动感知 `@Transactional()` 上下文，使跨 Service 写入落入同一事务。
 *
 * **不在此处 `import CommonModule.forRoot()`**：CommonModule 由根 AppModule 唯一注册。
 */
@Module({
  imports: [TxTypeOrmModule.forFeature([Book, Chapter])],
  providers: [BookService, ChapterService],
  exports: [BookService, ChapterService],
})
export class BookModule {}
