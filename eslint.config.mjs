import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Tool output and agent work copies (they hold their own node_modules).
    ".claude/**",
    ".playwright-mcp/**",
    "graphify-out/**",
    "public/ide-lab-workers/**",
  ]),
]);

export default eslintConfig;
