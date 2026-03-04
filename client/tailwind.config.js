/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'uno-red': '#C4332A',
        'uno-blue': '#2E5090',
        'uno-green': '#2D8E38',
        'uno-yellow': '#E8CF33',
        'uno-wild': '#333333',
      },
    },
  },
  plugins: [],
};
