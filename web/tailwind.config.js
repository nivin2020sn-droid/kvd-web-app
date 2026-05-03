/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          yellow: "#FFD600",
          green: "#00E676",
          red: "#FF3B30",
          orange: "#FF9500",
          blue: "#3B82F6",
          darkred: "#991B1B"
        },
        surface: {
          DEFAULT: "#0F0F0F",
          card: "#1A1A1A",
          border: "#2A2A2A"
        }
      },
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "Inter", "sans-serif"],
        mono: ["SFMono-Regular", "Menlo", "monospace"]
      }
    }
  },
  plugins: []
};
