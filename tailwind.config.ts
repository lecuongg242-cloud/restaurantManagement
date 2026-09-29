import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

/**
 * Tailwind đọc token từ lib/design/tokens.css (CSS variables ở :root).
 * Không hardcode hex ở đây — mọi giá trị trỏ về var(--...) để một nguồn sự thật.
 *
 * Màu PHẢI bọc `rgb(var(--x) / <alpha-value>)`: token lưu kênh RGB rời nên Tailwind mới
 * chèn được độ mờ (`bg-ink/40`, `ring-primary/20`). Nếu để var() chứa hex, Tailwind lặng
 * lẽ bỏ hẳn các utility có `/độ-mờ` (xem chú thích đầu tokens.css).
 */
const c = (v: string) => `rgb(var(${v}) / <alpha-value>)`;

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: c("--color-primary"),
          deep: c("--color-primary-deep"),
          fg: c("--color-on-primary"),
        },
        tenant: c("--tenant-primary"),
        sunshine: {
          300: c("--color-sunshine-300"),
          500: c("--color-sunshine-500"),
          700: c("--color-sunshine-700"),
          900: c("--color-sunshine-900"),
        },
        "yellow-saturated": c("--color-yellow-saturated"),
        canvas: c("--color-canvas"),
        surface: {
          DEFAULT: c("--color-surface"),
          code: c("--color-surface-code"),
        },
        cream: {
          DEFAULT: c("--color-cream"),
          soft: c("--color-cream-soft"),
          deeper: c("--color-cream-deeper"),
        },
        ink: {
          DEFAULT: c("--color-ink"),
          tint: c("--color-ink-tint"),
        },
        charcoal: c("--color-charcoal"),
        slate: c("--color-slate"),
        steel: c("--color-steel"),
        stone: c("--color-stone"),
        muted: c("--color-muted"),
        "on-dark": {
          DEFAULT: c("--color-on-dark"),
          muted: c("--color-on-dark-muted"),
        },
        hairline: {
          DEFAULT: c("--color-hairline"),
          soft: c("--color-hairline-soft"),
          strong: c("--color-hairline-strong"),
        },
        "beige-deep": c("--color-beige-deep"),
        status: {
          new: c("--status-new"),
          "new-fg": c("--status-new-fg"),
          active: c("--status-active"),
          "active-fg": c("--status-active-fg"),
          ready: c("--status-ready"),
          "ready-bg": c("--status-ready-bg"),
          late: c("--status-late"),
          "late-fg": c("--status-late-fg"),
          done: c("--status-done"),
        },
      },
      spacing: {
        xxs: "var(--space-xxs)",
        xs: "var(--space-xs)",
        sm: "var(--space-sm)",
        md: "var(--space-md)",
        lg: "var(--space-lg)",
        xl: "var(--space-xl)",
        xxl: "var(--space-xxl)",
        xxxl: "var(--space-xxxl)",
        "section-sm": "var(--space-section-sm)",
        section: "var(--space-section)",
        "section-lg": "var(--space-section-lg)",
        hero: "var(--space-hero)",
      },
      borderRadius: {
        xs: "var(--radius-xs)",
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        xxl: "var(--radius-xxl)",
        full: "var(--radius-full)",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        modal: "var(--shadow-modal)",
      },
      backgroundImage: {
        sunset: "var(--gradient-sunset)",
      },
      fontFamily: {
        display: ["var(--font-fraunces)", "Georgia", "serif"],
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  // import thay cho require(): Node ≥ 22.18 tự nạp file .ts này như ESM — ở đó không có `require` ("require is not defined").
  plugins: [animate],
};

export default config;
