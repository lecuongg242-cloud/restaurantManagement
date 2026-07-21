import type { Config } from "tailwindcss";

/**
 * Tailwind đọc token từ lib/design/tokens.css (CSS variables ở :root).
 * Không hardcode hex ở đây — mọi giá trị trỏ về var(--...) để một nguồn sự thật.
 */
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
          DEFAULT: "var(--color-primary)",
          deep: "var(--color-primary-deep)",
          fg: "var(--color-on-primary)",
        },
        tenant: "var(--tenant-primary)",
        sunshine: {
          300: "var(--color-sunshine-300)",
          500: "var(--color-sunshine-500)",
          700: "var(--color-sunshine-700)",
          900: "var(--color-sunshine-900)",
        },
        "yellow-saturated": "var(--color-yellow-saturated)",
        canvas: "var(--color-canvas)",
        surface: {
          DEFAULT: "var(--color-surface)",
          code: "var(--color-surface-code)",
        },
        cream: {
          DEFAULT: "var(--color-cream)",
          soft: "var(--color-cream-soft)",
          deeper: "var(--color-cream-deeper)",
        },
        ink: {
          DEFAULT: "var(--color-ink)",
          tint: "var(--color-ink-tint)",
        },
        charcoal: "var(--color-charcoal)",
        slate: "var(--color-slate)",
        steel: "var(--color-steel)",
        stone: "var(--color-stone)",
        muted: "var(--color-muted)",
        "on-dark": {
          DEFAULT: "var(--color-on-dark)",
          muted: "var(--color-on-dark-muted)",
        },
        hairline: {
          DEFAULT: "var(--color-hairline)",
          soft: "var(--color-hairline-soft)",
          strong: "var(--color-hairline-strong)",
        },
        "beige-deep": "var(--color-beige-deep)",
        status: {
          new: "var(--status-new)",
          "new-fg": "var(--status-new-fg)",
          active: "var(--status-active)",
          "active-fg": "var(--status-active-fg)",
          ready: "var(--status-ready)",
          "ready-bg": "var(--status-ready-bg)",
          late: "var(--status-late)",
          "late-fg": "var(--status-late-fg)",
          done: "var(--status-done)",
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
  plugins: [require("tailwindcss-animate")],
};

export default config;
