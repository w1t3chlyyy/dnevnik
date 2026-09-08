/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#08080a",
        "bg-soft": "#0e0e11",
        ink: "#f5f5f3",
        line: "rgba(245, 245, 243, 0.13)",
        accent: "#8b7bff",
        "accent-2": "#5ee6c8"
      },
      fontFamily: {
        sans: ["Montserrat", "-apple-system", "sans-serif"],
        display: ["Unbounded", "-apple-system", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"]
      },
      borderRadius: {
        none: "0px",
        sm: "10px",
        DEFAULT: "16px",
        md: "18px",
        lg: "22px",
        xl: "26px",
        "2xl": "30px",
        "3xl": "36px",
        glass: "28px",
        pill: "999px"
      },
      backdropBlur: {
        xs: "2px"
      },
      keyframes: {
        "rise-in": {
          from: { opacity: 0, transform: "translateY(14px) scale(0.985)" },
          to: { opacity: 1, transform: "translateY(0) scale(1)" }
        },
        "pop-in": {
          "0%": { opacity: 0, transform: "scale(0.9)" },
          "60%": { opacity: 1, transform: "scale(1.02)" },
          "100%": { opacity: 1, transform: "scale(1)" }
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" }
        },
        "goal-complete": {
          "0%": { transform: "scale(1)", opacity: 1 },
          "35%": { transform: "scale(1.03)", opacity: 1 },
          "100%": { transform: "scale(0.85)", opacity: 0, maxHeight: "0px" }
        },
        "ring-pulse": {
          "0%, 100%": { opacity: 0.5, transform: "scale(1)" },
          "50%": { opacity: 0.9, transform: "scale(1.06)" }
        },
        "float-slow": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" }
        },
        "check-draw": {
          from: { strokeDashoffset: 24 },
          to: { strokeDashoffset: 0 }
        }
      },
      animation: {
        "rise-in": "rise-in 0.7s cubic-bezier(0.16, 1, 0.3, 1) both",
        "pop-in": "pop-in 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) both",
        shimmer: "shimmer 2.6s linear infinite",
        "goal-complete": "goal-complete 0.7s cubic-bezier(0.4, 0, 0.2, 1) both",
        "ring-pulse": "ring-pulse 2.2s ease-in-out infinite",
        "float-slow": "float-slow 5s ease-in-out infinite",
        "check-draw": "check-draw 0.5s ease-out 0.15s both"
      }
    }
  },
  plugins: []
};
