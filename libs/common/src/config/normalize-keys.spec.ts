import { normalizeKeys } from "./normalize-keys";

describe("normalizeKeys", () => {
  it("把 kebab-case key 转 camelCase（aa-xx → aaXx）", () => {
    expect(
      normalizeKeys({
        "account-name": "qriter@dm.meta1.top",
        "access-key-id": "1",
        "access-key-secret": "2",
      }),
    ).toEqual({
      accountName: "qriter@dm.meta1.top",
      accessKeyId: "1",
      accessKeySecret: "2",
    });
  });

  it("递归嵌套对象", () => {
    expect(
      normalizeKeys({
        email: { "access-key-id": "x", endpoint: "dm.aliyuncs.com" },
        oauth: { google: { "client-id": "c", "redirect-uri": "u" } },
      }),
    ).toEqual({
      email: { accessKeyId: "x", endpoint: "dm.aliyuncs.com" },
      oauth: { google: { clientId: "c", redirectUri: "u" } },
    });
  });

  it("已是 camelCase / 小写的 key + 所有 value 保持不变", () => {
    expect(
      normalizeKeys({ clientId: 1, host: "h", port: 5432, secure: true }),
    ).toEqual({ clientId: 1, host: "h", port: 5432, secure: true });
  });

  it("数组逐元素递归；标量数组不动", () => {
    expect(
      normalizeKeys({
        scopes: ["openid", "email"],
        list: [{ "foo-bar": 1 }, { baz: 2 }],
      }),
    ).toEqual({
      scopes: ["openid", "email"],
      list: [{ fooBar: 1 }, { baz: 2 }],
    });
  });

  it("多段连字符 a-b-c → aBC", () => {
    expect(normalizeKeys({ "a-b-c": 1, "data-id": "x" })).toEqual({
      aBC: 1,
      dataId: "x",
    });
  });

  it("基础类型 / null 原样返回", () => {
    expect(normalizeKeys("x")).toBe("x");
    expect(normalizeKeys(5)).toBe(5);
    expect(normalizeKeys(null)).toBe(null);
  });
});
