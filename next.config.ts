import type { NextConfig } from "next";

const supabaseHost = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
      : "*.supabase.co";
  } catch {
    return "*.supabase.co";
  }
})();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Repo con nằm trong E:\externalProjects (có lockfile cha) — chốt root ở đây
  // để tắt cảnh báo "inferred workspace root".
  outputFileTracingRoot: __dirname,
  // next/image được phép tải ảnh menu/logo từ Supabase Storage (bucket public).
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: supabaseHost,
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
