# qriter 生产形态部署（infra/prod）

最小可用的 docker-compose 编排：`postgres + redis + server`。
适用于单机部署 / 小规模生产 / 演示环境。多机集群 / 高可用 / k8s 后续再推。

**配置模型**：server 的业务配置（`node_env` / `port` / `database` / `jwt` / `redis` / `llm`）
全部来自 **Nacos**（一个 dataId，内容为 YAML）。容器只给 server `NACOS_*` 连接信息——
环境变量最小化。本地无 Nacos 时 server 会回退读 `apps/server/config/application.yml`（仅 dev）。

## 起动

```bash
cd infra/prod
cp .env.prod.example .env.prod
$EDITOR .env.prod   # 填 NACOS_* 连接 + POSTGRES_* 初始化密码

docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
docker compose -f docker-compose.prod.yml logs -f server
```

健康检查（容器名 `qriter-prod-server`）：

```bash
curl http://localhost:3000/api/health
# 期望：{"status":"ok","info":{"database":{"status":"up"},"redis":{"status":"up"}}, ...}
```

## 环境变量（compose 用，尽量少）

| 变量 | 用途 | 生成 / 说明 |
|------|------|------|
| `NACOS_SERVER_ADDR` | server 连 Nacos | `host:8848` |
| `NACOS_USERNAME` / `NACOS_PASSWORD` | Nacos 鉴权 | 你的 Nacos 账号 |
| `NACOS_NAMESPACE` / `NACOS_GROUP` / `NACOS_DATA_ID` | 定位配置 | 有默认（public / DEFAULT_GROUP / qriter-server.yaml） |
| `POSTGRES_PASSWORD` | postgres 容器初始化密码 | `openssl rand -base64 24` |
| `POSTGRES_USER` / `POSTGRES_DB` | postgres 容器初始化 | 默认 qriter / qriter |
| `SERVER_PORT` | host 暴露端口 | 默认 3000，须与 Nacos 配置 `port` 一致 |

> server 不再需要 `DATABASE_URL` / `JWT_SECRET` / `REDIS_URL` 等环境变量——它们在 Nacos 里。

## Nacos 配置（dataId 内容为 YAML，必须事先在 Nacos 建好）

与本 compose 拓扑对齐的最小配置（`POSTGRES_*` 须与 `database.*` 一致）：

```yaml
node_env: production
port: 3000                 # 与 SERVER_PORT 右侧映射、healthcheck 一致
database:
  type: postgres
  host: postgres           # compose 服务名（容器网络内）
  port: 5432
  username: qriter         # = POSTGRES_USER
  password: <同 POSTGRES_PASSWORD>
  database: qriter         # = POSTGRES_DB
  synchronize: false
  autoLoadEntities: true
jwt:
  secret: <openssl rand -base64 48>
  expires: 7d
redis:
  url: redis://redis:6379  # compose 服务名
# llm:                     # 可选，agent 模型凭证
#   provider: openai
#   model: gpt-4o-mini
#   apiKey: sk-...
```

## 数据库迁移

prod 路径 `migrationsRun: false`（启动不自动迁移）。在「有 repo + dev 依赖、且能连到 Nacos
和目标库」的运维 / CI 机器上跑（`.env` 指向 prod 的 `NACOS_*`，迁移 CLI 会从 Nacos 取 database 切片）：

```bash
# 该机器的 apps/server/.env 里填 prod NACOS_*（指向 prod Nacos dataId）
pnpm migration run
pnpm migration show   # 确认状态
```

> prod runtime 镜像只含运行时闭包（无 tsx / typeorm CLI），不在容器内跑迁移。
> 后续计划：加 migration init 容器，或 CI 部署流水线里跑迁移。

## 数据存放

- `postgres-data` volume：Postgres 数据
- `redis-data` volume：Redis AOF/RDB

升级 / 重启：`docker compose up -d` 复用 volume；`down -v` 会清空，请先备份：

```bash
docker compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U $POSTGRES_USER $POSTGRES_DB > backup-$(date +%F).sql
```

## 端口

默认仅 server `3000` 暴露到 host；Postgres / Redis 端口在 compose 内部网络内（更安全）。
如需 host 端口（调试）：取消 compose 文件中 `ports:` 注释。

## 暂不在范围内

- 多机部署 / k8s / Helm
- Sentinel / Cluster Redis HA
- TLS 终结（Nginx / Caddy 反代）—— 自行外接
- 监控（Sentry / OTel / Grafana）
