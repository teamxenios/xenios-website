import { expect, test } from "@playwright/test";
import { mockResearchBoundary } from "./helpers";

const marketingRedirects = [
  ["/telemedicine", "/product"],
  ["/agents", "/product"],
  ["/developers", "/ecosystem"],
  ["/enterprise", "/contact"],
  ["/ontology", "/product"],
  ["/partners", "/ecosystem"],
  ["/faq", "/product"],
  ["/argos", "/mvps"],
] as const;

for (const [from, to] of marketingRedirects) {
  test(`legacy redirect ${from} -> ${to}`, async ({ page }) => {
    await page.goto(from);
    await expect(page).toHaveURL(new RegExp(`${to.replace("/", "\\/")}$`));
  });
}

test("expired member sessions recover consistently across concurrent tabs", async ({ context }) => {
  const first = await context.newPage();
  const second = await context.newPage();
  await Promise.all([mockResearchBoundary(first), mockResearchBoundary(second)]);
  await Promise.all([first.goto("/research/member"), second.goto("/research/member/profile")]);
  await expect(first).toHaveURL(/\/research\/sign-in(?:\?|$)/);
  await expect(second).toHaveURL(/\/research\/sign-in(?:\?|$)/);
  await expect(first.getByText(/sign in/i).first()).toBeVisible();
  await expect(second.getByText(/sign in/i).first()).toBeVisible();
});
