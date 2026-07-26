import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { expectNoHorizontalOverflow, expectNoSensitiveBrowserState } from "./helpers";

const sitemap = fs.readFileSync(path.resolve("public/sitemap.xml"), "utf8");
const publicRoutes = [...sitemap.matchAll(/<loc>https:\/\/xeniostechnology\.com([^<]*)<\/loc>/g)]
  .map((match) => match[1] || "/")
  .filter((route) => !route.endsWith(".txt"));

for (const route of publicRoutes) {
  test(`public route ${route} renders with route-level SEO`, async ({ page }) => {
    const response = await page.goto(route, { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBeLessThan(400);
    await expect(page.locator("body")).toBeVisible();
    await expect(page).toHaveTitle(/\S+/);
    const description = await page.locator('meta[name="description"]').getAttribute("content");
    expect(description?.trim().length ?? 0).toBeGreaterThanOrEqual(20);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /^https:\/\/xeniostechnology\.com/);
    await expectNoHorizontalOverflow(page);
    await expectNoSensitiveBrowserState(page);
  });
}

const accessibilityRoutes = ["/", "/product", "/waitlist", "/contact", "/privacy", "/careers"];
for (const route of accessibilityRoutes) {
  test(`WCAG automated scan ${route}`, async ({ page }) => {
    await page.goto(route, { waitUntil: "networkidle" });
    await page.addStyleTag({
      content: `
        *, *::before, *::after {
          animation-duration: 0s !important;
          transition-duration: 0s !important;
        }
        .reveal { opacity: 1 !important; transform: none !important; }
      `,
    });
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    const blocking = result.violations.filter((violation) =>
      violation.impact === "critical" || violation.impact === "serious",
    );
    expect(blocking).toEqual([]);
  });
}
