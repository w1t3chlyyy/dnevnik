/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        black: "#0A0A0A",
        white: "#FAFAFA",
        gray: {
          100: "#F2F2F2",
          300: "#D6D6D6",
          500: "#8A8A8A",
          700: "#3D3D3D",
          900: "#141414"
        }
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "sans-serif"]
      },
      borderRadius: {
        none: "0px",
        sm: "2px"
      }
    }
  },
  // Никакого цвета кроме чёрного/белого/серого — акцент только через контраст и толщину линий
  plugins: []
};
