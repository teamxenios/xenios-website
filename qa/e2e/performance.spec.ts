import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const budgets = JSON.parse(fs.readFileSync(path.resolve("qa/performance-budgets.json"), "utf8"));

test("local browser performance stays within Web Vitals budgets", async ({ page }) => {
  await page.addInitScript(() => {
    const metrics = { lcp: 0, cls: 0, inp: 0 };
    (window as any).__qaVitals = metrics;
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1];
      if (last) metrics.lcp = last.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as any) {
        if (!entry.hadRecentInput) metrics.cls += entry.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as any) {
          metrics.inp = Math.max(metrics.inp, entry.duration ?? 0);
        }
      }).observe({ type: "event", buffered: true, durationThreshold: 16 } as any);
    } catch {
      // Older Chromium can omit the Event Timing observer. LCP/CLS still gate.
    }
  });

  await page.goto("/", { waitUntil: "networkidle" });
  await page.goto("/product", { waitUntil: "networkidle" });
  await page.waitForTimeout(250);
  const metrics = await page.evaluate(() => (window as any).__qaVitals as { lcp: number; cls: number; inp: number });

  expect(metrics.lcp).toBeGreaterThan(0);
  // The dev server transforms modules on request, so its repeatable lab gate
  // is intentionally separate from the production LCP budget. Production
  // evidence must still meet lcpMs after Website 2 deploys the built assets.
  expect(metrics.lcp).toBeLessThanOrEqual(budgets.webVitals.lcpLocalLabMs);
  expect(metrics.cls).toBeLessThanOrEqual(budgets.webVitals.cls);
  if (metrics.inp > 0) expect(metrics.inp).toBeLessThanOrEqual(budgets.webVitals.inpMs);
});
