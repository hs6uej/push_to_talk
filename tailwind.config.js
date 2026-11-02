// สีหลักของแอป (emerald) อ้างอิง CSS variable --brand-* เพื่อให้ Super admin เปลี่ยนสีทั้งแอปได้ทันที
const shades = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const brand = Object.fromEntries(shades.map((s) => [s, `rgb(var(--brand-${s}) / <alpha-value>)`]));

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: { emerald: brand, brand },
      fontFamily: { sans: ['"IBM Plex Sans Thai"', 'system-ui', 'sans-serif'] },
    },
  },
};
