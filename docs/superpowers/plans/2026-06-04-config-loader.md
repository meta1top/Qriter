# ConfigLoader（本地 YAML + Nacos）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 引入引导式配置加载——env 仅携带 Nacos 连接信息，应用配置启动时从本地 YAML（开发）或 Nacos（部署）拉取并写入 `process.env`，复用现有 `EnvSchema` 校验。

**Architecture:** 新增纯函数 `loadAppConfig()`（`libs/shared/src/config/`），在 `apps/server/src/main.ts` 的 `NestFactory.create(AppModule)` 之前 `await` 调用。它按「NACOS_SERVER_ADDR 存在与否」选源，把嵌套配置拍平成 `UPPER_SNAKE` 写入 env（已存在的 key 不覆盖 = env 优先），之后现有 `ConfigModule` + `EnvSchema` 照常 fail-fast 校验。`app.module.ts` / `env.schema.ts` 完全不改。

**Tech Stack:** TypeScript（NodeNext）、Zod、`nacos@^2`（NacosConfigClient）、`js-yaml@^4`、`dotenv@^17`、Jest（ts-jest）。

**约定：** 所有 commit 用 conventional commits（type 英文、body 中文），并以 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` 结尾。设计依据见 `docs/superpowers/specs/2026-06-04-config-loader-design.md`。

**关键事实（实现前必读）：**
- `jest.config.ts` 用 `moduleNameMapper` 把 `@qriter/*` 映射到**源码**，ts-jest 用 `tsconfig.base.json` 编译；spec 与源码同目录（`*.spec.ts`）。
- `libs/shared` 目前**无任何 spec**，本计划建立第一批；并给 `libs/shared/tsconfig.json` 加 `src/**/*.spec.ts` 排除，避免 spec 进入 `dist`。
- 拍平规则「嵌套路径段用 `_` 连接 + 全大写」正好命中现有 `EnvSchema` 的 key（`database.url`→`DATABASE_URL`），零手工映射表。
- 优先级：真实 env / `.env` 文件 > Nacos/YAML 配置源 > `EnvSchema` 默认值。实现方式：合并时仅当 `env[key] === undefined` 才写入。

---

## File Structure

| 文件 | 职责 |
|---|---|
| `libs/shared/src/config/flatten.ts` | `flattenToEnv`：嵌套对象 → `{ UPPER_SNAKE: string }` |
| `libs/shared/src/config/flatten.spec.ts` | 单测 |
| `libs/shared/src/config/nacos-bootstrap.schema.ts` | `NacosBootstrapSchema` / `NacosBootstrap` / `readNacosBootstrap` |
| `libs/shared/src/config/nacos-bootstrap.schema.spec.ts` | 单测 |
| `libs/shared/src/config/yaml-source.ts` | `loadYamlConfig`：读 + 深合并本地 YAML |
| `libs/shared/src/config/yaml-source.spec.ts` | 单测 |
| `libs/shared/src/config/nacos-source.ts` | `loadNacosConfig`：从 Nacos 拉取 + 解析 |
| `libs/shared/src/config/nacos-source.spec.ts` | 单测（mock `nacos`） |
| `libs/shared/src/config/config-loader.ts` | `loadAppConfig`：编排选源 + 合并 |
| `libs/shared/src/config/config-loader.spec.ts` | 单测 |
| `libs/shared/src/config/index.ts` | barrel，新增 `loadAppConfig` 导出 |
| `libs/shared/package.json` | 加依赖 |
| `libs/shared/tsconfig.json` | 排除 spec |
| `apps/server/src/main.ts` | 接入 `loadAppConfig` |
| `apps/server/config/application.yml` | 提交，本地开发默认值 |
| `apps/server/.env.example` | 提交，NACOS_* 样例 |
| `.gitignore` | 忽略 `application.local.yml` |

---

## Task 1: 依赖与 tsconfig 准备

**Files:**
- Modify: `libs/shared/package.json`
- Modify: `libs/shared/tsconfig.json`

- [ ] **Step 1: 给 `libs/shared/package.json` 的 `dependencies` 加三项**（与现有 `dependencies` 字段内合并，保持字母/现状顺序即可）：

```jsonc
"dependencies": {
  "@qriter/types": "workspace:*",
  "async-mutex": "^0.5.0",
  "dotenv": "^17",
  "ioredis": "^5.10.1",
  "js-yaml": "^4",
  "lru-cache": "^11.0.0",
  "nacos": "^2",
  "zod": "^3"
}
```

- [ ] **Step 2: 给 `libs/shared/package.json` 的 `devDependencies` 加类型包**：

```jsonc
"devDependencies": {
  "@nestjs/platform-socket.io": "^11",
  "@nestjs/websockets": "^11",
  "@types/ioredis-mock": "^8.2.7",
  "@types/js-yaml": "^4",
  "@types/node": "^22",
  "ioredis-mock": "^8.13.1",
  "socket.io": "^4"
}
```

- [ ] **Step 3: 改 `libs/shared/tsconfig.json` 排除 spec（避免编译进 dist）**

把整个文件替换为：

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "composite": false,
    "declaration": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "src/**/*.spec.ts"]
}
```

