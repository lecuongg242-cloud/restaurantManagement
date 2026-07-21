import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Primitive colors — Airtable design system
        primary: '#181d26',
        'primary-active': '#0d1218',
        ink: '#181d26',
        body: '#333840',
        muted: '#41454d',
        canvas: '#ffffff',
        'surface-soft': '#f8fafc',
        'surface-strong': '#e0e2e6',
        'surface-dark': '#181d26',
        hairline: '#dddddd',
        'border-strong': '#9297a0',
        
        // Signature colors
        'signature-coral': '#aa2d00',
        'signature-forest': '#0a2e0e',
        'signature-cream': '#f5e9d4',
        'signature-peach': '#fcab79',
        'signature-mint': '#a8d8c4',
        
        // Semantic colors
        link: '#1b61c9',
        success: '#006400',
      },
      fontSize: {
        // Display scales
        'display-xl': ['48px', { lineHeight: '1.1', fontWeight: '500' }],
        'display-lg': ['40px', { lineHeight: '1.2', fontWeight: '400' }],
        'display-md': ['32px', { lineHeight: '1.2', fontWeight: '400' }],
        
        // Title scales
        'title-lg': ['24px', { lineHeight: '1.35', fontWeight: '400' }],
        'title-md': ['20px', { lineHeight: '1.5', fontWeight: '400' }],
        'title-sm': ['18px', { lineHeight: '1.4', fontWeight: '500' }],
        
        // Labels & body
        'label-md': ['16px', { lineHeight: '1.4', fontWeight: '500' }],
        button: ['16px', { lineHeight: '1.4', fontWeight: '500' }],
        'body-md': ['14px', { lineHeight: '1.25', fontWeight: '400' }],
        caption: ['14px', { lineHeight: '1.35', fontWeight: '500' }],
      },
      spacing: {
        xs: '4px',
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '24px',
        '2xl': '32px',
        '3xl': '48px',
        section: '96px',
      },
      borderRadius: {
        xs: '2px',
        sm: '6px',
        md: '10px',
        lg: '12px',
      },
      boxShadow: {
        none: 'none',
        'hairline': '0 0 0 1px var(--color-hairline)',
      },
      fontFamily: {
        sans: [
          'Haas Grotesk',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};

export default config;
