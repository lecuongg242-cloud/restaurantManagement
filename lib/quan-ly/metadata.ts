import type { Metadata, Viewport } from "next";

/** Metadata chung các trang app Quản lý (P30): manifest + biểu tượng riêng, chạy toàn màn hình khi thêm vào MH chính. */
export const QUAN_LY_METADATA: Metadata = {
  title: "TechMenu Quản lý",
  manifest: "/quan-ly/manifest.webmanifest",
  icons: { icon: "/quan-ly/bieu-tuong.png", apple: "/quan-ly/bieu-tuong.png?s=180" },
  appleWebApp: { capable: true, title: "TM Quản lý", statusBarStyle: "default" },
};

export const QUAN_LY_VIEWPORT: Viewport = { themeColor: "#1f1f1f", viewportFit: "cover" };
