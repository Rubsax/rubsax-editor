import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        studio: {
          950: '#090D16',
          900: '#0F172A',
          850: '#162036',
          800: '#1E293B',
          700: '#27272A',
        },
        sax: {
          300: '#FCD34D',
          400: '#FBBF24',
          500: '#F59E0B',
          600: '#D97706',
          700: '#B45309',
        },
        parchment: {
          DEFAULT: '#F4E8C1',
          dark: '#E8D8A6',
        },
      },
    },
  },
  plugins: [],
};

export default config;
