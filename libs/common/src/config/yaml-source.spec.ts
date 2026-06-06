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
    const local = writeTmp(
      "application.local.yml",
      "database:\n  url: local\n",
    );
    expect(loadYamlConfig([base, local])).toEqual({
      database: { url: "local" },
      jwt: { secret: "base-secret" },
    });
  });

  it("深合并支持多层嵌套（保留同级未覆盖的键）", () => {
    const base = writeTmp("application.yml", "a:\n  b:\n    c: 1\n    d: 2\n");
    const local = writeTmp("application.local.yml", "a:\n  b:\n    d: 99\n");
    expect(loadYamlConfig([base, local])).toEqual({
      a: { b: { c: 1, d: 99 } },
    });
  });

  it("拒绝 __proto__ 键，不污染原型链", () => {
    const evil = writeTmp("evil.yml", "__proto__:\n  polluted: true\n");
    expect(loadYamlConfig([evil])).toEqual({});
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("文件不存在 → 跳过（允许纯 env）", () => {
    expect(loadYamlConfig(["/no/such/file.yml"])).toEqual({});
  });

  it("顶层不是 map → 抛错", () => {
    const bad = writeTmp("bad.yml", "- a\n- b\n");
    expect(() => loadYamlConfig([bad])).toThrow(/顶层必须是对象/);
  });
});
