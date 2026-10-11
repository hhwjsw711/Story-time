import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import convexPlugin from "@convex-dev/eslint-plugin";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores([
    ".claude/",
    "dist/",
    ".output/",
    ".tanstack/",
    "src/routeTree.gen.ts",
    "convex/_generated/",
    "convex/components/*/_generated/",
    "src/components/ui/",
    "worker-configuration.d.ts",
    "public/maplibre-gl-worker.mjs",
  ]),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  ...convexPlugin.configs.recommended,
]);
