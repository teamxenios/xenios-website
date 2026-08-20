import { defineConfig } from "vitest/config";
import path from "path";

// The launch-invariant suite runs standalone so it needs no change to the
// shared root config, which this lane does not own:
//
//   npx vitest run --config e2e/vitest.config.ts
//
// The lead can fold it into the default suite with one line when convenient;
// the integration snippet is in e2e/README.md.
export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["e2e/**/*.spec.ts"],
  },
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "..", "shared"),
      "@": path.resolve(__dirname, "..", "client", "src"),
    },
  },
});
