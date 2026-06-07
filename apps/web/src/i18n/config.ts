export const locales = ["zh", "en"] as const;

export type AppLocale = (typeof locales)[number];

export const defaultLocale: AppLocale = "zh";

export const localeCookieName = "locale";

/**
 * 全局默认时区 —— 显式配置避免 next-intl 的 ENVIRONMENT_FALLBACK
 * （未配 timeZone 时 SSR 用服务器时区、CSR 用浏览器时区，日期格式化会 hydration 不一致）。
 */
export const defaultTimeZone = "Asia/Shanghai";

export function isAppLocale(
  value: string | undefined | null,
): value is AppLocale {
  return Boolean(value && locales.includes(value as AppLocale));
}
