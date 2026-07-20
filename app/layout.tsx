import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Be_Vietnam_Pro } from "next/font/google";
import "./globals.css";

const fontSans = Inter({
  variable: "--font-inter",
  subsets: ["latin", "vietnamese"],
});

const fontHeading = Be_Vietnam_Pro({
  variable: "--font-be-vietnam",
  weight: ["500", "600", "700"],
  subsets: ["latin", "vietnamese"],
});

const fontMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin", "vietnamese"],
});

export const metadata: Metadata = {
  title: "Hệ thống nhà hàng",
  description:
    "Nền tảng SaaS quản lý nhà hàng: gọi món QR, POS, màn hình bếp, đặt bàn, báo cáo doanh thu.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      className={`${fontSans.variable} ${fontHeading.variable} ${fontMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
