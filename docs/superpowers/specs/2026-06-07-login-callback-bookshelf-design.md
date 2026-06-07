# 登录 / 谷歌回调 / 书籍管理页 — 设计 Spec

- 日期：2026-06-07
- 状态：已评审（逐节确认），待拆实现 plan
- 上游：`docs/superpowers/specs/2026-06-07-ui-design-language-design.md`（设计语言 + 布局系统总 spec）的 **§12 第 ② 块（SSR 鉴权门路由组 + 登录前 split-brand）+ 第 ③ 块（登录后 shell + 书架）**，合成一份实现切片。
- 前置已就绪：①「设计 token + 暖纸主题 + 组件补齐」已落地（`@qriter/design` 含 Dialog/Sheet/Tabs/Avatar/ScrollArea/Skeleton/Toaster/Resizable/Badge/Separator）；谷歌登录后端（`POST /api/auth/google`、`GET /api/auth/profile`、`GET /api/auth/ws-ticket`）与前端鉴权传输（Next `proxy.ts` 透明代理 + httpOnly cookie + 4 个 cookie route handler + `/auth/google` 回调换码）均已上线。
- 范围：把扁平的 `apps/web` 路由改造为 **SSR 路由组鉴权门**，登录前套 **split-brand 视觉**，登录后落 **真实书架（书籍管理页）**，并补一个**薄 BookController** 把已就绪的 `BookService` 暴露为 HTTP。

## 1. 目标

- 鉴权改服务端权威、无闪烁：客户端 `AuthGuard` → App Router 路由组 `(auth)` / `(app)` 的 server component SSR 门。
- 登录前套精致 split-brand（品牌左 + 表单右），登录页 / 谷歌回调页复用同一 chrome。
- 登录后落地真实「书籍管理页」（书架）：列我的书、新建、改名/改状态、删除，全部接真实后端。
- 暴露薄 BookController（接已写好的 `BookService`），书架数据真实化。
- 点开一本书进入工作台 `/books/[id]` 的**最小占位页**，保证导航闭环（三栏工作台是下游 block ④）。

## 2. 架构方案

**SSR 路由组鉴权门 + 薄 BookController。** 与上游 spec §4 一致：server component 用 `cookies()` 读 httpOnly `qriter_token`，服务端直连 Nest 取 profile，权威判定后渲染或 `redirect()`。

**否掉的备选：** 用 `proxy.ts`（Next middleware 约定）做重定向门。middleware 在 edge 运行、拿不到 profile（需额外往 Nest 发一跳且难优雅处理 envelope），且会把已落地的「透明转发」职责与「鉴权门」职责混在一起。`proxy.ts` 维持纯转发不动。

## 3. 后端：薄 BookController（书架数据真实化）

新增 `apps/server/src/rest/book.controller.ts`，注入 `@qriter/book` 已 `exports` 的 `BookService`；加入 AppModule `controllers: [HealthController, AuthController, BookController]`（`BookModule` 已在 `imports`，无需改）。全局 `JwtAuthGuard`（`APP_GUARD`）默认保护，`@CurrentUser()` 取 `{ userId }`。

| 方法 | 端点 | BookService 调用 | 说明 |
|------|------|------------------|------|
| `GET` | `/api/books` | `listBooksByOwner(userId)` → `map(toProfile)` | 列我的书，按 `updatedAt` 倒序（service 已排序） |
| `POST` | `/api/books` | `createBook(userId, dto)` → `toProfile` | 建书（**仅书本身，0 章**；首章留给工作台），status 默认 `draft` |
| `PATCH` | `/api/books/:id` | `assertOwner(id, userId)` + `updateBook(id, dto)` → `toProfile` | 改名 / 改简介 / 改状态 |
| `DELETE` | `/api/books/:id` | `assertOwner(id, userId)` + `deleteBook(id)` | 删书（级联删章，service 内 `@Transactional`），返回 `{ ok: true }` |

