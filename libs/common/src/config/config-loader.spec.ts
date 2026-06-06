import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { loadAppConfig } from "./config-loader";

const ready = jest.fn().mockResolvedValue(undefined);
const getConfig = jest.fn();

jest.mock("nacos", () => ({
  NacosConfigClient: jest.fn().mockImplementation(() => ({ ready, getConfig })),
}));

/** 测试用最小 schema：嵌套 database + jwt。 */
const TestSchema = z.object({
  port: z.coerce.number().default(3000),
  database: z.object({ host: z.string(), port: z.coerce.number() }),
  jwt: z.object({ secret: z.string().min(4) }).optional(),
});

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
  it("无 NACOS_SERVER_ADDR → 读本地 YAML 并按 schema 校验返回嵌套配置", async () => {
    const { cwd, file } = writeYaml(
      "port: 3100\ndatabase:\n  host: db.local\n  port: 5433\n",
    );
    const env: NodeJS.ProcessEnv = {};
    const config = await loadAppConfig(TestSchema, {
      cwd,
      yamlFiles: [file],
      env,
    });
    expect(config.port).toBe(3100);
    expect(config.database).toEqual({ host: "db.local", port: 5433 });
    // 结构化配置不再拍平进 env
    expect(env.DATABASE_HOST).toBeUndefined();
  });

  it("有 NACOS_SERVER_ADDR → 走 Nacos 分支并校验", async () => {
    getConfig.mockResolvedValue(
      "database:\n  host: nacos.db\n  port: 7306\njwt:\n  secret: from-nacos\n",
    );
    const env: NodeJS.ProcessEnv = { NACOS_SERVER_ADDR: "127.0.0.1:8848" };
    const config = await loadAppConfig(TestSchema, { cwd: tmpdir(), env });
    expect(config.database.host).toBe("nacos.db");
    expect(config.jwt?.secret).toBe("from-nacos");
    expect(ready).toHaveBeenCalledTimes(1);
  });

  it("从 .env 读到 NACOS_SERVER_ADDR → 触发 Nacos 分支（.env 仍写 process.env）", async () => {
    getConfig.mockResolvedValue("database:\n  host: h\n  port: 1\n");
    const dir = mkdtempSync(join(tmpdir(), "qriter-cfg-env-"));
    writeFileSync(
      join(dir, ".env"),
      "NACOS_SERVER_ADDR=127.0.0.1:8848\n",
      "utf8",
    );
    const env: NodeJS.ProcessEnv = {};
    const config = await loadAppConfig(TestSchema, {
      cwd: dir,
      envFiles: [".env"],
      env,
    });
    expect(config.database.host).toBe("h");
    expect(env.NACOS_SERVER_ADDR).toBe("127.0.0.1:8848");
    expect(ready).toHaveBeenCalledTimes(1);
  });

  it("配置不满足 schema → 抛错并指出字段路径", async () => {
    const { cwd, file } = writeYaml("database:\n  host: only-host\n");
    await expect(
      loadAppConfig(TestSchema, { cwd, yamlFiles: [file], env: {} }),
    ).rejects.toThrow(/database\.port/);
  });
});
