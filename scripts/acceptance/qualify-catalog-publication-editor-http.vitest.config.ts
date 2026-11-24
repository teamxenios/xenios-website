import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
const repo = fileURLToPath(new URL("../../", import.meta.url));
export default defineConfig({
  root: repo,
  cacheDir: ".qa-publication-editor-http-cache",
  esbuild: { jsx: "automatic" },
  css: { postcss: { plugins: [] } },
  test: {
    environment: "node",
    setupFiles: [fileURLToPath(new URL("./catalog-publication-editor-http.setup.ts", import.meta.url))],
    include: ["scripts/acceptance/catalog-publication-editor-http.test.tsx"],
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 35000,
    hookTimeout: 10000,
  },
});
