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

  it("envFiles 中的变量注入 env（先者优先，不覆盖）", async () => {
    const dir = mkdtempSync(join(tmpdir(), "qriter-cfg-env-"));
    writeFileSync(join(dir, "a.env"), "MY_KEY=from-a\n", "utf8");
    writeFileSync(join(dir, "b.env"), "MY_KEY=from-b\n", "utf8");
    writeFileSync(join(dir, "application.yml"), "port: 3000\n", "utf8");
    const env: NodeJS.ProcessEnv = {};
    const result = await loadAppConfig({
      cwd: dir,
      envFiles: ["a.env", "b.env"],
      yamlFiles: ["application.yml"],
      env,
    });
    expect(env.MY_KEY).toBe("from-a");
    expect(result.injectedKeys).not.toContain("MY_KEY");
  });

  it("从 .env 读到 NACOS_SERVER_ADDR → 触发 Nacos 分支", async () => {
    getConfig.mockResolvedValue("jwt:\n  secret: via-env-nacos\n");
    const dir = mkdtempSync(join(tmpdir(), "qriter-cfg-env2-"));
    writeFileSync(
      join(dir, ".env"),
      "NACOS_SERVER_ADDR=127.0.0.1:8848\n",
      "utf8",
    );
    const env: NodeJS.ProcessEnv = {};
    const result = await loadAppConfig({ cwd: dir, envFiles: [".env"], env });
    expect(result.source).toBe("nacos");
    expect(env.JWT_SECRET).toBe("via-env-nacos");
    expect(ready).toHaveBeenCalledTimes(1);
  });
});
