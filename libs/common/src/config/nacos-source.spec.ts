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
    expect(getConfig).toHaveBeenCalledWith(
      "qriter-server.yaml",
      "DEFAULT_GROUP",
    );
    expect(ctor).toHaveBeenCalledWith(
      expect.objectContaining({
        serverAddr: "127.0.0.1:8848",
        namespace: "public",
      }),
    );
  });

  it("设了鉴权 → 把 username/password 传给 client", async () => {
    getConfig.mockResolvedValue("port: 3000\n");
    await loadNacosConfig({
      ...bootstrap,
      username: "nacos",
      password: "pass",
    });
    expect(ctor).toHaveBeenCalledWith(
      expect.objectContaining({ username: "nacos", password: "pass" }),
    );
  });

  it("未设鉴权 → 不把 username/password 传给 client", async () => {
    getConfig.mockResolvedValue("port: 3000\n");
    await loadNacosConfig(bootstrap);
    expect(ctor).toHaveBeenCalledWith(
      expect.not.objectContaining({ username: expect.anything() }),
    );
  });

  it("内容不是 YAML map（标量）→ 抛错", async () => {
    getConfig.mockResolvedValue("just-a-string\n");
    await expect(loadNacosConfig(bootstrap)).rejects.toThrow(
      /不是合法 YAML map/,
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
