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
      flattenToEnv({
        node_env: "development",
        port: 3000,
        jwt: { secret: "s" },
      }),
    ).toEqual({ NODE_ENV: "development", PORT: "3000", JWT_SECRET: "s" });
  });

  it("跳过 null / undefined 叶子", () => {
    expect(flattenToEnv({ a: null, b: undefined, c: "x" })).toEqual({ C: "x" });
  });

  it("把 boolean 叶子字符串化（false 不被跳过）", () => {
    expect(flattenToEnv({ enabled: false, ssl: true })).toEqual({
      ENABLED: "false",
      SSL: "true",
    });
  });

  it("支持 3 层及更深的嵌套", () => {
    expect(flattenToEnv({ db: { primary: { url: "x" } } })).toEqual({
      DB_PRIMARY_URL: "x",
    });
  });

  it("遇到数组叶子抛错", () => {
    expect(() => flattenToEnv({ hosts: ["a", "b"] })).toThrow(/数组/);
  });
});
