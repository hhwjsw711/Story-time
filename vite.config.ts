import { defineConfig, loadEnv } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { devtools } from "@tanstack/devtools-vite";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";

import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { lazyPlugins } from "vite-plus";

const config = defineConfig(({ command, mode }) => {
  // Link previews need an absolute og:image URL, which comes from VITE_APP_URL.
  if (command === "build" && !loadEnv(mode, process.cwd(), "VITE_").VITE_APP_URL) {
    console.warn("VITE_APP_URL isn't set: shared links won't show a preview image.");
  }
  return {
    resolve: { tsconfigPaths: true },
    plugins: lazyPlugins(() => [
      devtools(),
      cloudflare({ viteEnvironment: { name: "ssr" } }),
      tailwindcss(),
      tanstackStart(),
      viteReact(),
    ]),
  };
});

export default config;
