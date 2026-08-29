import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

// Standalone config for the evidence tooling's own unit tests (pure parsers,
// reporters, manifest merge). The shared root vitest.config.ts is Lead-owned;
// fold in with `"scripts/evidence/**/*.test.mjs"` if desired.
//
//   npx vitest run --config scripts/evidence/vitest.config.mjs
export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(repoRoot, "client/src"),
      "@shared": resolve(repoRoot, "shared"),
    },
  },
  test: {
    environment: "node",
    include: ["scripts/evidence/**/*.test.mjs"],
  },
});
