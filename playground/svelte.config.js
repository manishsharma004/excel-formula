import { fileURLToPath } from "node:url";
import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

const base = (process.env.VITE_BASE || "/").replace(/\/$/, "");

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      pages: "dist",
      assets: "dist",
      fallback: undefined,
    }),
    paths: { base },
    alias: {
      "@excel-formula/core": fileURLToPath(new URL("../typescript/src/index.ts", import.meta.url)),
    },
    prerender: { handleHttpError: "warn" },
  },
};

export default config;
