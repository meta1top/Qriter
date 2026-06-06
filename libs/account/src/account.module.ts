import { TxTypeOrmModule } from "@qriter/common";
import { Module } from "@nestjs/common";

import { Account } from "./entities/account.entity";
import { UserService } from "./services/user.service";

/**
 * 账号域业务模块。
 *
 * 约定：
 * - Entity → Service 一对一归属（`check:repo` 围栏）：Account 由 UserService 唯一持有 Repository
 * - 跨表写动作走 `@Transactional()`；跨 Service 写动作通过被调 Service 的方法（不注 Repository）
 * - 私有事务方法命名 `*InTx` / `*InDb` / `*InTransaction` / `persist*`（`check:naming` 围栏）
 *
 * `TxTypeOrmModule.forFeature` 替代原生 `TypeOrmModule.forFeature`，
 * Repository 会自动感知 `@Transactional()` 上下文。
 *
 * **不在此处 `import CommonModule.forRoot()`**：CommonModule 必须由根 AppModule
 * 唯一注册（`global: true`），否则 `@WithLock` 装饰器可能拿到不同的 LockProvider 实例。
 */
@Module({
  imports: [TxTypeOrmModule.forFeature([Account])],
  providers: [UserService],
  exports: [UserService],
})
export class AccountModule {}
