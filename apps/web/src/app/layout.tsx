import { themeScript } from "@qriter/common";
import { TooltipProvider } from "@qriter/design";
import type { Metadata } from "next";
import { IntlProvider } from "@/components/intl-provider";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Qriter",
  description: "Agent-powered writing platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <head>
        {/* 主题脚本须在首帧前同步执行，避免深色 / 浅色闪烁 */}
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: 内联无闪烁主题脚本
          dangerouslySetInnerHTML={{ __html: themeScript }}
        />
      </head>
      <body>
        <IntlProvider>
          <TooltipProvider>
            <Providers>{children}</Providers>
          </TooltipProvider>
        </IntlProvider>
      </body>
    </html>
  );
}
