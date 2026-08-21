import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  // The app compiles JSX with the automatic runtime (vite react plugin);
  // vitest must match or client-component tests fail with "React is not defined".
  esbuild: { jsx: "automatic" },
  // Tests must not run the app's PostCSS pipeline.
  //
  // Without this, vitest falls back to postcss.config.js, which lists
  // `tailwindcss` as a direct PostCSS plugin. Tailwind v4 moved that to
  // @tailwindcss/postcss and now THROWS when used the old way, so any test
  // that transitively imports a .css file dies with a PostCSS error rather
  // than a test failure. vite.config.ts already neutralizes it the same way,
  // which is why `npm run build` was unaffected and this stayed hidden.
  //
  // It surfaced as an ORDER-DEPENDENT red: EarlyAccessRoute.storefront.test.tsx
  // passes in a full-directory run and fails run alone, because whether the
  // lazy assisted-order chunk (and its CSS) loads inside the test window
  // depends on how fast the config probe resolves. A worker verifying the
  // storefront on its own file therefore saw a false red on green code.
  //
  // Empty plugin list, not a real pipeline: no assertion depends on Tailwind
  // output, and processing it would only cost time.
  css: { postcss: { plugins: [] } },
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
