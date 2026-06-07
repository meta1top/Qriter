# 贡献指南

## 环境要求

- Node.js `>= 22`（与 CI 对齐；`package.json` 的 `engines` 强制）
- pnpm `>= 10`（仓库内置 `packageManager` 字段）
- Docker（跑 e2e 测试 / 本地 Postgres 依赖）

## 起步

```bash
pnpm install --frozen-lockfile
pnpm dev:db:up                # 起本地 Postgres + Redis（docker-compose）
pnpm migration run            # 跑数据库迁移
pnpm dev                      # 启动 server + web（turbo dev）
```

> 本地开发**不需要环境变量**：配置默认读 `apps/server/conf/application.yml`（个人覆盖写 `application.local.yml`）。部署走 Nacos，只配 `NACOS_*`（见 `apps/server/.env.example` 与 `infra/prod/README.md`）。

按需启动单个 app：

```bash
pnpm dev:server               # :3000，Postgres，NestJS 后端
pnpm dev:web                  # :3001，Next.js 前端
```

## 提交 PR 前本地检查

仓库已配置 husky pre-commit 自动跑：Biome（lint-staged） + 6 围栏（`check:parallel`） + `sync:locales --check`。

如果想手工完整复刻 CI（包括 strict 围栏 + 全量测试）：

```bash
pnpm install --frozen-lockfile
pnpm dev:db:up
pnpm lint
pnpm typecheck
pnpm check:strict             # 严格模式（CI 用）；本地 pnpm check 走 baseline 增量
pnpm sync:locales -- --check
pnpm test
pnpm build
```

## 静态围栏（6 个）

仓库通过 6 个静态围栏维护代码规约：

| 围栏 | 命令 | 检查内容 |
|---|---|---|
| `check:tx` | `pnpm check:tx` | `@Transactional()` 使用合法性 / 冗余（写动作 ≤ 1） / 绕过 TxTypeOrmModule |
| `check:naming` | `pnpm check:naming` | 私有 `@Transactional()` 方法命名约定（`*InTx` / `*InDb` / `persist*`） |
| `check:lock-tx` | `pnpm check:lock-tx` | 事务-锁倒置漏洞（`@WithLock` 不能在 `@Transactional` 内） |
| `check:repo` | `pnpm check:repo` | Entity 唯一归属 Service / 非 Service 注入 Repository / 跨 lib 注入 |
| `check:dead` | `pnpm check:dead` | 没人引用的 named export |
| `check:error-code` | `pnpm check:error-code` | 错误码重复 / 越界 / 断号（区段：shared 0-999 / account 1000-1999 / book 2000-2999 / agent 3000-3999） |

详见 [`.claude/CLAUDE.md`](.claude/CLAUDE.md) 「关键约定」节。

## i18n 维护

- 后端 i18n 资源在 `apps/server/i18n/{zh,en}/<namespace>.json`
- 前端 i18n 资源在 `apps/web/messages/{zh,en}.json`
- 提交时 husky 自动 `pnpm sync:locales -- --check`（硬失败模式），missing key / asymmetric 都会阻断
- 修复：`pnpm sync:locales -- --write` 补占位，再人工填中英文

## 数据库迁移

- 后端 TypeORM 迁移文件：`apps/server/src/migrations/`
- 命令：

  ```bash
  pnpm migration generate src/migrations/<NameInPascalCase>
  pnpm migration run
  pnpm migration revert
  pnpm migration show
  pnpm migration:archive
  ```

- 迁移规约：UUID 主键（`gen_random_uuid()` + `CREATE EXTENSION IF NOT EXISTS pgcrypto`） / snake_case 列名 / 逻辑外键（无数据库级外键约束） / 幂等 SQL（`IF NOT EXISTS`）。详见 [`.claude/CLAUDE.md`](.claude/CLAUDE.md) 「数据库规范」节与 `shared-data-model` 技能。

## 提交规范

- **conventional commits 风格**：`feat: ...` / `fix: ...` / `refactor: ...` / `chore: ...` / `docs: ...` / `test: ...`
- **中文 commit body**（仓库习惯，但 type 用英文）
- **每个 task 一个 commit** —— 便于 review

## 常见问题

- **pre-commit 卡 sync:locales --check**：先 `pnpm sync:locales -- --write` 补占位，再人工填中英文译文
- **e2e 测试找不到 Postgres**：`pnpm dev:db:up` 起本地 Postgres；端口冲突改 `infra/dev/docker-compose.dev.yml` 端口映射

## License

贡献即视为同意以 MIT 协议授权。
