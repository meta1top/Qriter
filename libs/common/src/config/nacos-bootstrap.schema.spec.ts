import { readNacosBootstrap } from "./nacos-bootstrap.schema";

describe("readNacosBootstrap", () => {
  it("未设 NACOS_SERVER_ADDR → 返回 null（走 YAML 回退）", () => {
    expect(readNacosBootstrap({})).toBeNull();
  });

  it("设了 NACOS_SERVER_ADDR → 返回带默认值的引导配置", () => {
    expect(readNacosBootstrap({ NACOS_SERVER_ADDR: "127.0.0.1:8848" })).toEqual(
      {
        serverAddr: "127.0.0.1:8848",
        namespace: "public",
        group: "DEFAULT_GROUP",
        dataId: "qriter-server.yaml",
        username: undefined,
        password: undefined,
      },
    );
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
