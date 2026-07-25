import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { expectNoHorizontalOverflow, mockResearchBoundary } from "./helpers";

const galleryPages = [
  "dashboard",
  "assessment",
  "blueprint",
  "xenios-30",
  "xenios-90",
  "documents",
  "profile",
  "tracker",
  "products",
  "cart",
  "checkout",
  "guides",
  "orders",
  "subscriptions",
  "questions",
  "referrals",
];

for (const galleryPage of galleryPages) {
  test(`fixture journey ${galleryPage} renders an honest state`, async ({ page }) => {
    await mockResearchBoundary(page);
    await page.goto(`/research/__gallery/${galleryPage}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toBeVisible();
    await expect(page.locator("main, [role=main], section").first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
      .disableRules(["color-contrast"])
      .analyze();
    expect(result.violations.filter((violation) => violation.impact === "critical")).toEqual([]);
  });
}

test("unauthenticated member route recovers to sign-in", async ({ page }) => {
  await mockResearchBoundary(page);
  await page.goto("/research/member");
  await expect(page).toHaveURL(/\/research\/sign-in(?:\?|$)/);
});

test("Care remains disabled and absent from the indexable route set", async ({ page }) => {
  const response = await page.goto("/care");
  expect(response?.status()).toBeLessThan(400);
  await expect(page.getByText(/not found|page/i).first()).toBeVisible();
  const sitemap = await (await page.request.get("/sitemap.xml")).text();
  expect(sitemap).not.toMatch(/xeniostechnology\.com\/care(?:[</])/);
});
