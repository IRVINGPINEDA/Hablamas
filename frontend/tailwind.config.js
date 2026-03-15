/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f2f5f7",
          100: "#e3eaee",
          200: "#cad7df",
          300: "#afc0ca",
          500: "#5f7888",
          600: "#4f6573",
          700: "#405260",
          900: "#27343d"
        }
      }
    }
  },
  plugins: []
};
