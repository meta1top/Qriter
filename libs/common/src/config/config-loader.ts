import path from "node:path";
import { config as loadDotenv } from "dotenv";
import { z, type ZodType } from "zod";
import { readNacosBootstrap } from "./nacos-bootstrap.schema";
import { loadNacosConfig } from "./nacos-source";
import { normalizeKeys } from "./normalize-keys";
import { loadYamlConfig } from "./yaml-source";

export interface LoadAppConfigOptions {
  /** 解析相对路径的基准目录，默认 process.cwd() */
  cwd?: string;
  /**
   * .env 文件（相对 cwd），先者优先、不覆盖已有。
   * 仅用于「引导变量」（NACOS_* 等）与「扁平 secret」（如 *_API_KEY）写入 process.env。
   */
  envFiles?: string[];
  /** 本地 YAML（相对 cwd），无 Nacos 时的配置源，后者覆盖前者 */
  yamlFiles?: string[];
  /** 目标 env 对象，默认 process.env（测试可注入） */
  env?: NodeJS.ProcessEnv;
}

/**
 * 引导式配置加载：必须在 `NestFactory.create(AppModule.forRoot(config))` **之前**调用。
 *
 * 1. 读 `.env`（写进 `process.env`，不覆盖已有）—— 提供 Nacos 引导变量与扁平 secret
 *    （如 `*_API_KEY` 这类 env 风格的密钥，仍走 process.env）。
 * 2. `NACOS_SERVER_ADDR` 存在 → 从 Nacos 拉取**嵌套**配置；否则读本地 YAML。
 * 3. 用传入的 zod `schema` 校验嵌套对象，返回**强类型嵌套配置**。
 *
 * 与旧实现的区别：配置以「多层级对象」返回，交由 `AppModule.forRoot(config)` 分发给
 * 各模块（如 `TypeOrmModule.forRoot(config.database)`）；**不再把结构化配置拍平进
 * `process.env`**。schema 由调用方（apps/server）提供，libs/shared 不绑定具体配置形状。
 *
 * @param schema  校验嵌套配置的 zod schema（如 `AppConfigSchema`）
 */
export async function loadAppConfig<S extends ZodType>(
  schema: S,
  options: LoadAppConfigOptions = {},
): Promise<z.output<S>> {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const envFiles = options.envFiles ?? [];
  const yamlFiles = options.yamlFiles ?? [];

  // 1. 读 .env（不覆盖已有 env）—— 引导变量 + 扁平 secret
  for (const file of envFiles) {
    loadDotenv({
      path: path.resolve(cwd, file),
      processEnv: env,
      override: false,
    });
  }

  // 2. 选源并取嵌套配置
  const bootstrap = readNacosBootstrap(env);
  const source: "nacos" | "yaml" = bootstrap ? "nacos" : "yaml";
  const nested = bootstrap
    ? await loadNacosConfig(bootstrap)
    : loadYamlConfig(yamlFiles.map((f) => path.resolve(cwd, f)));

  // 3. 归一化 key（kebab-case → camelCase），让 Nacos / YAML 可写 access-key-id 等
  const normalized = normalizeKeys(nested);

  // 4. schema 校验 → 强类型
  const parsed = schema.safeParse(normalized);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(
      `[config-loader] 配置校验失败（源=${source}）：\n${issues}\n` +
        "请检查 YAML / Nacos 配置内容或 .env 引导变量是否齐全 / 合法。",
    );
  }

  console.log(`[config-loader] 配置源=${source}，已加载并校验通过`);
  return parsed.data;
}
