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

  // 3. 拍平并合并（env 优先：已存在的 key 不覆盖）
  const flat = flattenToEnv(nested);
  const injectedKeys: string[] = [];
  for (const [key, value] of Object.entries(flat)) {
    if (env[key] === undefined) {
      env[key] = value;
      injectedKeys.push(key);
    }
  }

  console.log(
    `[config-loader] 配置源=${source}，注入 ${injectedKeys.length} 个配置项`,
  );
  return { source, injectedKeys };
}
