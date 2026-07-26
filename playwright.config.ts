import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.QA_PORT ?? 4173);
const baseURL = process.env.QA_BASE_URL ?? `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./qa/e2e",
  outputDir: "./test-results/playwright",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["json", { outputFile: "test-results/playwright/results.json" }],
  ],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    reducedMotion: "reduce",
    colorScheme: "light",
  },
  expect: {
    timeout: 10_000,
  },
  webServer: process.env.QA_BASE_URL
    ? undefined
    : {
        command: `npx vite --host 127.0.0.1 --port ${port}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          ...process.env,
          NODE_ENV: "development",
        },
      },
  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } },
    },
    {
      name: "mobile-320",
      grep: /@responsive/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 320, height: 720 }, isMobile: true, hasTouch: true },
    },
    {
      name: "mobile-375",
      grep: /@responsive/,
      use: { ...devices["iPhone 13"], browserName: "chromium" },
    },
    {
      name: "mobile-430",
      grep: /@responsive/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true },
    },
    {
      name: "tablet",
      grep: /@responsive/,
      use: { ...devices["iPad (gen 7)"], browserName: "chromium" },
    },
  ],
});
