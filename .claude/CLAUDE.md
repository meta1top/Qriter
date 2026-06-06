# CLAUDE.md

本文件指导 Claude Code 在 qriter 仓库的工作方式。

qriter 是一个**基于 Agent 的写作平台**：单后端（NestJS）+ 单前端（Next.js），单轨 Postgres。后端编排 LangGraph Agent 协助创作书籍与章节。

## 常用命令

### 开发

| 命令 | 说明 |
|------|------|
| `pnpm dev:server` | 后端（NestJS watch，端口 3000，全局前缀 `api`，dev 挂 Swagger 于 `/api/docs`） |
| `pnpm dev:web` | 前端（Next.js，端口 3001） |
| `pnpm dev` | 同时启动 server + web（Turbo） |
| `pnpm dev:db:up` | 启动本地依赖 postgres + redis（docker compose，后台） |
| `pnpm dev:db:down` | 停止本地依赖（保留数据） |
| `pnpm dev:db:reset` | 停止并清空 volume（破坏数据） |
| `pnpm dev:db:logs` | 跟随 postgres 日志 |

### 构建与测试

- `pnpm build` — Turbo 拓扑构建（`build:server` / `build:web` 可单独构建）
- `pnpm test` — Jest（root 配置，覆盖 libs/shared 与 server）
- `pnpm typecheck` — 全包 TS 类型检查（`turbo run typecheck`）
- `pnpm lint` / `pnpm format` — Biome
- `pnpm check:format` — `biome check --write .`（格式化 + lint 修复 + import 排序）

### 静态围栏（写完代码必跑）

```bash
pnpm check          # 串行跑下面 6 个；pnpm check:parallel 并行
pnpm check:tx
pnpm check:naming
pnpm check:lock-tx
pnpm check:repo
pnpm check:dead
pnpm check:error-code
pnpm check:strict   # CI 用，所有围栏 strict 模式（finding ≥ 1 即 exit 1）
```

### i18n

- `pnpm sync:locales` — 同步前后端 i18n key（zh / en 双语）
- `pnpm sync:locales -- --check` — 校验 key 对齐（CI / pre-commit 用，硬失败）
- `pnpm sync:locales -- --write` — 补占位，再人工填中英文译文

### 数据库迁移

```bash
pnpm migration generate src/migrations/<NameInPascalCase>   # 生成迁移
pnpm migration run                                          # 跑迁移
pnpm migration revert                                       # 回滚最近一次
pnpm migration show                                         # 查看迁移状态
pnpm migration:archive                                      # 归档历史迁移
```

> 迁移命令底层是 `apps/server` 的 `pnpm migration`（`tsx scripts/typeorm-cli.ts src/data-source.cli.ts`）。

## 项目架构

```
apps/
├── server/    NestJS 单后端（:3000，Postgres + LangGraph）
└── web/       Next.js 单前端（:3001）

libs/
├── types/     纯 Zod schema + TS 类型（零框架依赖），前后端共享，别名 @qriter/types
├── shared/    后端共享「声明」：面向 Nest 的 error-code 定义 + AppError、DTO 桥（createZodDto / createI18nZodDto）+ PageDto、常量。轻量（不含运行时机器），别名 @qriter/shared
├── common/    后端「基建」运行时：装饰器（@Transactional / @WithLock / @Cacheable）/ TxTypeOrmModule / Lock / Cache / 拦截器 / 守卫 / 中间件 / health / ws / config-loader / CommonModule / utils。别名 @qriter/common
├── account/   账号域业务 lib（Account），别名 @qriter/account
├── book/      书籍域业务 lib（Book / Chapter），别名 @qriter/book
└── agent/     Agent Core（LangGraph 图 / 工具 / skills / checkpointer / port），别名 @qriter/agent

packages/
├── web-common/ 前端通用逻辑（axios client + theme），别名 @qriter/web-common
└── design/     Tailwind + shadcn/Radix UI 组件库，别名 @qriter/design

infra/
├── dev/       本地开发依赖（docker-compose Postgres + Redis）
└── prod/      生产形态 docker-compose 编排
```

## 依赖方向法

只允许从上到下、从右到左，**禁止反向**：

```
后端：apps/server → libs/<domain>（account / book / agent） → libs/common → libs/shared → libs/types
前端：apps/web → packages（web-common / design） → libs/types
```

