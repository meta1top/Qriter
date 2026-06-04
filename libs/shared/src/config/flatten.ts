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
