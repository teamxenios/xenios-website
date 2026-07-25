import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import {
  expectMinimumTouchTargets,
  expectNoHorizontalOverflow,
  expectNoSensitiveBrowserState,
  mockResearchBoundary,
} from "./helpers";

const routes = ["/", "/waitlist", "/research", "/research/apply", "/research/sign-in"];

for (const route of routes) {
  test(`@responsive ${route} reflows and preserves accessible controls`, async ({ page }) => {
    await mockResearchBoundary(page);
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectMinimumTouchTargets(page);
    await expectNoSensitiveBrowserState(page);

    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
      .disableRules(["color-contrast"])
      .analyze();
    const blocking = result.violations.filter((violation) =>
      violation.impact === "critical" || violation.impact === "serious",
    );
    expect(blocking).toEqual([]);
  });
}

test("@responsive keyboard focus enters the primary navigation", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const focused = page.locator(":focus");
  await expect(focused).toBeVisible();
  await expect(focused).toHaveCSS("outline-style", /^(?!none$).+/);
});

test("@responsive required forms expose labels and invalid state", async ({ page }) => {
  await mockResearchBoundary(page);
  await page.goto("/research/apply");
  const controls = page.locator("input:visible, select:visible, textarea:visible");
  await expect(controls.first()).toBeVisible();
  expect(await controls.count()).toBeGreaterThan(0);
  for (const control of await controls.all()) {
    const type = await control.getAttribute("type");
    if (type === "hidden") continue;
    const id = await control.getAttribute("id");
    const aria = await control.getAttribute("aria-label");
    const labelledBy = await control.getAttribute("aria-labelledby");
    const wrappingLabel = await control.evaluate((element) => Boolean(element.closest("label")));
    const explicitLabel = id ? await page.locator(`label[for="${id}"]`).count() : 0;
    expect(Boolean(aria || labelledBy || wrappingLabel || explicitLabel), "form control needs an accessible label").toBe(true);
  }

  const submit = page.locator('button[type="submit"]:visible').first();
  if (await submit.count()) {
    await submit.click();
    const invalidCount = await page.locator(":invalid").count();
    expect(invalidCount).toBeGreaterThan(0);
  }
});
