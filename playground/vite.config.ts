import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const root = dirname(fileURLToPath(import.meta.url));

function pythonPackage(): Plugin {
  const dir = join(root, "../python/src/excel_formula");
  const payload = () => {
    const files: Record<string, string> = {};
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".py")) continue;
      files[`/pkg/excel_formula/${name}`] = readFileSync(join(dir, name), "utf8");
    }
    return JSON.stringify(files);
  };
  return {
    name: "python-package",
    configureServer(server) {
      server.middlewares.use("/python-package.json", (_req, res) => {
        res.setHeader("content-type", "application/json");
        res.end(payload());
      });
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "python-package.json", source: payload() });
    },
  };
}

export default defineConfig({
  base: process.env.VITE_BASE || "/",
  server: { port: 7500, strictPort: true, host: "0.0.0.0" },
  plugins: [pythonPackage()],
  resolve: {
    alias: {
      "@excel-formula/core": fileURLToPath(new URL("../typescript/src/index.ts", import.meta.url)),
    },
  },
});
