# ConfigLoader 设计：本地 YAML + Nacos 引导式配置

- 日期：2026-06-04
- 状态：已确认（待实施计划）
- 影响范围：`libs/shared/src/config/`、`apps/server/src/main.ts`、`apps/server/config/`、根 `.gitignore`

## 1. 背景与目标

当前 `apps/server` 启动期通过 `@nestjs/config` 的 `ConfigModule.forRoot` 读取
`.env.development` / `.env`，并由 `createEnvValidator(EnvSchema)`（`libs/shared`）做
Zod fail-fast 校验，最后把 coerce / default 后的值回写 `process.env`。

缺失 `DATABASE_URL` / `JWT_SECRET` 等会导致启动直接报错。希望引入一种
**引导式（bootstrap）配置**能力：

- 应用真正的配置（DB / JWT / Redis 等）来自**本地 YAML**（开发）或 **Nacos 配置中心**（部署）。
- 环境变量里**只需配置 Nacos 的连接信息**（引导变量）。
- 引导变量放 `apps/server/.env`（git 忽略），并提供一份可提交的 `.env` 样例。

## 2. 已确认的关键决策

| 决策点 | 选择 |
|---|---|
| 配置源选择 | **按 Nacos 环境变量存在与否**：`NACOS_SERVER_ADDR` 存在 → Nacos；否则回退本地 YAML |
| 配置内容结构 | **嵌套 YAML + 拍平**：嵌套键拍平成 `UPPER_SNAKE` 后并入 env，复用现有 `EnvSchema` |
| 刷新方式 | **启动时加载一次**（fail-fast；变更需重启）。Nacos 监听器热更新留作未来扩展 |
| 本地 YAML 归属 | **提交带 localhost 默认值的 `application.yml`**（开箱即用）+ gitignore `application.local.yml` 个人覆盖 |
| Nacos 鉴权 | **可选鉴权**：`NACOS_USERNAME` / `NACOS_PASSWORD` 设了就带，没设走匿名 |

## 3. 总体架构（bootstrap-config 模式）

新增纯函数 `loadAppConfig()`（`libs/shared`），在 `main.ts` 中
`NestFactory.create(AppModule)` **之前** `await` 调用。它把配置源的值拍平写进
`process.env`；之后**现有的 `ConfigModule.forRoot` + `EnvSchema` 校验完全不变**，
`ConfigService.getOrThrow(...)`、直读 `process.env.NODE_ENV` 等照常工作。

### 优先级（高 → 低）

```
真实环境变量 / .env 文件  >  Nacos 或 YAML 配置源  >  EnvSchema 默认值
```

env 永远能覆盖配置源（12-factor 逃生口）。实现方式：合并配置源拍平值时
**仅在 `process.env` 尚未存在该 key 时写入**。

### 数据流

```
main.ts
  └─ await loadAppConfig({ envFiles, yamlFiles, cwd })
       1. dotenv 读 .env.development / .env（不覆盖已存在 env）→ 拿到 NACOS_* 引导变量
       2. NacosBootstrapSchema 校验 NACOS_*
       3. 选源：NACOS_SERVER_ADDR 存在 → Nacos；否则 → 本地 YAML
       4. 取内容（YAML 字符串）→ js-yaml 解析成嵌套对象
       5. flattenToEnv：嵌套 → UPPER_SNAKE（database.url → DATABASE_URL）
       6. 合并进 process.env（已存在的 key 不覆盖 = env 优先）
       7. log 命中源 + 注入的 key 数量（绝不打印值，避免泄密）
  └─ NestFactory.create(AppModule)   // ConfigModule 用 EnvSchema 照常 fail-fast 校验
```

## 4. 组件设计

全部落在 `libs/shared/src/config/`，纯逻辑写成工厂 / 纯函数，公开函数带中文 JSDoc。
`libs/shared` 为后端基建层，允许使用 fs / 网络 / dotenv（「无 DB / HTTP」约束仅针对 `libs/agent`）。

| 文件 | 导出 | 职责 |
|---|---|---|
| `flatten.ts` | `flattenToEnv(obj)` | 嵌套对象 → `{ UPPER_SNAKE: string }`；路径段用 `_` 连接并大写；标量字符串化（number / boolean → String()）；遇数组 / 对象叶子之外的复杂值按约定处理（见 §6） |
| `yaml-source.ts` | `loadYamlConfig(paths)` | 依次读 `application.yml`（基础）+ `application.local.yml`（覆盖），js-yaml 解析后深合并；基础文件缺失 → 返回 `{}`（允许纯 env） |
| `nacos-source.ts` | `loadNacosConfig(opts)` | 用官方 `nacos` 的 `NacosConfigClient`，`getConfig(dataId, group)` 取 YAML 串 → js-yaml 解析成嵌套对象；用户名 / 密码可选 |
| `nacos-bootstrap.schema.ts` | `NacosBootstrapSchema`、`NacosBootstrap` 类型 | Zod 校验 `NACOS_*` 引导变量 |
| `config-loader.ts` | `loadAppConfig(options)` | 编排上述步骤；options：`{ envFiles?, yamlFiles?, cwd? }`，默认值由调用方（main.ts）传 app 专属路径，保持 `libs/shared` 通用 |

