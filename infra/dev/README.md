# qriter 本地开发依赖（dev infra）

仅供本地开发使用。生产部署见 `infra/prod/`。

## 起停

```bash
pnpm dev:db:up       # 启动 postgres + redis（后台）
pnpm dev:db:logs     # 跟随 postgres 日志
pnpm dev:db:down     # 停止（保留数据）
pnpm dev:db:reset    # 停止并清空 volume（破坏数据）
```

## 默认连接

| 服务 | 容器 | 宿主端口 | 连接字符串 |
|------|------|---------|-----------|
| Postgres | `qriter-dev-postgres` | `5433` | `postgresql://qriter:qriter@localhost:5433/qriter` |
| Redis | `qriter-dev-redis` | `6380` | `redis://localhost:6380` |

注：Redis 宿主端口是 **6380**（容器内仍 6379），避免与本机其它项目的 redis 6379 冲突。

## 端口冲突

默认宿主端口已是 Postgres `5433` / Redis `6380`（避开本机常见的 5432 / 6379）。
如果这两个端口也被占用，改 `宿主端口:容器端口` 左侧即可（容器内端口不变）：

```yaml
# docker-compose.dev.yml
services:
  postgres:
    ports:
      - "5434:5432"   # 改宿主端口（容器内仍 5432）
  redis:
    ports:
      - "6381:6379"   # 改宿主端口（容器内仍 6379）
```

同步在 `apps/server/config/application.local.yml`（个人覆盖，已 gitignore）改对应端口：

```yaml
database:
  port: 5434
redis:
  url: redis://localhost:6381
```

## 健康检查排查

```bash
docker exec qriter-dev-postgres pg_isready -U qriter -d qriter
docker exec qriter-dev-redis redis-cli ping
docker inspect qriter-dev-postgres --format='{{.State.Health.Status}}'
docker inspect qriter-dev-redis    --format='{{.State.Health.Status}}'
```

## 数据存放

- `qriter-dev-postgres-data` volume：Postgres 数据，`dev:db:reset` 会清空
- `qriter-dev-redis-data` volume：Redis AOF/RDB，`dev:db:reset` 会清空

## Redis 是否必需

不是。server 的 `CommonModule.forRootAsync` 在 `config.redis` 未配置（application.yml 里 redis 整块注释）时回退到 memory 兜底（进程内互斥锁 + LRU 缓存），开发体验完全相同。Redis 容器仅在以下场景需要：

- 跑 e2e 的 redis 链路（`describe.each([["memory"], ["redis"]])` 中的 redis case）
- 模拟多节点 / 多 server 实例共享锁与缓存
