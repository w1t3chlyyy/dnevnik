/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#08080a",
        "bg-soft": "#0e0e11",
        ink: "#f5f5f3",
        line: "rgba(245, 245, 243, 0.13)"
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "sans-serif"],
        display: ["Fraunces", "Georgia", "serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"]
      },
      borderRadius: {
        none: "0px",
        sm: "2px"
      },
      backdropBlur: {
        xs: "2px"
      },
      keyframes: {
        "rise-in": {
          from: { opacity: 0, transform: "translateY(14px)" },
          to: { opacity: 1, transform: "translateY(0)" }
        }
      },
      animation: {
        "rise-in": "rise-in 0.6s cubic-bezier(0.16, 1, 0.3, 1) both"
      }
    }
  },
  // Строго монохромная палитра — акценты только через прозрачность, блюр и толщину линий
  plugins: []
};