`libs/shared/src/config/index.ts` 增加 `export { loadAppConfig } from "./config-loader"`（→ `@qriter/shared`）。

### NACOS_* 引导变量

| 变量 | 必填 | 默认 | 说明 |
|---|---|---|---|
| `NACOS_SERVER_ADDR` | 是（决定是否走 Nacos） | — | `host:port`，如 `127.0.0.1:8848` |
| `NACOS_NAMESPACE` | 否 | `public` | 命名空间 ID |
| `NACOS_GROUP` | 否 | `DEFAULT_GROUP` | 配置分组 |
| `NACOS_DATA_ID` | 否 | `qriter-server.yaml` | 配置 dataId（内容为 YAML） |
| `NACOS_USERNAME` | 否 | — | 鉴权用户名（设了才带） |
| `NACOS_PASSWORD` | 否 | — | 鉴权密码 |

## 5. 嵌套 YAML ↔ 现有 env 的映射

拍平规则「路径段用 `_` 连接 + 全大写」正好命中现有 `EnvSchema` 的 key，**零手工映射表**：

```yaml
# apps/server/config/application.yml（提交，含 localhost 开发默认值）
node_env: development          # → NODE_ENV
port: 3000                     # → PORT
database:
  url: postgresql://qriter:qriter@localhost:5433/qriter   # → DATABASE_URL
jwt:
  secret: qriter-dev-secret-change-in-prod-min-16          # → JWT_SECRET
  expires: 7d                  # → JWT_EXPIRES
redis:
  url: redis://localhost:6380  # → REDIS_URL
```

Nacos 端 dataId 内容采用**同一份嵌套 YAML 结构**，复用同一解析 + 拍平路径。

## 6. 错误处理（fail-fast）

沿用现有 `createEnvValidator` 的「纯 `Error` + 中文消息」风格（启动期、Nest 起来之前，
不接入 `defineErrorCode` 的业务错误码体系）：

- Nacos 已配置但拉取失败（网络 / 鉴权 / dataId 不存在）→ 抛错，消息指出 server / namespace / group / dataId。
- 本地 YAML 基础文件缺失 → 视为空对象（允许纯 env 启动），不报错。
- YAML 解析失败（语法非法）→ 抛错。
- `NACOS_*` 非法（如 addr 格式错误）→ 抛错，带字段路径。
- 拍平叶子值为数组 / 嵌套对象之外的非标量 → 抛错（保持配置「扁平标量」语义；YAGNI 不支持数组配置）。
- DB / JWT 等业务必填项缺失 → 由现有 `EnvSchema` 在 `ConfigModule` 阶段照常 fail-fast。

## 7. 文件与 git

**新增提交：**
- `apps/server/config/application.yml`：上面那份嵌套 YAML，localhost 开发默认值，开箱即用。
- `apps/server/.env.example`：NACOS_* 样例（全注释），复制为 `.env` 后填。

```bash
# apps/server/.env.example —— 复制为 .env 后填；不设则回退本地 application.yml
# NACOS_SERVER_ADDR=127.0.0.1:8848
# NACOS_NAMESPACE=public
# NACOS_GROUP=DEFAULT_GROUP
# NACOS_DATA_ID=qriter-server.yaml
# NACOS_USERNAME=
# NACOS_PASSWORD=
```

**git 忽略：**
- `apps/server/.env`：已被现有 `.gitignore` 的 `.env` 规则覆盖。
- `apps/server/config/application.local.yml`：个人覆盖，在根 `.gitignore` 新增一条规则 `apps/server/config/application.local.yml`。

## 8. 依赖

- `libs/shared` `dependencies` 增加：`nacos@^2`、`js-yaml@^4`、`dotenv@^17`（loader 自读 .env）。
- `libs/shared` `devDependencies` 增加：`@types/js-yaml`。

## 9. 集成点改动

- `apps/server/src/main.ts`：在 `NestFactory.create(AppModule)` 前 `await loadAppConfig({ ... })`，
  传入 app 专属的 `envFiles`（`.env.development`、`.env`）、`yamlFiles`
  （`config/application.yml`、`config/application.local.yml`）与 `cwd`。
- `apps/server/src/app.module.ts`：**不改**（`ConfigModule.forRoot` + `EnvSchema` 维持原样，
  仍作为最终校验 + .env 兜底）。
- `apps/server/src/env.schema.ts`：**不改**。

## 10. 测试（jest）

- `flatten.spec.ts`：嵌套 → UPPER_SNAKE、标量字符串化、多层嵌套、非标量叶子抛错。
- `yaml-source.spec.ts`：解析、base + local 深合并、文件缺失返回空。
- `nacos-source.spec.ts`：mock `NacosConfigClient`，验证 dataId / group / 鉴权参数传递与 YAML 解析。
- `config-loader.spec.ts`：选源逻辑（有 / 无 NACOS_SERVER_ADDR）、env 不覆盖优先级、注入 key 数量。
- 现有 `apps/server` E2E：保证 `loadAppConfig` 接入后仍能正常起服务（本地 YAML 路径）。

## 11. 非目标（YAGNI）

- Nacos 配置变更的运行时热更新（监听器）。
- 数组 / 复杂结构配置。
- 多 dataId 聚合、配置加密。
