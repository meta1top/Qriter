# qriter server 多阶段 Dockerfile。
#
# 关键技巧：runtime 用 `pnpm deploy --filter @qriter/server` 把 server 单包的
# prod deps（含 workspace 依赖）拷成独立 node_modules，避免拉入根 dev 依赖。
#
# 构建（在 repo root）：
#   docker build -f apps/server/Dockerfile -t qriter/server:local .
# 起动（业务配置走 Nacos —— 只传 Nacos 连接信息）：
#   docker run --rm -p 3000:3000 \
#     -e NACOS_SERVER_ADDR=host.docker.internal:8848 \
#     -e NACOS_USERNAME=nacos -e NACOS_PASSWORD=... \
#     -e NACOS_DATA_ID=qriter-server.yaml \
#     qriter/server:local
# （database / jwt / redis / llm / port 全在 Nacos 的 dataId 里。）
# 一键编排（含 env-file）见 apps/server/docker-compose.yml；部署说明见 apps/server/DEPLOY.md。

# ============ Stage 1: deps ===============================================
FROM node:22-alpine AS deps
RUN corepack enable
WORKDIR /repo

# 只 copy lockfile + workspace 元数据 + 各 package.json，最大化 layer 缓存
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/server/package.json ./apps/server/
COPY libs/shared/package.json  ./libs/shared/
COPY libs/types/package.json   ./libs/types/
COPY libs/account/package.json ./libs/account/
COPY libs/book/package.json    ./libs/book/
COPY libs/agent/package.json   ./libs/agent/

RUN pnpm install --frozen-lockfile --ignore-scripts

# ============ Stage 2: build ===============================================
FROM deps AS build
COPY tsconfig.base.json ./
COPY libs/shared  ./libs/shared
COPY libs/types   ./libs/types
COPY libs/account ./libs/account
COPY libs/book    ./libs/book
COPY libs/agent   ./libs/agent
COPY apps/server  ./apps/server

RUN pnpm --filter @qriter/types build \
 && pnpm --filter @qriter/shared build \
 && pnpm --filter @qriter/account build \
 && pnpm --filter @qriter/book build \
 && pnpm --filter @qriter/agent build \
 && pnpm --filter @qriter/server build

# 用 pnpm deploy 提取 server 的 prod 闭包到 /out
# --legacy 保留 node_modules/.pnpm 软链结构；--no-optional 不带 typeorm 等
# peer / optional 拉进来的其它 db 驱动
RUN pnpm --filter @qriter/server deploy \
      --prod --legacy --no-optional /out

# 单独 copy dist（deploy 不带源码 build 产物，只带 deps）。
# i18n 已由 nest build 的 assets 写进 dist/i18n（与运行时 I18nModule loader
# path = __dirname/i18n、__dirname=/app/dist 一致），随 dist 一并拷入，无需单独 copy。
RUN cp -r /repo/apps/server/dist /out/dist \
 && cp -r /repo/libs/shared/dist  /out/node_modules/@qriter/shared/dist \
 && cp -r /repo/libs/types/dist   /out/node_modules/@qriter/types/dist \
 && cp -r /repo/libs/account/dist /out/node_modules/@qriter/account/dist \
 && cp -r /repo/libs/book/dist    /out/node_modules/@qriter/book/dist \
 && cp -r /repo/libs/agent/dist   /out/node_modules/@qriter/agent/dist

# ============ Stage 3: runtime ============================================
FROM node:22-alpine AS runtime
WORKDIR /app
# NODE_ENV 决定 app 运行模式（isProd → 不自动迁移 / 不挂 Swagger），prod 镜像烤 production；
# 部分依赖也按它优化。运行模式是「部署环境身份」，不放 Nacos 业务配置。
# 不设 PORT —— server 监听 config.port（须为 3000，与 EXPOSE / healthcheck 一致）。
ENV NODE_ENV=production

# 仅 copy deploy 产物，根 monorepo 不进 runtime
COPY --from=build /out ./

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "dist/main.js"]
