import { expect, type Page } from "@playwright/test";

export async function mockResearchBoundary(page: Page) {
  await page.route("**/api/**", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, code: "not_configured", message: "QA fixture: unavailable." }),
    });
  });
  await page.route("**/api/research/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ configured: true, authed: true, publicMode: true }),
    });
  });
  await page.route("**/api/research/member/me", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, message: "Unauthorized" }),
    });
  });
}

export async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    offenders: [...document.querySelectorAll("body *")].flatMap((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.right <= document.documentElement.clientWidth + 1 && rect.left >= -1) return [];
      return [{
        html: element.outerHTML.slice(0, 160),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        width: Math.round(rect.width),
      }];
    }).slice(0, 8),
  }));
  expect(
    dimensions.scrollWidth,
    `horizontal overflow: ${dimensions.scrollWidth}px content in ${dimensions.clientWidth}px viewport; offenders=${JSON.stringify(dimensions.offenders)}`,
  ).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

export async function expectMinimumTouchTargets(page: Page) {
  const tooSmall = await page.locator(
    "button:visible, input:visible, select:visible, textarea:visible, [role=button]:visible, nav a:visible",
  ).evaluateAll((elements) => {
    const targets = elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        element,
        rect,
        centerX: rect.left + rect.width / 2,
        centerY: rect.top + rect.height / 2,
      };
    });
    return targets.flatMap((target, index) => {
      const { element, rect } = target;
      const disabled = element.matches(":disabled,[aria-disabled=true]");
      if (disabled || rect.width >= 24 && rect.height >= 24) return [];
      // WCAG 2.2 SC 2.5.8 permits a target smaller than 24x24 when a
      // centered 24px circle does not intersect another target.
      const collides = targets.some((other, otherIndex) => {
        if (index === otherIndex) return false;
        return Math.hypot(target.centerX - other.centerX, target.centerY - other.centerY) < 24;
      });
      if (!collides) return [];
      return [{
        element: element.outerHTML.slice(0, 180),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      }];
    });
  });
  expect(tooSmall, "WCAG 2.2 target-size failures").toEqual([]);
}

export async function expectNoSensitiveBrowserState(page: Page) {
  const state = await page.evaluate(() => ({
    url: location.href,
    local: Object.entries(localStorage),
    session: Object.entries(sessionStorage),
  }));
  const serialized = JSON.stringify(state);
  expect(serialized).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./);
  expect(serialized).not.toMatch(/(?:service[_-]?role|authorization|password|prescription|assessmentAnswers)/i);
}
