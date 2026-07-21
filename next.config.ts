import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Repo con nằm trong E:\externalProjects (có lockfile cha) — chốt root ở đây
  // để tắt cảnh báo "inferred workspace root".
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
