import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#fef6ed",
          100: "#fdecd9",
          200: "#fad8b3",
          300: "#f5bd80",
          400: "#f0a55e",
          500: "#ee9d4e",
          600: "#d97e2e",
          700: "#b8621c",
          800: "#934d18",
          900: "#773f16",
          950: "#40200a",
        },
        cream: {
          50: "#fefcf7",
          100: "#fbf6ea",
          200: "#f5ede0",
          300: "#ecddd0",
        },
        charcoal: {
          700: "#454b52",
          800: "#32373c",
          900: "#232629",
        },
      },
      fontFamily: {
        sora: ["Sora", "sans-serif"],
        sans: ["Open Sans", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
