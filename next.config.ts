import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Ảnh món phục vụ từ Supabase Storage (bucket menu-images, public)
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/**" },
    ],
  },
};

export default nextConfig;
