# qriter web 部署（apps/web）

单容器部署 Next.js 前端（standalone 形态）。web 只通过 `NEST_INTERNAL_URL` 访问 Nest server——server / pg / redis 都在别处独立部署。

## 起动

```bash
cd apps/web
cp .env.prod.example .env.prod
$EDITOR .env.prod   # 填 NEST_INTERNAL_URL 指向 server 实际地址

docker compose --env-file .env.prod up -d --build
docker compose logs -f web
```

容器名 `qriter-web`，Dockerfile 内置 healthcheck（`/login`）。默认 host 暴露 `3001`。

## 环境变量

| 变量 | 用途 | 说明 |
|------|------|------|
| `NEST_INTERNAL_URL` | web→server 内网地址 | `proxy.ts` 转发 `/api/*` + SSR 取 profile 用；指向 server 实际可达地址 |
| `WEB_PORT` | host 暴露端口 | 默认 3001 |

> web 自身无业务配置 —— 它把 `/api/*` 透明代理到 `NEST_INTERNAL_URL` 的 server，鉴权 cookie 在 web ⇄ server 之间流转（见 `apps/web/src/proxy.ts`）。

## 构建说明（Next standalone）

- `next.config.ts` 设 `output: "standalone"` —— `next build` 产出自包含的 `.next/standalone`（含 `apps/web/server.js` + 已 trace 的最小 `node_modules`）。
- Dockerfile build 阶段先 build `@qriter/types`、`@qriter/web-common`（exports 指 dist），`@qriter/design` 由 Next transpile 源码（无需 build）。
- runtime 阶段 copy `standalone` + 单独补 `.next/static`，`node apps/web/server.js` 启动。

## 暂不在范围内

- CDN / 静态资源外置
- TLS 终结（反代自行外接）
- server 后端部署见 `apps/server/DEPLOY.md`