- **DTO**：请求复用 `libs/book/src/dto/index.ts` 已有 `CreateBookDto` / `UpdateBookDto`。
- **响应 DTO**：补 `BookDto = createZodDto(BookSchema)`（放 `libs/book/src/dto/index.ts`），供 `@ApiOkResponse({ type: BookDto })` / `@ApiOkResponse({ type: [BookDto] })` 标注。当前只有 Create/Update，无响应 DTO。
- **envelope**：沿用全局响应拦截器包 `{ success, data }`，前端 `unwrapEnvelope` 解包；数组照常。
- **归属校验**：PATCH / DELETE 前 `assertOwner`，非本人书抛 `BOOK_FORBIDDEN`（error-code 已存在，`libs/book` 区段内），不存在抛 `BOOK_NOT_FOUND`。
- **Swagger**：`@ApiTags("books")` + 各方法 `@ApiOperation`，与 AuthController 风格一致。
- **测试**：e2e（含 Postgres service）覆盖 list 只见本人书 / 建 / 改 / 删 / 越权 403 / 未登录 401。

## 4. 前端骨架：SSR 路由组 + 客户端水合

把 `apps/web/src/app` 由扁平改成两个路由组（路由组括号 **不改 URL**）：

```
app/
├── layout.tsx               RootLayout：保留 IntlProvider + TooltipProvider + Providers(QueryClient+Jotai)，移除 <AuthGuard>
├── (auth)/
│   ├── layout.tsx           server：getServerProfile()，有 profile 则 redirect("/")；否则渲染 split-brand chrome（BrandPanel + 右 slot）+ children
│   ├── login/page.tsx       ← 现 app/login/page.tsx（restyle，见 §5）
│   └── auth/google/page.tsx ← 现 app/auth/google/page.tsx（回调换码，restyle）
├── (app)/
│   ├── layout.tsx           server：getServerProfile()，无 profile 则 redirect("/login")；否则渲染 TopBar shell + <AuthHydrator user> + children
│   ├── page.tsx             书架（← 现 app/page.tsx 占位重写为 BookGrid，见 §6）
│   └── books/[id]/page.tsx  工作台 stub（见 §7）
└── api/auth/*               4 个 cookie route handler 不动（/api 不受路由组影响）
```

- **新增 `apps/web/src/lib/server-auth.ts`**：`getServerProfile(): Promise<Account | null>` —— 用 `cookies()`（`next/headers`）读 `qriter_token`，服务端 `fetch` 到 `NEST_INTERNAL_URL` 的 `/api/auth/profile`（带 `Authorization: Bearer <token>` 头、`cache: "no-store"`），解 envelope 取 `data`；无 token / 非 2xx / envelope `success===false` 一律返回 `null`。两组 layout 共用。`NEST_INTERNAL_URL` 已被 `proxy.ts` / route handler 使用（默认 `http://127.0.0.1:3000`）。
- **服务端直连 Nest**（`NEST_INTERNAL_URL`），不走 `proxy.ts`（proxy 只拦浏览器 `/api/*`）。
- **客户端水合**：新增极薄 client 组件 `apps/web/src/components/app/auth-hydrator.tsx`（`<AuthHydrator user={profile}>`），`useEffect` 把 server 取到的 profile 写进现有 `currentUserAtom`，供 `AccountMenu` 及后续 agent 读取。`(app)/layout` 渲染它。
- **移除**：`apps/web/src/components/auth-guard.tsx` 文件 + `providers.tsx` 里的 `<AuthGuard>` 包裹（`Providers` 仅保留 QueryClient + Jotai）。apiClient 响应拦截器的 401 → 跳 `/login` 保留作客户端兜底。
- **route 迁移**：`app/login/` → `app/(auth)/login/`；`app/auth/google/` → `app/(auth)/auth/google/`；`app/page.tsx` → `app/(app)/page.tsx`。

## 5. 登录前 split-brand（`(auth)`）

