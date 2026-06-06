# qriter scripts

所有可执行脚本放在本目录，统一用 `tsx` 运行。

## 命名约定

- 文件名：`<verb>-<noun>.ts`（kebab-case），例如 `check-transactional.ts` / `sync-locales.ts`
- 顶部 JSDoc 用中文写明：脚本目标、使用场景、退出码语义
- 失败退出码：非 0；成功：0

## 六个静态围栏

| 脚本 | pnpm 命令 | 用途 |
|------|-----------|------|
| `check-transactional.ts` | `pnpm check:tx` | 校验 `@Transactional` 完整性（跨表写入是否挂；导入是否来自 `@qriter/shared`；是否冗余；是否绕过 Proxy） |
| `check-method-naming.ts` | `pnpm check:naming` | 校验事务方法命名约定（`*InDb` / `*InTx` / `*InTransaction` / `persist*`）与 `@Transactional()` 是否一致 |
| `check-lock-tx.ts` | `pnpm check:lock-tx` | 校验事务-锁倒置漏洞（`@WithLock` 不可在 `@Transactional` 内层；装饰器顺序 / 调用链） |
| `check-repo-access.ts` | `pnpm check:repo` | 校验 Entity 唯一归属 Service + 非 Service 注入 Repository + 跨 libs 边界注入限制 |
| `check-dead-exports.ts` | `pnpm check:dead` | 校验 named export 无人引用的死导出 |
| `check-error-code.ts` | `pnpm check:error-code` | 校验错误码重复 / 越界 / 断号 |

一键全跑：`pnpm check`

### error-code 区段（与 `check-error-code.ts` 的 `RANGES` 一致）

| 包/路径前缀 | 区段 |
|---|---|
| `libs/shared/` | 0 – 999（`CommonErrorCode` 占 0/1/2/3/4/5/6/999） |
| `libs/account/` | 1000 – 1999 |
| `libs/book/` | 2000 – 2999 |
| `libs/agent/` | 3000 – 3999 |
| `apps/server/` | 0 – 9999（单后端可 re-export 任意域错误码） |

各业务 lib 用 `defineErrorCode({...})` 在本区段内**连续无 gap**（如需跳号，在调用上方 JSDoc 加 `@skip-gap`）。

## 辅助脚本

| 脚本 | pnpm 命令 | 用途 |
|------|-----------|------|
| `sync-locales.ts` | `pnpm sync:locales` | 扫描前后端 `t()` / `useTranslations` 调用对齐 locale JSON（missing / orphan / asymmetric） |
| `typeorm-cli.ts` | （由各 app `migration:*` 转发） | 包装 `typeorm-ts-node-commonjs`：把短动词映射成 `migration:*` 子命令并追加 `-d <datasource>` |
| `archive-migrations.ts` | `pnpm migration:archive` | 把 `apps/server/migrations/` 下已执行迁移文件归档到 `migrations/archive/` |
| `lib/ts-files.ts` | （内部库） | 递归收集源文件（不跟随软链，断开自引用环），供六个围栏复用 |

### sync-locales 模式

- 默认：只报告，exit 0
- `--check`：报告 + 不一致时 exit 1（用于 pre-commit）
- `--write`：把 missing 在 zh/en 文件中补占位空字符串
- `--prune`：删除 orphan（**危险**，PR 评审后再用）

目录约定：
- web 端：`apps/web/messages/<lang>.json`
- server 端：`apps/server/i18n/<lang>/<namespace>.json`

## 适用范围

围栏只针对 NestJS 服务层代码（`libs/**/src/**` + `apps/server/src/**`）。
以下路径被显式排除：
- `apps/web/**` —— 前端 Next.js 应用
- `packages/**` —— 前端共享包
- `libs/types/**` —— 纯 zod schema 类型库（零框架依赖，对外 SDK）
- 测试文件（`*.spec.ts` / `*.e2e-spec.ts` / `*.test.ts` / `__tests__/`）、`migrations/`、`openspec/`

## 增量基线模式

六个 `check:*` 脚本（`tx` / `naming` / `lock-tx` / `repo` / `dead` / `error-code`）都支持**增量模式**。
运行时读取 `docs/audits/<fence-name>/` 下最新的 baseline JSON 报告，
仅在以下情况输出新报告：

- 新增 finding（baseline 里没有、本次发现的）
- 已有 finding 内容变化（同 `file:line` 但 issue 类别 / 描述变更）

**默认行为**：若本次扫描与 baseline 完全一致 → 打印 `无新增 finding`，
不写新 JSON，exit 0。CI / pre-commit 默认走这条路径。

### 强制刷新基线 `--force-report`

当你**合法地修改了围栏覆盖的代码**（例如新增一个 `@Transactional` 方法、
迁移 Entity 归属、删除老的死导出符号）后，希望基线"接受"这次变化：

```bash
pnpm check:tx -- --force-report
pnpm check:naming -- --force-report
pnpm check:lock-tx -- --force-report
pnpm check:repo -- --force-report
pnpm check:dead -- --force-report
pnpm check:error-code -- --force-report
```

会强制把本次完整结果写一份新 JSON 到
`docs/audits/<fence-name>/<timestamp>.json`，下次跑就以新文件为新 baseline。
新生成的 JSON 应当随业务代码一起 commit，作为"已审计过"的证据。

> 注意：`--force-report` 只刷新报告，不放过新增的违规。如果本次发现违规仍会 exit 1。
