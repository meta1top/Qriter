# qriter

[![CI](https://github.com/meta1top/qriter/actions/workflows/ci.yml/badge.svg)](https://github.com/meta1top/qriter/actions/workflows/ci.yml)

一个基于 Agent 的开源写作平台。后端编排 LangGraph Agent 协助创作书籍与章节，前端提供创作与管理界面。

> 单后端 + 单前端，单轨 Postgres。

## 项目结构

```
apps/
├── server/    NestJS 单后端（:3000，Postgres + LangGraph，全局前缀 api，dev Swagger /api/docs）
└── web/       Next.js 单前端（:3001）

libs/
├── shared/    NestJS 基础设施（装饰器 / TxTypeOrmModule / Lock / Cache / DTO / 错误 / 拦截器 / 守卫 / health / ws / config / utils），@qriter/shared
├── types/     纯 Zod schema + TS 类型（零框架依赖，前后端共享），@qriter/types
├── account/   账号域业务（Account），@qriter/account
├── book/      书籍域业务（Book / Chapter），@qriter/book
└── agent/     Agent Core（LangGraph 编排 / 工具 / skills / checkpointer），@qriter/agent

packages/
├── common/    前端通用逻辑（axios client + theme），@qriter/common
└── design/    Tailwind + shadcn/Radix 组件库，@qriter/design

infra/
├── dev/       本地开发依赖（docker-compose Postgres + Redis）
└── prod/      生产形态 docker-compose 编排
```

## 技术栈

- **包管理**：pnpm workspace + Turborepo
- **后端**：NestJS 11, TypeORM 0.3, LangGraph（`@langchain/langgraph-checkpoint-postgres` 的 PostgresSaver 做 checkpointer）
- **前端**：Next.js 15 (App Router), Tailwind CSS v4, shadcn/ui, next-intl
- **类型**：TypeScript 5, Zod 3
- **数据**：Postgres 16（UUID 主键 + 逻辑外键 + snake_case 列名），Redis 可选（不配则 memory 兜底）
- **i18n**：nestjs-i18n（后端） + next-intl（前端），zh / en 双语
- **测试**：Jest（含真 Postgres 隔离 schema e2e）
- **质量门禁**：Biome（lint/format） + 6 个静态围栏（tx / naming / lock-tx / repo / dead-exports / error-code）+ husky pre-commit

## 快速开始

```bash
# 安装依赖（Node >= 22）
pnpm install

# 启动本地依赖（Postgres + Redis）
pnpm dev:db:up

# 跑数据库迁移
pnpm migration run

# 启动后端 / 前端
pnpm dev:server          # NestJS 后端（:3000）
pnpm dev:web             # Next.js 前端（:3001）

# 全部同时启动
pnpm dev

# 全量构建
pnpm build
```

> **配置**：本地开发**无需任何环境变量** —— 配置默认读 `apps/server/config/application.yml`（已含 localhost 默认值）。部署时只配 `NACOS_*` 连接信息（见 `apps/server/.env.example`），业务配置（`database` / `jwt` / `redis` / `llm`）全从 Nacos 拉取。详见 `infra/prod/README.md`。

## 本地复刻 CI

提 PR 前本地跑一遍这套（与 `.github/workflows/ci.yml` 严格对齐）：

```bash
pnpm install --frozen-lockfile
pnpm dev:db:up                       # e2e 依赖 Postgres
pnpm lint                            # Biome
pnpm typecheck                       # 全包 TS 类型检查
pnpm check:strict                    # 6 围栏（CI 用 strict；本地 pnpm check 走 baseline 增量亦可）
pnpm sync:locales -- --check         # i18n key 对齐
pnpm test                            # Jest（含 server e2e）
pnpm build                           # turbo run build
```

husky pre-commit 已自动跑 Biome（lint-staged） + 6 围栏（`check:parallel`，baseline 增量） + `sync:locales --check`。

## 静态围栏（6 个）

| 静态围栏（fence） | 命令 | 检查内容 |
|---|---|---|
| `check:tx` | `pnpm check:tx` | `@Transactional()` 使用合法性 / 冗余（写动作 ≤ 1） / 绕过 TxTypeOrmModule |
| `check:naming` | `pnpm check:naming` | 私有 `@Transactional()` 方法命名约定（`*InTx` / `*InDb` / `persist*`） |
| `check:lock-tx` | `pnpm check:lock-tx` | 事务-锁倒置漏洞（`@WithLock` 不能在 `@Transactional` 内） |
| `check:repo` | `pnpm check:repo` | Entity 唯一归属 Service / 非 Service 注入 Repository / 跨 lib 注入 |
| `check:dead` | `pnpm check:dead` | 没人引用的 named export |
| `check:error-code` | `pnpm check:error-code` | 错误码重复 / 越界 / 断号 |

## 文档

- **架构与规约**：[`.claude/CLAUDE.md`](.claude/CLAUDE.md)
- **贡献指南**：[`CONTRIBUTING.md`](CONTRIBUTING.md)
- **本地开发依赖**：[`infra/dev/README.md`](infra/dev/README.md)
- **生产部署**：[`infra/prod/README.md`](infra/prod/README.md)

## License

MIT