- `(auth)/layout.tsx`（server）= 共享 chrome：
  - **左 ~44% 品牌墙**（抽 `apps/web/src/components/auth/brand-panel.tsx`，纯展示）：暖渐变 `#efe6d8 → #caa07e → #b5654a`，大宋体「Qriter」+ 文学 slogan（如「落笔之前，先与 agent 聊聊。」走 i18n）。暗色用更深暖渐变。
  - **右侧 slot**：渲染 `login` 或 `auth/google`。
  - 移动端：品牌墙塌成顶部窄条，表单占主（响应式断点）。
- **`login/page.tsx` restyle**：登录逻辑（`useLogin` + email/password `Form`/`FormItem` + Google 按钮 `window.location.href="/api/auth/google"`）**完全不动**，仅套新 token + 去掉自带的 `min-h-screen` 居中 `<main>`，改为填充右 slot。陶土主按钮「登录」+ 描边「使用 Google 登录」。
- **`auth/google/page.tsx` restyle**：换码逻辑（`POST /api/auth/google/code` + 写 `currentUserAtom` + `router.replace("/")`）**完全不动**，仅把「登录中…」转圈 / 失败态视觉套进右 slot。
- 因 SSR 门已在 `(auth)/layout` 做「有 profile → `/`」重定向，登录页不再需要客户端「已登录跳首页」逻辑。

## 6. 登录后书架（`(app)/page.tsx`）

- **TopBar**（`apps/web/src/components/app/top-bar.tsx`）：左宋体「Qriter」品牌；右 `AccountMenu`。本轮**不做搜书框**（YAGNI，留 block ③ 后续）。
- **AccountMenu**（`apps/web/src/components/app/account-menu.tsx`）：`Avatar` + `DropdownMenu`：
  - 统计 `/stats`、模型设置 `/settings/model`、账号设置 `/settings/account` → **本轮指向最小占位 stub 页**（不隐藏，保持菜单完整 + 导航闭环；真实页属 block ⑥）。
  - **退出**：调现有 `useLogout`（清 cookie → 跳 `/login`）。
- **BookGrid**（`apps/web/src/components/app/book-grid.tsx`）：自适应网格，react-query `GET /api/books`。
  - **BookCard**（`apps/web/src/components/app/book-card.tsx`）：书脊渐变封面（按 `title` 确定性取色，纯函数 `bookSpineColor(title)`）+ 宋体书名 + 状态 chip（草稿 / 写作中 / 完结，`Badge` + `accent-tint`）+「更新于 X」（相对时间）+ 简介摘要（无简介则省略）。整卡点击 → `router.push(`/books/${id}`)`。卡片右上 `DropdownMenu`：编辑 / 删除（`stopPropagation` 不触发整卡跳转）。
  - **「＋ 新建书籍」虚线卡**：点开 `Dialog` —— 书名（必填）+ 简介（可选）`Form`（`useSchema(CreateBookSchema)`）→ `POST /api/books` → 成功 `invalidateQueries(['books'])` + `toast` 成功。
  - **编辑**：`Dialog` 复用同表单（预填 title/description + status `Select`）→ `PATCH /api/books/:id`。
  - **删除**：`Dialog` 二次确认 → `DELETE /api/books/:id` → invalidate + `toast`。
  - **空态**：无书时居中**简洁文案 + 「创建第一本书」CTA**（不引入插画素材，YAGNI）。
  - **加载态**：`Skeleton` 书卡占位若干。
- **新增 `apps/web/src/rest/books.ts`**：`useBooks()` / `useCreateBook()` / `useUpdateBook()` / `useDeleteBook()`（react-query，query key `['books']`），经同源 `/api/books`（`proxy.ts` 加 Bearer 转发 Nest）。

## 7. 工作台 stub（`(app)/books/[id]/page.tsx`）