> 说明：`exclude` 会覆盖 base 的 `exclude`，故需重新带上 `node_modules` / `dist`。spec 的类型检查由 jest（ts-jest）负责。

- [ ] **Step 4: 安装依赖**

Run: `pnpm install`
Expected: 安装成功，`node_modules/.pnpm` 下出现 `nacos@2.x`、`js-yaml@4.x`、`dotenv@17.x`。

- [ ] **Step 5: 验证依赖可解析**

Run: `node -e "require('nacos').NacosConfigClient; require('js-yaml').load; require('dotenv').config; console.log('ok')"`
Expected: 输出 `ok`（无 MODULE_NOT_FOUND）。

- [ ] **Step 6: Commit**

```bash
git add libs/shared/package.json libs/shared/tsconfig.json pnpm-lock.yaml
git commit -m "chore(shared): 引入 nacos / js-yaml / dotenv 依赖并排除 spec 构建"
```

---

## Task 2: `flattenToEnv`（嵌套 → UPPER_SNAKE）

**Files:**
- Create: `libs/shared/src/config/flatten.ts`
- Test: `libs/shared/src/config/flatten.spec.ts`

- [ ] **Step 1: 写失败的测试**

`libs/shared/src/config/flatten.spec.ts`：

```ts
import { flattenToEnv } from "./flatten";

describe("flattenToEnv", () => {
  it("保留已是扁平的 UPPER_SNAKE key", () => {
    expect(flattenToEnv({ DATABASE_URL: "x" })).toEqual({ DATABASE_URL: "x" });
  });

  it("把嵌套键拍平并大写（database.url → DATABASE_URL）", () => {
    expect(flattenToEnv({ database: { url: "x" } })).toEqual({
      DATABASE_URL: "x",
    });
  });

  it("把小写顶层键大写、把 number/boolean 字符串化", () => {
    expect(
      flattenToEnv({ node_env: "development", port: 3000, jwt: { secret: "s" } }),
    ).toEqual({ NODE_ENV: "development", PORT: "3000", JWT_SECRET: "s" });
  });

  it("跳过 null / undefined 叶子", () => {
    expect(flattenToEnv({ a: null, b: undefined, c: "x" })).toEqual({ C: "x" });
  });

  it("遇到数组叶子抛错", () => {
    expect(() => flattenToEnv({ hosts: ["a", "b"] })).toThrow(/数组/);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm exec jest libs/shared/src/config/flatten.spec.ts`
Expected: FAIL，报 `Cannot find module './flatten'`。

- [ ] **Step 3: 写最小实现**

`libs/shared/src/config/flatten.ts`：

```ts
/**
 * 把嵌套配置对象拍平成「UPPER_SNAKE = 字符串」的扁平 env 映射。
 *
 * 规则：嵌套路径段用 `_` 连接并整体大写（`database.url` → `DATABASE_URL`）；
 * 标量值字符串化（number / boolean → String()）；null / undefined 跳过。
 * 数组 / 非标量叶子不支持，遇到抛错（配置语义限定为「扁平标量」）。
 */
export function flattenToEnv(
  source: Record<string, unknown>,
  parentKey = "",
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    const pathKey = parentKey ? `${parentKey}_${key}` : key;
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      throw new Error(
        `[config-loader] 配置项 ${pathKey.toUpperCase()} 是数组，不支持（仅扁平标量）。`,
      );
    }
    if (typeof value === "object") {
      Object.assign(
        out,
        flattenToEnv(value as Record<string, unknown>, pathKey),
      );
      continue;
    }
    out[pathKey.toUpperCase()] = String(value);
  }
  return out;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm exec jest libs/shared/src/config/flatten.spec.ts`
