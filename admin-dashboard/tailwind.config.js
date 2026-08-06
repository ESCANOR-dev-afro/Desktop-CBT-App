/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        darkBg: '#0B0F19',
        darkCard: '#111827',
        darkSurface: '#162032',
        darkBorder: '#1F293D',
        brand: {
          50: '#FFF5EC',
          100: '#FFE5D1',
          200: '#FFC8A3',
          300: '#FFA370',
          400: '#FF7D3B',
          DEFAULT: '#F96302',
          500: '#F96302',
          600: '#E05300',
          700: '#B84000',
          800: '#8A2F00',
          900: '#431700',
        }
      }
    },
  },
  plugins: [],
}
