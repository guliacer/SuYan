import path from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // Dynamic feature chunks must resolve the exact same React instance as
      // the entry chunk. Without explicit aliases, pnpm's nested dependency
      // paths can make a lazy chunk bundle its own React copy; hooks then see
      // a null dispatcher when that chunk renders under react-dom.
      react: path.resolve(__dirname, "node_modules/react"),
      "react-dom": path.resolve(__dirname, "node_modules/react-dom"),
      "react/jsx-runtime": path.resolve(__dirname, "node_modules/react/jsx-runtime.js"),
      "react/jsx-dev-runtime": path.resolve(__dirname, "node_modules/react/jsx-dev-runtime.js"),
    },
    dedupe: ["react", "react-dom"],
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
  },
  test: {
    include: ["tests/unit/**/*.{test,spec}.{js,ts,jsx,tsx}"],
    exclude: [
      "**/node_modules/**",
      "**/node_modules.recovery-*/**",
      "**/dist*/**",
      "**/release*/**",
    ],
  },
});
