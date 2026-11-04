import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        envio: {
          orange: '#FF6B2B',
          dark: '#0D0D0D',
        },
      },
      fontFamily: {
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;