Expected: PASS（5 个用例全绿）。

- [ ] **Step 5: Commit**

```bash
git add libs/shared/src/config/flatten.ts libs/shared/src/config/flatten.spec.ts
git commit -m "feat(shared): 新增 flattenToEnv 嵌套配置拍平工具"
```

---

## Task 3: Nacos 引导变量 schema

**Files:**
- Create: `libs/shared/src/config/nacos-bootstrap.schema.ts`
- Test: `libs/shared/src/config/nacos-bootstrap.schema.spec.ts`

- [ ] **Step 1: 写失败的测试**

`libs/shared/src/config/nacos-bootstrap.schema.spec.ts`：

```ts
import { readNacosBootstrap } from "./nacos-bootstrap.schema";

describe("readNacosBootstrap", () => {
  it("未设 NACOS_SERVER_ADDR → 返回 null（走 YAML 回退）", () => {
    expect(readNacosBootstrap({})).toBeNull();
  });

  it("设了 NACOS_SERVER_ADDR → 返回带默认值的引导配置", () => {
    expect(readNacosBootstrap({ NACOS_SERVER_ADDR: "127.0.0.1:8848" })).toEqual({
      serverAddr: "127.0.0.1:8848",
      namespace: "public",
      group: "DEFAULT_GROUP",
      dataId: "qriter-server.yaml",
      username: undefined,
      password: undefined,
    });
  });

  it("透传显式覆盖的 namespace / group / dataId / 鉴权", () => {
    expect(
      readNacosBootstrap({
        NACOS_SERVER_ADDR: "10.0.0.1:8848",
        NACOS_NAMESPACE: "prod",
        NACOS_GROUP: "QRITER",
        NACOS_DATA_ID: "server.yaml",
        NACOS_USERNAME: "nacos",
        NACOS_PASSWORD: "pass",
      }),
    ).toEqual({
      serverAddr: "10.0.0.1:8848",
      namespace: "prod",
      group: "QRITER",
      dataId: "server.yaml",
      username: "nacos",
      password: "pass",
    });
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm exec jest libs/shared/src/config/nacos-bootstrap.schema.spec.ts`
Expected: FAIL，报 `Cannot find module './nacos-bootstrap.schema'`。

- [ ] **Step 3: 写最小实现**

`libs/shared/src/config/nacos-bootstrap.schema.ts`：

```ts
import { z } from "zod";

/** Nacos 引导（bootstrap）配置 schema：namespace / group / dataId 带默认，鉴权可选。 */
export const NacosBootstrapSchema = z.object({
  serverAddr: z.string().min(1),
  namespace: z.string().default("public"),
  group: z.string().default("DEFAULT_GROUP"),
  dataId: z.string().default("qriter-server.yaml"),
  username: z.string().optional(),
  password: z.string().optional(),
});

export type NacosBootstrap = z.infer<typeof NacosBootstrapSchema>;

/**
 * 从 env 读取 Nacos 引导配置。
 *
 * - 未设 `NACOS_SERVER_ADDR` → 返回 `null`（调用方回退到本地 YAML）。
 * - 设了但其它字段非法 → 抛错并指出字段。
 */
export function readNacosBootstrap(
  env: Record<string, string | undefined>,
): NacosBootstrap | null {
  if (!env.NACOS_SERVER_ADDR) return null;
  const parsed = NacosBootstrapSchema.safeParse({
    serverAddr: env.NACOS_SERVER_ADDR,
    namespace: env.NACOS_NAMESPACE,
    group: env.NACOS_GROUP,
    dataId: env.NACOS_DATA_ID,
    username: env.NACOS_USERNAME,
    password: env.NACOS_PASSWORD,
  });
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - NACOS_${String(i.path[0])}: ${i.message}`)
      .join("\n");
    throw new Error(`[config-loader] Nacos 引导变量校验失败：\n${issues}`);
  }
  return parsed.data;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm exec jest libs/shared/src/config/nacos-bootstrap.schema.spec.ts`
Expected: PASS（3 个用例）。

- [ ] **Step 5: Commit**

```bash
git add libs/shared/src/config/nacos-bootstrap.schema.ts libs/shared/src/config/nacos-bootstrap.schema.spec.ts
git commit -m "feat(shared): 新增 Nacos 引导变量 schema 与读取"
```

---

## Task 4: `loadYamlConfig`（本地 YAML 读取 + 深合并）

**Files:**
- Create: `libs/shared/src/config/yaml-source.ts`
- Test: `libs/shared/src/config/yaml-source.spec.ts`

- [ ] **Step 1: 写失败的测试**

`libs/shared/src/config/yaml-source.spec.ts`：

```ts
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadYamlConfig } from "./yaml-source";

