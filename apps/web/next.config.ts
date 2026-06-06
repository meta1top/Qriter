import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@qriter/design", "@qriter/web-common"],
};

export default nextConfig;
