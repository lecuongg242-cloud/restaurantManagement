import { Fraunces, Inter, JetBrains_Mono } from "next/font/google";

/**
 * Font V1 (QD-006 F4): Fraunces (display/hero — chỉ còn trang giới thiệu + phần khách xem), Inter (toàn UI, kể cả tiêu đề
 * màn làm việc từ 04/10/2026), JetBrains Mono (code + in).
 * Nạp qua next/font/google — không tải font ngoài runtime. Xuất CSS var để Tailwind map.
 */

export const fraunces = Fraunces({
  // Có "vietnamese": thiếu bộ này thì chữ có dấu (à, ự…) rơi sang Georgia, lệch nét với chữ không dấu.
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-fraunces",
});

export const inter = Inter({
  subsets: ["latin", "vietnamese"],
  display: "swap",
  variable: "--font-inter",
});

export const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-mono",
});

export const fontVariables = `${fraunces.variable} ${inter.variable} ${jetBrainsMono.variable}`;
