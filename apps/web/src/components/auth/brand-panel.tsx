"use client";

import { useTranslations } from "next-intl";

/**
 * 登录前左侧品牌墙 —— 暖渐变 + 大宋体 Qriter + 文学 slogan。
 * client 组件（用 next-intl 客户端 useTranslations）。移动端由父布局收为顶部窄条。
 */
export function BrandPanel() {
  const t = useTranslations("auth");
  return (
    <aside
      aria-label="Qriter"
      className="flex flex-col justify-center gap-3 p-10 text-[#3a2f25] md:w-[44%]"
      style={{
        background:
          "linear-gradient(155deg, #efe6d8 0%, #caa07e 75%, #b5654a 120%)",
      }}
    >
      <div className="font-serif text-3xl font-semibold tracking-tight">
        Qriter
      </div>
      <p className="max-w-[16rem] font-serif text-base leading-relaxed text-[#4a3d2f]">
        {t("brandSlogan")}
      </p>
    </aside>
  );
}
