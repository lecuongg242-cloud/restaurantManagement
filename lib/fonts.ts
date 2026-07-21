import { Fraunces, Inter, JetBrains_Mono } from "next/font/google";

/**
 * Font V1 (QD-006 F4): Fraunces (display/hero), Inter (toàn UI), JetBrains Mono (code + in).
 * Nạp qua next/font/google — không tải font ngoài runtime. Xuất CSS var để Tailwind map.
 */

export const fraunces = Fraunces({
  subsets: ["latin"],
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
