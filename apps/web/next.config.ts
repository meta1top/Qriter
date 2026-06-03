import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@qriter/design", "@qriter/common"],
};

export default nextConfig;
