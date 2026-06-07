# qriter web 多阶段 Dockerfile（Next.js standalone）。
#
# 解析：web 依赖 @qriter/types、@qriter/web-common（exports 指向 dist → 需先 build）、
# @qriter/design（exports 指向 src，在 next.config transpilePackages 里 → Next 从源码编译，无需 build）。
# 故 build 阶段顺序：types → web-common → next build。
#
# 构建（在 repo root）：
#   docker build -f apps/web/Dockerfile -t qriter/web:local .
# 起动（web 通过 NEST_INTERNAL_URL 访问 Nest server）：
#   docker run --rm -p 3001:3001 -e NEST_INTERNAL_URL=http://server-host:3000 qriter/web:local
# 一键编排见 apps/web/docker-compose.yml。

# ============ Stage 1: deps ===============================================
FROM node:22-alpine AS deps
RUN corepack enable
WORKDIR /repo

# 只 copy lockfile + workspace 元数据 + 各 package.json，最大化 layer 缓存
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json          ./apps/web/
COPY libs/types/package.json        ./libs/types/
COPY packages/design/package.json   ./packages/design/
COPY packages/web-common/package.json ./packages/web-common/

RUN pnpm install --frozen-lockfile --ignore-scripts

# ============ Stage 2: build ===============================================
FROM deps AS build
COPY tsconfig.base.json ./
COPY libs/types          ./libs/types
COPY packages/design     ./packages/design
COPY packages/web-common ./packages/web-common
COPY apps/web            ./apps/web

# types / web-common 产出 dist（web 经 exports 引 dist）；design 由 Next transpile 源码，无需 build。
RUN pnpm --filter @qriter/types build \
 && pnpm --filter @qriter/web-common build \
 && pnpm --filter @qriter/web build

# ============ Stage 3: runtime（Next standalone）==========================
FROM node:22-alpine AS runtime
WORKDIR /app
# NODE_ENV=production：Next 运行时优化。运行模式是「部署环境身份」，业务配置不在这里。
ENV NODE_ENV=production
# 监听 0.0.0.0:3001（容器内）。NEST_INTERNAL_URL 运行时由 compose / -e 注入（不烤进镜像）。
ENV PORT=3001
ENV HOSTNAME=0.0.0.0

# Next standalone：server.js + 已 trace 的最小 node_modules（含 monorepo 结构 apps/web/）。
COPY --from=build /repo/apps/web/.next/standalone ./
# 静态资源 standalone 不含，需单独补到 apps/web/.next/static（server.js 从 /app 以 node apps/web/server.js 起）。
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
# 注：apps/web 无 public 目录，故不 copy public。

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s --start-period=8s --retries=3 \
  CMD wget -qO- http://localhost:3001/login >/dev/null 2>&1 || exit 1

CMD ["node", "apps/web/server.js"]
