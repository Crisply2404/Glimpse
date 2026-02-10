import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/app/**/*.{js,ts,jsx,tsx,mdx}", "./src/components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      keyframes: {
        "drop-in": {
          "0%": { transform: "translateY(14px) scale(0.98)", opacity: "0" },
          "100%": { transform: "translateY(0) scale(1)", opacity: "1" },
        },
        "gacha-shake": {
          "0%, 100%": { transform: "translateX(0)" },
          "25%": { transform: "translateX(-5px) rotate(-1deg)" },
          "75%": { transform: "translateX(5px) rotate(1deg)" },
        },
      },
      animation: {
        drop: "drop-in 0.35s cubic-bezier(0.2, 0.9, 0.2, 1)",
        shake: "gacha-shake 0.2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