function writeTmp(name: string, content: string): string {
  const dir = mkdtempSync(join(tmpdir(), "qriter-yaml-"));
  const file = join(dir, name);
  writeFileSync(file, content, "utf8");
  return file;
}

describe("loadYamlConfig", () => {
  it("解析单个 YAML 成嵌套对象", () => {
    const base = writeTmp(
      "application.yml",
      "database:\n  url: postgresql://x\nport: 3000\n",
    );
    expect(loadYamlConfig([base])).toEqual({
      database: { url: "postgresql://x" },
      port: 3000,
    });
  });

  it("后者深合并覆盖前者（local 覆盖 base）", () => {
    const base = writeTmp(
      "application.yml",
      "database:\n  url: base\njwt:\n  secret: base-secret\n",
    );
    const local = writeTmp("application.local.yml", "database:\n  url: local\n");
    expect(loadYamlConfig([base, local])).toEqual({
      database: { url: "local" },
      jwt: { secret: "base-secret" },
    });
  });

  it("文件不存在 → 跳过（允许纯 env）", () => {
    expect(loadYamlConfig(["/no/such/file.yml"])).toEqual({});
  });

  it("顶层不是 map → 抛错", () => {
    const bad = writeTmp("bad.yml", "- a\n- b\n");
    expect(() => loadYamlConfig([bad])).toThrow(/顶层必须是对象/);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm exec jest libs/shared/src/config/yaml-source.spec.ts`
Expected: FAIL，报 `Cannot find module './yaml-source'`。

- [ ] **Step 3: 写最小实现**

`libs/shared/src/config/yaml-source.ts`：

```ts
import { readFileSync } from "node:fs";
import { load } from "js-yaml";

/** 深合并两个普通对象：后者覆盖前者，嵌套对象递归合并（数组按整体替换）。 */
function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const prev = out[key];
    const bothPlainObject =
      prev !== null &&
      typeof prev === "object" &&
      !Array.isArray(prev) &&
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value);
    out[key] = bothPlainObject
      ? deepMerge(
          prev as Record<string, unknown>,
          value as Record<string, unknown>,
        )
      : value;
  }
  return out;
}

/**
 * 读取一组本地 YAML 文件并深合并成嵌套配置对象。
 *
 * - 列表顺序 = 优先级从低到高（后面的文件覆盖前面的）。
 * - 文件不存在 → 跳过（允许纯 env 启动）。
 * - YAML 语法非法 / 顶层非对象 → 抛错。
 */
export function loadYamlConfig(paths: string[]): Record<string, unknown> {
  let merged: Record<string, unknown> = {};
  for (const filePath of paths) {
    let raw: string;
    try {
      raw = readFileSync(filePath, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw err;
    }
    const parsed = load(raw);
    if (parsed === null || parsed === undefined) continue;
    if (typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`[config-loader] YAML 文件 ${filePath} 顶层必须是对象（map）。`);
    }
    merged = deepMerge(merged, parsed as Record<string, unknown>);
  }
  return merged;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm exec jest libs/shared/src/config/yaml-source.spec.ts`
Expected: PASS（4 个用例）。

- [ ] **Step 5: Commit**

```bash
git add libs/shared/src/config/yaml-source.ts libs/shared/src/config/yaml-source.spec.ts
git commit -m "feat(shared): 新增 loadYamlConfig 本地 YAML 读取与深合并"
```

---

## Task 5: `loadNacosConfig`（Nacos 拉取 + 解析）

**Files:**
- Create: `libs/shared/src/config/nacos-source.ts`
- Test: `libs/shared/src/config/nacos-source.spec.ts`

- [ ] **Step 1: 写失败的测试（mock `nacos`）**

`libs/shared/src/config/nacos-source.spec.ts`：

```ts
import { loadNacosConfig } from "./nacos-source";
import type { NacosBootstrap } from "./nacos-bootstrap.schema";

const ready = jest.fn().mockResolvedValue(undefined);
const getConfig = jest.fn();
const ctor = jest.fn();

jest.mock("nacos", () => ({
  NacosConfigClient: jest.fn().mockImplementation((opts) => {
    ctor(opts);
    return { ready, getConfig };
  }),
}));

const bootstrap: NacosBootstrap = {
  serverAddr: "127.0.0.1:8848",
  namespace: "public",
  group: "DEFAULT_GROUP",
  dataId: "qriter-server.yaml",
  username: undefined,
  password: undefined,
};

beforeEach(() => {
  ready.mockClear();
  getConfig.mockReset();
  ctor.mockClear();
});

describe("loadNacosConfig", () => {
  it("拉取 YAML 内容并解析成嵌套对象", async () => {
    getConfig.mockResolvedValue("database:\n  url: postgresql://nacos\n");
    await expect(loadNacosConfig(bootstrap)).resolves.toEqual({
      database: { url: "postgresql://nacos" },
    });
    expect(ready).toHaveBeenCalledTimes(1);
    expect(getConfig).toHaveBeenCalledWith("qriter-server.yaml", "DEFAULT_GROUP");
    expect(ctor).toHaveBeenCalledWith(
      expect.objectContaining({ serverAddr: "127.0.0.1:8848", namespace: "public" }),
    );
  });

  it("设了鉴权 → 把 username/password 传给 client", async () => {
    getConfig.mockResolvedValue("port: 3000\n");
    await loadNacosConfig({ ...bootstrap, username: "nacos", password: "pass" });
    expect(ctor).toHaveBeenCalledWith(
      expect.objectContaining({ username: "nacos", password: "pass" }),
    );
  });

  it("配置为空 → 抛错", async () => {
    getConfig.mockResolvedValue("");
    await expect(loadNacosConfig(bootstrap)).rejects.toThrow(/Nacos 配置为空/);
  });

  it("拉取异常 → 抛错并带定位信息", async () => {
    getConfig.mockRejectedValue(new Error("timeout"));
    await expect(loadNacosConfig(bootstrap)).rejects.toThrow(/拉取配置失败/);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm exec jest libs/shared/src/config/nacos-source.spec.ts`
Expected: FAIL，报 `Cannot find module './nacos-source'`。

- [ ] **Step 3: 写最小实现**

`libs/shared/src/config/nacos-source.ts`：

```ts
import { load } from "js-yaml";
import { NacosConfigClient } from "nacos";
import type { NacosBootstrap } from "./nacos-bootstrap.schema";

/**
 * 从 Nacos 配置中心拉取配置（dataId 内容为 YAML），解析成嵌套对象。
 *
 * - 用 direct 模式连接，鉴权字段（username/password）设了才带。
 * - 拉取失败 / 内容为空 / 非法 YAML → 抛错并指出 server / namespace / group / dataId。
 */
export async function loadNacosConfig(
  bootstrap: NacosBootstrap,
): Promise<Record<string, unknown>> {
  const { serverAddr, namespace, group, dataId, username, password } = bootstrap;
  const client = new NacosConfigClient({
    serverAddr,
    namespace,
    ...(username ? { username, password } : {}),
  });
  const where = `server=${serverAddr} namespace=${namespace} group=${group} dataId=${dataId}`;

  let content: string | null;
  try {
    await client.ready();
    content = await client.getConfig(dataId, group);
  } catch (err) {
    throw new Error(
      `[config-loader] 从 Nacos 拉取配置失败（${where}）：${(err as Error).message}`,
    );
  }
  if (!content) {
    throw new Error(`[config-loader] Nacos 配置为空（${where}）。`);
  }
  const parsed = load(content);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`[config-loader] Nacos 配置内容不是合法 YAML map（${where}）。`);
  }
  return parsed as Record<string, unknown>;
}
```

> 注：`nacos` 自带类型；如其类型对 `serverAddr`/`username` 的定义偏宽松，`tsconfig.base.json` 已开 `skipLibCheck`，不影响编译。

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm exec jest libs/shared/src/config/nacos-source.spec.ts`
Expected: PASS（4 个用例）。

- [ ] **Step 5: Commit**

```bash
git add libs/shared/src/config/nacos-source.ts libs/shared/src/config/nacos-source.spec.ts
git commit -m "feat(shared): 新增 loadNacosConfig 从 Nacos 拉取并解析配置"
```

---

## Task 6: `loadAppConfig`（编排：选源 + 合并）

**Files:**
- Create: `libs/shared/src/config/config-loader.ts`
- Test: `libs/shared/src/config/config-loader.spec.ts`

- [ ] **Step 1: 写失败的测试**

`libs/shared/src/config/config-loader.spec.ts`：

```ts
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadAppConfig } from "./config-loader";

const ready = jest.fn().mockResolvedValue(undefined);
const getConfig = jest.fn();

jest.mock("nacos", () => ({
  NacosConfigClient: jest.fn().mockImplementation(() => ({ ready, getConfig })),
}));

function writeYaml(content: string): { cwd: string; file: string } {
  const cwd = mkdtempSync(join(tmpdir(), "qriter-cfg-"));
  writeFileSync(join(cwd, "application.yml"), content, "utf8");
  return { cwd, file: "application.yml" };
}

beforeEach(() => {
  ready.mockClear();
  getConfig.mockReset();
});

describe("loadAppConfig", () => {
  it("无 NACOS_SERVER_ADDR → 读本地 YAML 并注入 env", async () => {
    const { cwd, file } = writeYaml("database:\n  url: postgresql://yaml\n");
    const env: NodeJS.ProcessEnv = {};
    const result = await loadAppConfig({ cwd, yamlFiles: [file], env });
    expect(result.source).toBe("yaml");
    expect(env.DATABASE_URL).toBe("postgresql://yaml");
    expect(result.injectedKeys).toContain("DATABASE_URL");
  });

  it("env 已有的 key 不被配置源覆盖（env 优先）", async () => {
    const { cwd, file } = writeYaml("database:\n  url: postgresql://yaml\n");
    const env: NodeJS.ProcessEnv = { DATABASE_URL: "postgresql://preset" };
    const result = await loadAppConfig({ cwd, yamlFiles: [file], env });
    expect(env.DATABASE_URL).toBe("postgresql://preset");
    expect(result.injectedKeys).not.toContain("DATABASE_URL");
  });

  it("有 NACOS_SERVER_ADDR → 走 Nacos 分支", async () => {
    getConfig.mockResolvedValue("jwt:\n  secret: from-nacos\n");
    const env: NodeJS.ProcessEnv = { NACOS_SERVER_ADDR: "127.0.0.1:8848" };
    const result = await loadAppConfig({ cwd: tmpdir(), env });
    expect(result.source).toBe("nacos");
    expect(env.JWT_SECRET).toBe("from-nacos");
    expect(ready).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm exec jest libs/shared/src/config/config-loader.spec.ts`
Expected: FAIL，报 `Cannot find module './config-loader'`。

- [ ] **Step 3: 写最小实现**

`libs/shared/src/config/config-loader.ts`：

```ts
import path from "node:path";
import { config as loadDotenv } from "dotenv";
import { flattenToEnv } from "./flatten";
import { readNacosBootstrap } from "./nacos-bootstrap.schema";
import { loadNacosConfig } from "./nacos-source";
import { loadYamlConfig } from "./yaml-source";

/**
 * 引导式配置加载：必须在 NestFactory.create(AppModule) **之前** 调用。
 *
 * 1. 从 `.env` 文件读取 Nacos 引导变量（不覆盖已存在的真实 env）。
 * 2. `NACOS_SERVER_ADDR` 存在 → 从 Nacos 拉取；否则读本地 YAML。
 * 3. 拍平成 UPPER_SNAKE 写入 env（已存在的 key 不覆盖 = env 优先）。
 *
 * 之后由现有 ConfigModule + EnvSchema 做最终 fail-fast 校验。
 *
 * @param options.cwd       解析相对路径的基准目录，默认 process.cwd()
 * @param options.envFiles  .env 文件（相对 cwd），先者优先，仅用于读引导变量
 * @param options.yamlFiles 本地 YAML（相对 cwd），后者覆盖前者
 * @param options.env       目标 env 对象，默认 process.env（测试可注入）
 */
export async function loadAppConfig(
  options: {
    cwd?: string;
    envFiles?: string[];
    yamlFiles?: string[];
    env?: NodeJS.ProcessEnv;
  } = {},
): Promise<{ source: "nacos" | "yaml"; injectedKeys: string[] }> {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const envFiles = options.envFiles ?? [];
  const yamlFiles = options.yamlFiles ?? [];

  // 1. 读 .env（不覆盖已有 env）—— 先者优先
  for (const file of envFiles) {
    loadDotenv({ path: path.resolve(cwd, file), processEnv: env, override: false });
  }

  // 2. 选源并取嵌套配置
  const bootstrap = readNacosBootstrap(env);
  const source: "nacos" | "yaml" = bootstrap ? "nacos" : "yaml";
  const nested = bootstrap
    ? await loadNacosConfig(bootstrap)
    : loadYamlConfig(yamlFiles.map((f) => path.resolve(cwd, f)));

  // 3. 拍平并合并（env 优先：已存在的 key 不覆盖）
  const flat = flattenToEnv(nested);
  const injectedKeys: string[] = [];
  for (const [key, value] of Object.entries(flat)) {
    if (env[key] === undefined) {
      env[key] = value;
      injectedKeys.push(key);
    }
  }

  console.log(`[config-loader] 配置源=${source}，注入 ${injectedKeys.length} 个配置项`);
  return { source, injectedKeys };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm exec jest libs/shared/src/config/config-loader.spec.ts`
Expected: PASS（3 个用例）。

- [ ] **Step 5: Commit**

```bash
git add libs/shared/src/config/config-loader.ts libs/shared/src/config/config-loader.spec.ts
git commit -m "feat(shared): 新增 loadAppConfig 引导式配置编排"
```

---

## Task 7: 导出 + 接入 `main.ts`

**Files:**
- Modify: `libs/shared/src/config/index.ts`
- Modify: `apps/server/src/main.ts:12-13`（在 `bootstrap()` 开头加载）

- [ ] **Step 1: barrel 增加导出**

把 `libs/shared/src/config/index.ts` 替换为：

```ts
export { createEnvValidator } from "./env-schema";
export { loadAppConfig } from "./config-loader";
```

> 仅导出 `loadAppConfig`（main.ts 用）。其余函数为内部实现，已被各模块内部 import，不进 barrel（避免 `check:dead` 死导出 finding）。

- [ ] **Step 2: 在 `apps/server/src/main.ts` 接入**

改 import（第 1-6 行），把 `loadAppConfig` 加入从 `@qriter/shared` 的解构导入：

```ts
import {
  ErrorsFilter,
  I18nZodValidationPipe,
  ResponseInterceptor,
  loadAppConfig,
  traceIdMiddleware,
} from "@qriter/shared";
```

在 `bootstrap()` 函数体最开头（`const app = await NestFactory.create(AppModule);` 之前）插入：

```ts
async function bootstrap() {
  // 引导式配置：Nest 起来前先把 YAML / Nacos 的配置写进 process.env，
  // 供下面 AppModule 的 ConfigModule + EnvSchema 照常校验。
  await loadAppConfig({
    cwd: process.cwd(),
    envFiles: [".env.development", ".env"],
    yamlFiles: ["config/application.yml", "config/application.local.yml"],
  });

  const app = await NestFactory.create(AppModule);
  // ...（其余不变）
```

- [ ] **Step 3: 类型检查通过**

Run: `pnpm --filter @qriter/shared build && pnpm --filter @qriter/server exec tsc --project tsconfig.json --noEmit`
Expected: 均 exit 0（`@qriter/shared` 先出 dist，server 才能解析到 `loadAppConfig`）。

- [ ] **Step 4: Commit**

```bash
git add libs/shared/src/config/index.ts apps/server/src/main.ts
git commit -m "feat(server): main.ts 启动前接入 loadAppConfig"
```

---

## Task 8: 配置文件与 gitignore

**Files:**
- Create: `apps/server/config/application.yml`
- Create: `apps/server/.env.example`
- Modify: `.gitignore`

- [ ] **Step 1: 创建本地开发默认 YAML**

`apps/server/config/application.yml`：

```yaml
# qriter server 本地开发配置（提交，含 localhost 默认值，pnpm dev 开箱即用）。
# 部署环境改用 Nacos：在 .env 配置 NACOS_SERVER_ADDR 等，本文件即被跳过。
# 个人覆盖：把要改的项写进 config/application.local.yml（已 gitignore）。
node_env: development
port: 3000
database:
  url: postgresql://qriter:qriter@localhost:5433/qriter
jwt:
  secret: qriter-dev-secret-change-in-prod-min-16
  expires: 7d
# Redis：留空走 memory 兜底；本地起 redis（pnpm dev:db:up，端口 6380）后再启用：
# redis:
#   url: redis://localhost:6380
```

- [ ] **Step 2: 创建 NACOS_* 引导样例**

`apps/server/.env.example`：

```bash
# qriter server 引导配置样例。复制为 .env 后填写（.env 已 gitignore）。
#
# 不配置以下任何 NACOS_* → 启动时回退读取 config/application.yml（本地开发默认）。
# 配置了 NACOS_SERVER_ADDR → 启动时从 Nacos 拉取配置（dataId 内容为 YAML）。
#
# NACOS_SERVER_ADDR=127.0.0.1:8848
# NACOS_NAMESPACE=public
# NACOS_GROUP=DEFAULT_GROUP
# NACOS_DATA_ID=qriter-server.yaml
# NACOS_USERNAME=
# NACOS_PASSWORD=
```

- [ ] **Step 3: gitignore 忽略个人覆盖文件**

在根 `.gitignore` 的 `# env` 区块后追加：

```gitignore
# 本地配置个人覆盖（application.yml 提交默认值，.local 覆盖不入库）
apps/server/config/application.local.yml
```

- [ ] **Step 4: 验证 git 跟踪状态符合预期**

Run:
```bash
git check-ignore apps/server/config/application.local.yml; echo "local.yml ignored? exit=$?"
git check-ignore apps/server/.env.example; echo ".env.example ignored? exit=$? (期望 exit=1 = 不忽略)"
git check-ignore apps/server/config/application.yml; echo "application.yml ignored? exit=$? (期望 exit=1 = 不忽略)"
```
Expected: `application.local.yml` 被忽略（exit 0）；`.env.example` 与 `application.yml` 不被忽略（exit 1）。

- [ ] **Step 5: Commit**

```bash
git add apps/server/config/application.yml apps/server/.env.example .gitignore
git commit -m "feat(server): 增加本地 application.yml 默认配置与 .env 样例"
```

---

## Task 9: 全量回归与启动冒烟

**Files:** 无（仅验证）

- [ ] **Step 1: 跑全部新单测**

Run: `pnpm exec jest libs/shared/src/config`
Expected: 5 个 spec 文件全 PASS（flatten / nacos-bootstrap / yaml-source / nacos-source / config-loader，约 19 用例）。

- [ ] **Step 2: 全包类型检查 + 构建**

Run: `pnpm typecheck && pnpm build`
Expected: 均 exit 0。

- [ ] **Step 3: 确认 spec 未进 dist**

Run: `ls libs/shared/dist/config/ | grep -c spec || echo "no spec in dist (期望)"`
Expected: 输出 `no spec in dist (期望)`（dist/config 下无 `*.spec.js`）。

- [ ] **Step 4: 静态围栏**

Run: `pnpm check`
Expected: 6 个围栏均 0 新增 finding。

- [ ] **Step 5: 启动冒烟（YAML 回退路径，需本地依赖）**

Run:
```bash
pnpm dev:db:up
# 确保 apps/server 下无 .env / .env.development 覆盖（仅靠 application.yml）
pnpm dev:server
```
Expected: 日志出现 `[config-loader] 配置源=yaml，注入 N 个配置项`，随后 `qriter server running on http://localhost:3000`，无 `DATABASE_URL: Required` 报错。验证完 `Ctrl+C` 停止，`pnpm dev:db:down`。

- [ ] **Step 6: （可选）合入 turbo.json dev 竞态修复**

> 本分支工作区可能仍带未提交的 `turbo.json`（dev 任务加 `dependsOn: ["^build"]`，修复冷启动模块解析竞态）。如确认保留：

```bash
git add turbo.json
git commit -m "fix(turbo): dev 任务加 ^build 依赖，消除冷启动 @qriter/* 解析竞态"
```

- [ ] **Step 7: 收尾**

按 `superpowers:finishing-a-development-branch` 决定合并 / PR。

---

## 实施完成判定（Definition of Done）

- 5 个 `libs/shared/src/config/*.spec.ts` 全绿；`pnpm typecheck` / `pnpm build` / `pnpm check` 全过。
- 无 `.env` 时 `pnpm dev:server` 能靠 `config/application.yml` 正常起服务。
- 设置 `NACOS_SERVER_ADDR` 后走 Nacos 分支（单测覆盖；真实 Nacos 连通性属部署验证）。
- `apps/server/.env` 与 `application.local.yml` 被 gitignore；`.env.example` 与 `application.yml` 入库。
