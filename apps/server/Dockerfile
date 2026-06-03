# qriter server 多阶段 Dockerfile。
#
# 关键技巧：runtime 用 `pnpm deploy --filter @qriter/server` 把 server 单包的
# prod deps（含 workspace 依赖）拷成独立 node_modules，避免拉入根 dev 依赖。
#
# 构建（在 repo root）：
#   docker build -f apps/server/Dockerfile -t qriter/server:local .
# 起动：
#   docker run --rm -p 3000:3000 \
#     -e DATABASE_URL=postgresql://qriter:qriter@host.docker.internal:5432/qriter \
#     -e JWT_SECRET=local-test-secret-min-16 \
#     qriter/server:local

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
ENV NODE_ENV=production \
    PORT=3000

# 仅 copy deploy 产物，根 monorepo 不进 runtime
COPY --from=build /out ./

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "dist/main.js"]
