# qriter server 部署（apps/server）

单容器部署 Nest server。**Postgres / Redis / Nacos 均为外部托管**（独立部署），不在本 compose —— server 经 Nacos 配置里的 `database.host` / `redis.host` 连接它们。

**配置模型**：server 的业务配置（`port` / `database` / `jwt` / `redis` / `llm`）全部来自 **Nacos**（一个 dataId，内容为 YAML）。容器只给 server `NACOS_*` 连接信息——环境变量最小化。运行模式（dev/prod）不在 Nacos，由镜像里 `NODE_ENV=production` 决定。本地无 Nacos 时 server 会回退读 `apps/server/conf/application.yml`（仅 dev）。

## 起动

```bash
cd apps/server
cp .env.prod.example .env.prod
$EDITOR .env.prod   # 填 NACOS_* 连接

docker compose --env-file .env.prod up -d --build
docker compose logs -f server
```

健康检查（容器名 `qriter-server`，Dockerfile 内置 `/api/health`）：

```bash
curl http://localhost:3000/api/health
# 期望：{"status":"ok","info":{"database":{"status":"up"},"redis":{"status":"up"}}, ...}
```

## 环境变量（compose 用，尽量少）

| 变量 | 用途 | 说明 |
|------|------|------|
| `NACOS_SERVER_ADDR` | server 连 Nacos | `host:8848` |
| `NACOS_USERNAME` / `NACOS_PASSWORD` | Nacos 鉴权 | 你的 Nacos 账号 |
| `NACOS_NAMESPACE` / `NACOS_GROUP` / `NACOS_DATA_ID` | 定位配置 | 有默认（public / DEFAULT_GROUP / qriter-server.yaml） |
| `SERVER_PORT` | host 暴露端口 | 默认 3000，须与 Nacos 配置 `port` 一致 |

> server 不再需要 `DATABASE_URL` / `JWT_SECRET` / `REDIS_URL` 等环境变量——它们在 Nacos 里。Postgres 凭证也不在这里（pg 外部托管，凭证写进 Nacos `database.*`）。

## Nacos 配置（dataId 内容为 YAML，必须事先在 Nacos 建好）

`database.host` / `redis.host` 指向**外部托管**的实例地址：

```yaml
# 运行模式不在这里 —— 由镜像 NODE_ENV=production 决定
port: 3000                 # 与 SERVER_PORT 右侧映射、healthcheck 一致
database:
  type: postgres
  host: <your-postgres-host>   # 外部 / 托管 Postgres 地址
  port: 5432
  username: qriter
  password: <db-password>
  database: qriter
  synchronize: false
  autoLoadEntities: true
jwt:
  secret: <openssl rand -base64 48>
  expires: 7d
redis:
  host: <your-redis-host>      # 外部 / 托管 Redis 地址
  port: 6379
  db: 0
  # password: <若 redis 开了 requirepass 则填>
# llm:                     # 可选，agent 模型凭证（provider: anthropic / openai / deepseek）
#   provider: deepseek
#   model: deepseek-chat
#   apiKey: sk-...
#   baseUrl: https://api.deepseek.com
```

## 数据库迁移

prod 路径 `migrationsRun: false`（启动不自动迁移）。在「有 repo + dev 依赖、且能连到 Nacos 和目标库」的运维 / CI 机器上跑（`apps/server/.env` 指向 prod 的 `NACOS_*`，迁移 CLI 会从 Nacos 取 database 切片）：

```bash
pnpm migration run
pnpm migration show   # 确认状态
```

> prod runtime 镜像只含运行时闭包（无 tsx / typeorm CLI），不在容器内跑迁移。
> 后续计划：加 migration init 容器，或 CI 部署流水线里跑迁移。

## 端口

默认 server `3000` 暴露到 host。须与 Nacos 配置 `port` 一致。

## 暂不在范围内

- 多机部署 / k8s / Helm
- TLS 终结（Nginx / Caddy 反代）—— 自行外接
- 监控（Sentry / OTel / Grafana）
- web 前端部署见 `apps/web/DEPLOY.md`