最小占位页：取书（客户端 `useBook(id)` 或服务端取）→ 宋体书名 +「工作台建设中」+ `‹ 书架` 返回链接。保证「点书 → 进 `/books/[id]`」导航闭环真实；三栏 ChapterNav + EditorCanvas + AgentDock 由下游 block ④ 填充。书不存在 / 越权 → 友好提示或回书架。

## 8. i18n / 测试 / 边界

- **i18n**：所有可见串走 next-intl key（`auth.*` 已有部分；新增 `shelf.*` / `book.*` / `account.*` / `workspace.*` 等命名空间），`pnpm sync:locales -- --check` 必过，**禁裸串**。
- **测试**：后端 BookController e2e（list / 建 / 改 / 删 / 越权 403 / 未登录 401）；前端以 `pnpm --filter @qriter/web build` 构建冒烟为主（`packages`/`apps/web` 无 jest），纯函数（如 `bookSpineColor`）可单测。
- **围栏**：后端改动跑 `pnpm check`（check:repo —— BookController 不得直接注入 Repository，只经 BookService ✅；check:naming / check:error-code 等）。
- **本轮边界（非目标）**：
  - 工作台三栏 + 编辑器引擎（block ④）。
  - `AgentDock` 悬浮球 / 停靠（block ⑤）—— 本轮书架 / 工作台 stub **先不挂悬浮球**。
  - 统计 + 设置真实页（block ⑥）—— 本轮仅占位 stub。
  - 章数 · 字数聚合（新书都 0 章，等 block ④ 有真实章节再加聚合端点）。
  - 搜书 / Command。

## 9. 成功标准

- 未登录访问任意 `(app)` 路由 → SSR 重定向 `/login`，无登录态闪烁；已登录访问 `(auth)` → 重定向 `/`。
- 登录前 split-brand 套暖纸 token；密码登录 / Google 登录 / 回调换码全程不回归（逻辑未动）。
- 书架显示当前账号真实书籍；新建 / 改名改状态 / 删除真生效并即时刷新。
- 点书进入 `/books/[id]` stub，可返回书架。
- 客户端 `AuthGuard` 已移除，`currentUserAtom` 由 SSR profile 水合。
- `pnpm typecheck` / `pnpm check` / `pnpm sync:locales --check` / `pnpm --filter @qriter/web build` 全绿；BookController e2e 通过。

## 10. 文件清单（落地参考）

**后端（新增/改）**
- 新增 `apps/server/src/rest/book.controller.ts`
- 改 `apps/server/src/app.module.ts`（`controllers` 加 `BookController`）
- 改 `libs/book/src/dto/index.ts`（加 `BookDto = createZodDto(BookSchema)` 响应 DTO）
- 新增 BookController e2e 测试

**前端（新增/改/迁/删）**
- 新增 `apps/web/src/lib/server-auth.ts`（`getServerProfile`）
- 新增 `apps/web/src/app/(auth)/layout.tsx`、`apps/web/src/app/(app)/layout.tsx`
- 迁 `app/login/` → `app/(auth)/login/`、`app/auth/google/` → `app/(auth)/auth/google/`、`app/page.tsx` → `app/(app)/page.tsx`（重写为书架）
- 新增 `apps/web/src/app/(app)/books/[id]/page.tsx`（工作台 stub）
- 新增 `apps/web/src/components/auth/brand-panel.tsx`
- 新增 `apps/web/src/components/app/{top-bar,account-menu,auth-hydrator,book-grid,book-card}.tsx`
- 新增 `apps/web/src/rest/books.ts`（react-query hooks）
- 新增 `apps/web/src/lib/book-spine.ts`（`bookSpineColor` 纯函数）
- 改 `apps/web/src/components/providers.tsx`（移除 `<AuthGuard>`）
- 删 `apps/web/src/components/auth-guard.tsx`
- 改 / 新增 i18n messages（zh / en）：`shelf.*` / `book.*` / `account.*` / `workspace.*`
- 改 `apps/web/.env.example`（确认 `NEST_INTERNAL_URL` 已在；server-auth 复用）
