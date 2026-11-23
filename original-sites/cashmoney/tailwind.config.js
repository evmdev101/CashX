/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['"Fira Code"', 'ui-monospace', '"Cascadia Code"', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
}
