// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ACCESS_ROUTES, ALL_MANIFEST_ROUTES } from "../lib/routes";
import { isPublicResearchPath } from "../layout";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const research = vi.hoisted(() => ({
  value: {
    member: null as null | { firstName: string; status: string; applicationStatus: string | null },
    memberChecking: false,
    memberSessionStatus: "signed_out" as
      | "checking"
      | "authenticated"
      | "signed_out"
      | "verification_failed",
  },
}));

const seo = vi.hoisted(() => ({ calls: [] as Array<Record<string, unknown>> }));

vi.mock("../core", () => ({
  useResearch: () => research.value,
}));

vi.mock("@/components/SeoHead", () => ({
  default: (props: Record<string, unknown>) => {
    seo.calls.push(props);
    return null;
  },
}));

import OrderEntryHub from "./OrderEntryHub";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

type ResearchState = typeof research.value;

async function renderPage(
  overrides: Partial<ResearchState> = {},
  search = "",
) {
  research.value = {
    member: null,
    memberChecking: false,
    memberSessionStatus: "signed_out",
    ...overrides,
  };
  window.history.replaceState(null, "", `/research/order${search}`);
  if (!container) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  }
  await act(async () => {
    root!.render(<OrderEntryHub />);
  });
}

function action(id: string): HTMLElement {
  const element = container!.querySelector(
    `[data-testid="order-mode-action-${id}"]`,
  );
  if (!(element instanceof HTMLElement)) throw new Error(`Missing action ${id}`);
  return element;
}

function href(id: string): string | null {
  return action(id).getAttribute("href");
}

function returnTo(id: string): string | null {
  const value = href(id);
  return value ? new URL(value, "https://xenios.invalid").searchParams.get("returnTo") : null;
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  seo.calls.length = 0;
  window.history.replaceState(null, "", "/");
});