- `libs/types` 是前后端共享的纯类型层（Zod schema），**禁止依赖 NestJS / TypeORM**。
- `libs/shared` 是后端共享「声明」层（error-code / AppError / DTO 桥 / 常量），面向 Nest 但轻量；依赖 types，不依赖 common。
- `libs/common` 是后端「基建」运行时（事务 / 锁 / 缓存 / 拦截器 / 守卫 / ws / config-loader / CommonModule）；依赖 shared + types。业务 lib 按需取 common（事务 / 锁）+ shared（DTO / 错误码）。
- 三者都不反依赖业务 lib。业务 lib 之间跨域访问只能通过对方域 Service 的公开方法，**禁止跨 lib 注入对方 Entity 的 Repository**。

## 关键约定

### Repository 访问规范（check:repo）

- 每个 TypeORM Entity 有且仅有一个归属 Service（唯一持有 `@InjectRepository(X)` 的类）。
- Controller / Gateway / Tool 禁止直接注入 Repository，必须通过归属 Service 访问。
- 跨 `libs/<domain>/` 边界禁止注入其他模块的 Entity Repository（注入对方域 Service）。

### 事务、锁、缓存（仅在 Service 层）

- **`@Transactional()`**：**跨表写入时使用**。单表 upsert / 单表 update 不需要。模块用 `TxTypeOrmModule.forFeature()` 注册 Entity（替代 `TypeOrmModule.forFeature()`）。事务上下文通过 `AsyncLocalStorage` 自动传播到子 Service，子 Service 无需重复挂 `@Transactional()`。`@Transactional`（及 `@WithLock` / `@Cacheable` / `TxTypeOrmModule`）的唯一合法来源是 `@qriter/common`（基建）；`createI18nZodDto` / `AppError` / `defineErrorCode` 等「声明」来自 `@qriter/shared`。
- **`@WithLock`**：并发竞态 / 幂等保护。**必须在 `@Transactional` 外层**（锁包事务），严禁事务内嵌套锁（事务-锁倒置，`pnpm check:lock-tx` 自动校验）。
- **`@Cacheable` / `@CacheEvict`**：Service 类标 `@CacheableService()`；每个 `@Cacheable` 必须配对至少一个 `@CacheEvict`。缓存键格式：`模块:实体:#{参数索引或路径}`。
- 装饰器组合顺序（从外到内）：`@WithLock` → `@Transactional` → `@CacheEvict`。

### 事务方法命名（check:naming）

私有 / 受保护 `@Transactional()` 方法命名必须命中以下约定之一：`*InDb`、`*InTx`、`*InTransaction`、`persist[A-Z]*`。反向也成立：私有/受保护方法名命中这些 → 必须挂 `@Transactional()`。public 方法不强制。

### 数据库规范（Postgres only）

- **仅 Postgres**：无 SQLite / 无本地 db 文件分支。
- **主键 UUID**：实体主键用 `@PrimaryGeneratedColumn("uuid")`；迁移用 `gen_random_uuid()` + `CREATE EXTENSION IF NOT EXISTS pgcrypto`。
- **逻辑外键**：禁止数据库级外键约束，不用 `@ManyToOne` / `@OneToMany` / `@JoinColumn`；用普通列 + 索引表达关联。
- **列名 snake_case**（项目配置 `SnakeNamingStrategy` 自动转）。
- 迁移文件 + 幂等 SQL（`IF NOT EXISTS` / `IF EXISTS`）+ 索引建议 `CONCURRENTLY`。`synchronize:false`。

### 配置（Nacos / application.yml，环境变量最小化）

- **配置源**：业务配置（`port` / `database` / `jwt` / `redis` / `llm`）是**多层级对象**，来自 **Nacos**（一个 dataId，内容为 YAML）。本地开发无 Nacos 时回退读 `apps/server/config/application.yml`（个人覆盖写 `application.local.yml`，已 gitignore）。
- **运行模式不进 Nacos**：dev/prod 是「部署环境身份」而非业务配置，`isProd` 取自 `process.env.NODE_ENV`（prod 镜像烤 `production`、本地不设=dev、jest=test），不放配置中心（避免与 NODE_ENV 两份来源打架）。
- **环境变量只放 Nacos 连接**：`NACOS_SERVER_ADDR` / `NACOS_NAMESPACE` / `NACOS_GROUP` / `NACOS_DATA_ID` / `NACOS_USERNAME` / `NACOS_PASSWORD`（写 `apps/server/.env`，见 `.env.example`）。**不再有** `DATABASE_URL` / `JWT_SECRET` 等扁平 env。
- **加载链路**：`main.ts` 在 Nest 生命周期外调 `loadAppConfig(AppConfigSchema, …)`（`@qriter/common`，async）→ 校验后的强类型 `AppConfig` → `AppModule.forRoot(config)` 把切片分发给各模块：`TypeOrmModule.forRoot(config.database)`、`RedisModule`（读 `config.redis`）、`AuthModule`（读 `config.jwt`）、agent（`config.database` 拼 checkpointer 连接串、`config.llm` 绑 `LLM_OPTIONS`）。全局 `APP_CONFIG` token 供任意 service 注入按需取用。**不用 `@nestjs/config`**。
- **schema**：`apps/server/src/config/app-config.schema.ts`（`AppConfigSchema` + `DatabaseConfigSchema` 等 + `APP_CONFIG`）。`AppConfig` 的形状是应用自有的事；`libs/shared` 只提供通用 loader。
- **迁移 CLI**：`data-source.cli.ts` 导出 `Promise<DataSource>`（同样经 `loadAppConfig` 走 Nacos / YAML，只取 database 切片）。
- **LLM 凭证**：放 `config.llm`（Nacos / YAML），经 `LLM_OPTIONS` 注入 agent；未配才回退 `*_API_KEY` 环境变量。

