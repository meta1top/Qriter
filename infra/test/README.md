# qriter e2e / 测试依赖（test infra）

一次性的本地 Postgres + Redis，**给 e2e 用**（e2e 在其中建/删一次性 `test_*` schema，不该指向真库）。生产部署见 `infra/prod/`。

> **为什么不叫 dev**：dev 运行 / `pnpm migration run` 的数据库连接走 **Nacos**（或 `conf/application.yml` 回退），不需要本地库；原 `pnpm dev:db:*` 脚本已移除。这套容器现仅服务测试，故归 `infra/test/`。直接用 docker compose 起停：

## 起停

```bash
docker compose -f infra/test/docker-compose.test.yml up -d             # 启动 postgres + redis（后台）
docker compose -f infra/test/docker-compose.test.yml logs -f postgres  # 跟随 postgres 日志
docker compose -f infra/test/docker-compose.test.yml down              # 停止（保留数据）
docker compose -f infra/test/docker-compose.test.yml down -v           # 停止并清空 volume（破坏数据）
```

## 默认连接

| 服务 | 容器 | 宿主端口 | 连接字符串 |
|------|------|---------|-----------|
| Postgres | `qriter-test-postgres` | `5433` | `postgresql://qriter:qriter@localhost:5433/qriter` |
| Redis | `qriter-test-redis` | `6380` | `redis://localhost:6380` |

注：Redis 宿主端口是 **6380**（容器内仍 6379），避免与本机其它项目的 redis 6379 冲突。

## 端口冲突

默认宿主端口已是 Postgres `5433` / Redis `6380`（避开本机常见的 5432 / 6379）。
如果这两个端口也被占用，改 `宿主端口:容器端口` 左侧即可（容器内端口不变）：

```yaml
# docker-compose.test.yml
services:
  postgres:
    ports:
      - "5434:5432"   # 改宿主端口（容器内仍 5432）
  redis:
    ports:
      - "6381:6379"   # 改宿主端口（容器内仍 6379）
```

同步在 `apps/server/conf/application.local.yml`（个人覆盖，已 gitignore）改对应端口：

```yaml
database:
  port: 5434
redis:
  url: redis://localhost:6381
```

## 健康检查排查

```bash
docker exec qriter-test-postgres pg_isready -U qriter -d qriter
docker exec qriter-test-redis redis-cli ping
docker inspect qriter-test-postgres --format='{{.State.Health.Status}}'
docker inspect qriter-test-redis    --format='{{.State.Health.Status}}'
```

## 数据存放

- `qriter-test-postgres-data` volume：Postgres 数据，`down -v` 会清空
- `qriter-test-redis-data` volume：Redis AOF/RDB，`down -v` 会清空

## Redis 是否必需

不是。server 的 `CommonModule.forRootAsync` 在 `config.redis` 未配置（application.yml 里 redis 整块注释）时回退到 memory 兜底（进程内互斥锁 + LRU 缓存），开发体验完全相同。Redis 容器仅在以下场景需要：

- 跑 e2e 的 redis 链路（`describe.each([["memory"], ["redis"]])` 中的 redis case）
- 模拟多节点 / 多 server 实例共享锁与缓存