describe("OrderEntryHub", () => {
  it("renders exactly seven choices and all seven required facts for each", async () => {
    await renderPage();
    const cards = [
      ...container!.querySelectorAll<HTMLElement>(
        'article[data-testid^="order-mode-"]',
      ),
    ];
    expect(cards).toHaveLength(7);
    expect(cards.map((card) => card.dataset.testid)).toEqual([
      "order-mode-quick_early_access",
      "order-mode-member_account",
      "order-mode-resume_or_track",
      "order-mode-assisted_or_volume",
      "order-mode-organization_or_clinic",
      "order-mode-care",
      "order-mode-manual_support",
    ]);

    const requiredLabels = [
      "Who it is for",
      "Information required",
      "Account required",
      "What happens next",
      "Payment timing",
      "Where status appears",
      "Human support",
    ];
    for (const card of cards) {
      expect([...card.querySelectorAll("dt")].map((node) => node.textContent)).toEqual(
        requiredLabels,
      );
    }
  });

  it("uses canonical destinations and never deep-links a fresh browser past Early Access bootstrap", async () => {
    await renderPage();
    expect(href("quick_early_access")).toBe("/research/early-access");
    expect(returnTo("member_account")).toBe("/research/member/catalog");
    expect(returnTo("resume_or_track")).toBe("/research/account/orders");
    expect(href("assisted_or_volume")).toBe("/research/early-access");
    expect(href("assisted_or_volume")).not.toContain("order-request");
    expect(href("organization_or_clinic")).toBe("/research/organizations");
    expect(href("care")).toBe("/care/schedule");
    expect(href("manual_support")).toBe("/research/contact");
    expect(
      container!.querySelector(
        '[data-testid="order-mode-secondary-resume_or_track"]',
      )?.getAttribute("href"),
    ).toBe("/research/early-access");
  });

  it("distinguishes checking, signed-out, active, and inactive account states", async () => {
    await renderPage({ memberChecking: true, memberSessionStatus: "checking" });
    expect(container!.querySelector('[data-testid="order-account-state"]')?.textContent)
      .toContain("Checking for a Research account");
    expect(action("member_account").tagName).toBe("BUTTON");
    expect((action("member_account") as HTMLButtonElement).disabled).toBe(true);

    await renderPage();
    expect(container!.querySelector('[data-testid="order-account-state"]')?.textContent)
      .toContain("No active Research account");
    expect(returnTo("member_account")).toBe("/research/member/catalog");

    await renderPage({
      member: { firstName: "Ada", status: "active", applicationStatus: "approved" },
      memberSessionStatus: "authenticated",
    });
    expect(container!.querySelector('[data-testid="order-account-state"]')?.textContent)
      .toContain("Active Research account found");
    expect(href("member_account")).toBe("/research/member/catalog");
    expect(href("resume_or_track")).toBe("/research/account/orders");

    await renderPage({
      member: {
        firstName: "Ada",
        status: "pending_activation",
        applicationStatus: "approved",
      },
      memberSessionStatus: "authenticated",
    });
    expect(container!.querySelector('[data-testid="order-account-state"]')?.textContent)
      .toContain("needs an access step");
    expect(href("member_account")).toBe("/research/activate");
    expect(action("member_account").textContent).toContain(
      "Continue account activation",
    );
  });

  it("routes other inactive states through the existing server-status presentation", async () => {
    await renderPage({
      member: { firstName: "Ada", status: "past_due", applicationStatus: "approved" },
      memberSessionStatus: "authenticated",
    });
    expect(href("resume_or_track")).toBe(
      "/research/access-state?code=billing_past_due",
    );

    await renderPage({
      member: { firstName: "Ada", status: "paused", applicationStatus: "approved" },
      memberSessionStatus: "authenticated",
    });
    expect(href("member_account")).toBe(
      "/research/access-state?code=membership_inactive",
    );
  });

  it("shows verification failure honestly while retaining a bounded sign-in route", async () => {
    await renderPage({ memberSessionStatus: "verification_failed" });
    expect(container!.querySelector('[data-testid="order-account-state"]')?.textContent)
      .toContain("Account check unavailable");
    expect(action("member_account").textContent).toContain(
      "Sign in again to continue",
    );
    expect(returnTo("member_account")).toBe("/research/member/catalog");
  });

  it("preserves a valid product, variant, quantity, and action through sign-in", async () => {
    await renderPage(
      {},
      "?family=research_vials&slug=research-vials-bpc-157&variant=mov_v1&qty=2&intent=buy_now",
    );
    expect(returnTo("member_account")).toBe(
      "/research/member/catalog/research_vials/research-vials-bpc-157?variant=mov_v1&qty=2&intent=buy_now",
    );

    await renderPage(
      {
        member: { firstName: "Ada", status: "active", applicationStatus: "approved" },
        memberSessionStatus: "authenticated",
      },
      "?family=research_vials&slug=research-vials-bpc-157&variant=mov_v1&qty=2&intent=buy_now",
    );
    expect(href("member_account")).toBe(
      "/research/member/catalog/research_vials/research-vials-bpc-157?variant=mov_v1&qty=2&intent=buy_now",
    );
  });

  it("retains only the continuation appropriate to each account choice", async () => {
    const requested =
      "/research/account/orders/XRR-Fixture_01?tab=tracking&token=SECRET&access_token=SECRET&email=private%40example.invalid";
    await renderPage({}, `?returnTo=${encodeURIComponent(requested)}`);
    expect(returnTo("resume_or_track")).toBe(
      "/research/account/orders/XRR-Fixture_01?tab=tracking",
    );
    expect(returnTo("member_account")).toBe("/research/member/catalog");
    expect(href("resume_or_track")).not.toMatch(/SECRET|email/i);
  });

  it.each([7, 51, 100])("preserves exact selection and quantity %s through all three entry paths", async (quantity) => {
    const search = `?family=research_vials&slug=alpha&variant=mov_alpha&qty=${quantity}&intent=assisted_order`;
    const memberPath = `/research/member/catalog/research_vials/alpha?variant=mov_alpha&qty=${quantity}&intent=assisted_order`;
    for (const requested of [search, `?returnTo=${encodeURIComponent(memberPath)}`]) {
      await renderPage({}, requested);
      expect(href("quick_early_access")).toBe(`/research/early-access${search}`);
      expect(href("assisted_or_volume")).toBe(`/research/early-access${search}`);
      expect(returnTo("member_account")).toBe(memberPath);
    }
  });

  it("routes carried Care selections to Care without Research preselection", async () => {
    await renderPage({}, "?family=clinical_formulations_503a&slug=clinical&variant=mov_care&qty=1&intent=care");
    for (const mode of ["quick_early_access", "assisted_or_volume", "member_account"]) {
      expect(href(mode)).toBe("/care/schedule");
      expect(action(mode).textContent).toBe("Continue through Xenios Care");
    }
  });

  it.each([
    "?returnTo=https%3A%2F%2Foutside.invalid%2Fresearch%2Fmember%2Fcatalog",
    "?returnTo=%2Fadmin%2Fresearch%2Forders",
    "?returnTo=%2Fcare%2Fschedule",
    "?returnTo=%2Fresearch%2Fmember%2Fcatalog&returnTo=%2Fresearch%2Faccount%2Forders",
    "?family=research_vials&slug=research-vials-bpc-157&variant=mov_v1&qty=2&intent=buy_now&token=SECRET",
    "?family=research_vials&slug=research-vials-bpc-157&variant=mov_v1&qty=2&intent=buy_now&ref=PARTNER",
    "?family=research_vials&slug=alpha&variant=mov_v1&qty=2&intent=toString",
    "?family=research_vials&slug=alpha&variant=mov_v1&qty=2&intent=constructor",
    "?family=research_vials&slug=alpha&variant=mov_v1&qty=2&intent=__proto__",
  ])("drops unsafe, mixed, duplicated, or credential-bearing intent: %s", async (search) => {
    await renderPage({}, search);
    expect(returnTo("member_account")).toBe("/research/member/catalog");
    expect(returnTo("resume_or_track")).toBe("/research/account/orders");
    expect(href("quick_early_access")).toBe("/research/early-access");
    expect(href("assisted_or_volume")).toBe("/research/early-access");
    for (const link of container!.querySelectorAll("a")) {
      expect(link.getAttribute("href") ?? "").not.toMatch(
        /outside\.invalid|admin\/research|SECRET|PARTNER|[?&]ref=/,
      );
    }
  });

  it("is public at the legacy gate, unique in the manifest, and explicitly noindex", async () => {
    await renderPage();
    expect(ACCESS_ROUTES.order).toBe("/research/order");
    expect(ALL_MANIFEST_ROUTES.filter((route) => route === "/research/order"))
      .toHaveLength(1);
    expect(isPublicResearchPath("/research/order")).toBe(true);
    expect(isPublicResearchPath("/research/order/private")).toBe(false);
    expect(seo.calls.at(-1)).toMatchObject({
      path: "/research/order",
      robots: "noindex, nofollow",
    });
  });

  it("keeps one page heading, no nested main landmark, and mobile-safe wrapping hooks", async () => {
    await renderPage();
    expect(container!.querySelectorAll("h1")).toHaveLength(1);
    expect(container!.querySelector("h1")?.textContent).toBe(
      "How would you like to begin?",
    );
    expect(container!.querySelectorAll("main")).toHaveLength(0);
    expect(action("quick_early_access").style.width).toBe("100%");
    expect(action("quick_early_access").style.whiteSpace).toBe("normal");
    expect(action("quick_early_access").className).toContain(
      "public-editorial-action",
    );
    const wideContent = [...container!.querySelectorAll<HTMLElement>("div")]
      .find((node) => node.style.maxWidth === "1100px");
    expect(wideContent).toBeDefined();
  });

  it("states the Care boundary and server-owned referral continuity without exposing codes", async () => {
    await renderPage();
    expect(container!.textContent).toContain("Care stays separate");
    expect(container!.textContent).toContain("server-owned referral session");
    expect(container!.textContent).toContain("reference alone is not authorization");
    expect(href("care")).toBe("/care/schedule");
    expect(href("care")).not.toContain("research/checkout");
  });
});