### Zod / DTO 分层（共享数据模型）

- 所有跨前后端共享的 schema 放 `libs/types`（`*.schema.ts`），导出 `XxxSchema` + `z.infer` 类型。
- `libs/types` **禁止依赖 NestJS / TypeORM**（纯框架无关）。
- 后端用 `@qriter/shared` 的 `createI18nZodDto(schema)` 把 Zod 转 NestJS DTO 类（校验 + OpenAPI + i18n 校验文案采集）。`nestjs-zod` 的 `createZodDto` 仅作其内部实现，业务代码不直接用。
- Entity 与 Schema 分离：Entity 在业务域 lib 的 `entity/`，Schema 在 `libs/types`。

### 前端表单

写表单走 `@qriter/design` 的 `Form` / `FormItem` + `useSchema`（共享 Zod Schema + 多语言 `t(message)`，详见 `web-form-convention` 技能）。任何用户可见字符串走 next-intl，禁止裸串（详见 `i18n-page` 技能）。

### 测试

- 新代码默认 Jest；`libs/agent` 历史用 vitest，不强行统一（jest 配置已排除 `libs/agent/`）。
- 装饰器、Provider、围栏脚本必须有单测。
- E2E 测试覆盖 server（含 Postgres service）。

### error-code 区段（与 `scripts/check-error-code.ts` 的 RANGES 一致）

| 包 / 路径前缀 | 区段 |
|---|---|
| `libs/shared/` | 0 – 999 |
| `libs/account/` | 1000 – 1999 |
| `libs/book/` | 2000 – 2999 |
| `libs/agent/` | 3000 – 3999 |

`@qriter/shared` 的 `CommonErrorCode` 占 0/1/2/3/4/5/6/999。各业务 lib 用 `defineErrorCode({...})` 在本区段内**连续无 gap**。`pnpm check:error-code` 校验重复 / 越界 / 断号。

### Agent 边界规则（libs/agent）

- `libs/agent` **框架无关**：零数据库、零 HTTP。只允许 `@Injectable()` + 生命周期钩子；禁止 `@InjectRepository` / `@Entity` / `@Controller` / 任何 TypeORM / HTTP 装饰器。
- **checkpointer 由调用方注入**（抽象端口 `NOVEL_STORE_PORT`）；qriter 用 `@langchain/langgraph-checkpoint-postgres` 的 `PostgresSaver`（无 SQLite）。
- 纯逻辑写成工厂函数（`create*` / `build*`），有状态的才落 `*Service`。
- 静态围栏显式排除 `libs/agent/`，边界靠本约定 + 人审 + vitest 守护（详见 `agent-arch` 技能）。

### 其他

- 公开方法包含中文 JSDoc。
- 禁止在 `if` 前一行放置注释（Biome 格式化会破坏结构）。
- 缩进 2 空格、双引号（Biome 默认）。
- 不新建 PRD 文档，设计决策记在对话或 commit 中。

## 开发工作流

1. **brainstorm** —— 用 superpowers 的 brainstorming 技能探讨需求 / 确认范围
2. **writing-plans** —— 出实施 plan
3. **编码** —— TDD 优先（先写失败的单测），中文 JSDoc
4. **静态围栏** —— commit 前 `pnpm check`（pre-commit 自动跑 `check:parallel` + `sync:locales --check`）
5. **commit** —— conventional commits 风格（type 用英文，body 用中文）

## 表归属

| 域 | 数据库 | 当前 Entity |
|------|--------|-------------|
| account | Postgres（TypeORM 迁移管理） | `Account`（注册 / 登录框架基线） |
| book | Postgres（TypeORM 迁移管理） | `Book` / `Chapter` |
| agent | Postgres | LangGraph Postgres checkpointer 表（由 `PostgresSaver` 管理，非业务 Entity） |
