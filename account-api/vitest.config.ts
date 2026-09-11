import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const accountApiRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: accountApiRoot,
  test: {
    include: ["test/**/*.{test,spec}.{js,ts,jsx,tsx}"],
    exclude: ["**/node_modules/**", "**/dist*/**"],
  },
});
