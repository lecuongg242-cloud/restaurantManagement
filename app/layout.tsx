import type { Metadata } from "next";
import "./globals.css";
import { fontVariables } from "@/lib/fonts";

export const metadata: Metadata = {
  title: "Quản lý nhà hàng",
  description: "Hệ thống quản lý nhà hàng SaaS — Gọi món, POS, KDS, đặt bàn & báo cáo.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" className={fontVariables}>
      <body>{children}</body>
    </html>
  );
}
