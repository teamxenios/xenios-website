import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  // The app compiles JSX with the automatic runtime (vite react plugin);
  // vitest must match or client-component tests fail with "React is not defined".
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    // Client tests opt into jsdom per-file via // @vitest-environment jsdom.
    include: ["server/**/*.test.ts", "shared/**/*.test.ts", "client/src/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "shared"),
      "@": path.resolve(__dirname, "client", "src"),
    },
  },
});
