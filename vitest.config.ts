import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  root: "src",
  test: {
    environment: "jsdom",
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
