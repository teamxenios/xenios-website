// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Route } from "wouter";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Apply from "./Apply";
import ApplyStatus from "./ApplyStatus";
import Gateway from "./Gateway";
import LegalPage from "./LegalPage";
import PolicyPage from "./PolicyPage";
import Support from "./Support";
import { fetchPolicies } from "../core";

vi.mock("../core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../core")>();
  const refreshMember = vi.fn(async () => {});
  return { ...actual, fetchPolicies: vi.fn(), useResearch: () => ({ recovery: "none", refreshMember }) };
});

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.restoreAllMocks();
  vi.mocked(fetchPolicies).mockReset();
  window.sessionStorage.clear();
  window.history.replaceState({}, "", "/");
});

async function render(component: React.ReactNode): Promise<HTMLDivElement> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(component);
  });
  return container;
}

function links(view: HTMLElement): string[] {
  return Array.from(view.querySelectorAll<HTMLAnchorElement>("a")).map(
    (anchor) => anchor.getAttribute("href") ?? "",
  );
}

function assertSinglePageHeading(view: HTMLElement) {
  expect(view.querySelectorAll("h1")).toHaveLength(1);
}

function assertKeyboardReachableActions(view: HTMLElement) {
  const actions = Array.from(view.querySelectorAll<HTMLElement>("a, button"));
  expect(actions.length).toBeGreaterThan(0);
  for (const action of actions) {
    expect(action.getAttribute("tabindex")).not.toBe("-1");
    if (action instanceof HTMLAnchorElement) expect(action.hasAttribute("href")).toBe(true);
    if (action instanceof HTMLButtonElement) expect(action.disabled).toBe(false);
  }
}

describe("Research public application flow", () => {
  it("keeps the editorial gateway on reviewed public access doors", async () => {
    const view = await render(<Gateway />);
    assertSinglePageHeading(view);

    const hrefs = links(view);
    expect(hrefs).toContain("/research/access-hub");
    expect(hrefs).toContain("/care");
    expect(hrefs).toContain("/research/quality");
    expect(hrefs).toContain("/research/sign-in");
    expect(hrefs).toContain("/research/how-it-works");
    expect(hrefs).toContain("/research/about");
    expect(hrefs).toContain("/research/faq");
    expect(hrefs).toContain("/research/policies");
    expect(hrefs).toContain("/research/contact");
    expect(hrefs).toContain("/research/privacy");
    expect(hrefs).toContain("/research/terms");
    expect(hrefs).toContain("/research/support");
    expect(hrefs.some((href) => /catalog|products|shop|supplements/i.test(href))).toBe(false);
    assertKeyboardReachableActions(view);
  });

  it("renders a truthful Documentation Pending application state with no write control", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const view = await render(<Apply />);

    assertSinglePageHeading(view);
    expect(view.querySelector('[data-testid="application-documentation-pending"]')).not.toBeNull();
    expect(view.textContent).toContain("Documentation pending");
    expect(view.textContent).toContain("No application has been started or saved");
    expect(view.querySelector("form")).toBeNull();
    expect(view.querySelector('input[type="checkbox"]')).toBeNull();
    expect(view.querySelector('[data-testid="button-apply-submit"]')).toBeNull();
    expect(view.querySelector('[data-testid="link-application-support"]')?.getAttribute("href"))
      .toBe("/research/support");
    expect(links(view)).toContain("/research/terms");
    expect(links(view)).toContain("/research/privacy");
    assertKeyboardReachableActions(view);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("contains no application mutation endpoint or submission primitive in source", () => {
    const sourcePath = resolve(dirname(fileURLToPath(import.meta.url)), "Apply.tsx");
    const source = readFileSync(sourcePath, "utf8");
    expect(source).not.toContain("/api/research/applications");
    expect(source).not.toContain('method: "POST"');
    expect(source).not.toContain("<form");
    expect(source).not.toContain('type="checkbox"');
  });

  for (const width of [320, 375, 768, 1024, 1440]) {
    it(`preserves public-page structural invariants at ${width}px`, async () => {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
      window.dispatchEvent(new Event("resize"));

      const gateway = await render(<Gateway />);
      expect(gateway.querySelectorAll("main")).toHaveLength(1);
      assertSinglePageHeading(gateway);
      expect(gateway.querySelector('[data-testid="link-gateway-apply"]')).not.toBeNull();
      expect(gateway.querySelector('[data-testid="link-gateway-pathways"]')).not.toBeNull();
      expect(gateway.querySelector('[data-testid="link-gateway-access-hub"]')).not.toBeNull();
      expect(gateway.querySelector<HTMLAnchorElement>('.rg-skip-link')?.getAttribute("href"))
        .toBe("#research-main");
      const hero = gateway.querySelector<HTMLImageElement>('.rg-hero-image');
      expect(hero?.getAttribute("width")).toBe("1586");
      expect(hero?.getAttribute("height")).toBe("992");
      assertKeyboardReachableActions(gateway);
      expect(gateway.querySelectorAll("nav[aria-label]").length).toBeGreaterThanOrEqual(3);

      act(() => root!.unmount());
      root = null;
      container!.remove();
      container = null;

      const apply = await render(<Apply />);
      expect(apply.querySelectorAll("main")).toHaveLength(0);
      assertSinglePageHeading(apply);
      expect(apply.querySelector('[role="status"]')).not.toBeNull();
      const supportAction = apply.querySelector<HTMLElement>('[data-testid="link-application-support"]');
      expect(supportAction?.classList.contains("btn")).toBe(true);
      assertKeyboardReachableActions(apply);
    });
  }

  it("keeps support truthful and mobile-safe without an unverified response-time promise", async () => {
    const view = await render(<Support />);
    assertSinglePageHeading(view);
    expect(view.textContent).not.toMatch(/within two business days/i);
    const email = view.querySelector<HTMLAnchorElement>(
      'a[href="mailto:research@xeniostechnology.com"]',
    );
    expect(email).not.toBeNull();
    expect(email?.style.maxWidth).toBe("100%");
    expect(email?.style.whiteSpace).toBe("normal");
  });

  it("uses the shared loading treatment while a signed status lookup is pending", async () => {
    window.sessionStorage.setItem("xr-application-token", "signed-status-token");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise(() => {}));
    const view = await render(<ApplyStatus />);
    expect(view.querySelector('[data-testid="ra-loading"]')).not.toBeNull();
    expect(view.querySelectorAll("h1")).toHaveLength(1);
    expect(fetchSpy).toHaveBeenCalledExactlyOnceWith(
      "/api/research/applications/status?token=signed-status-token",
      expect.objectContaining({ credentials: "same-origin", cache: "no-store", referrerPolicy: "no-referrer" }),
    );
  });

  it("keeps resend feedback enumeration-safe and announces its outcome", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, message: "A private record exists." }),
    } as Response);
    const view = await render(<ApplyStatus />);
    expect(view.querySelector('[data-testid="ra-error"]')).not.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();

    const input = view.querySelector<HTMLInputElement>('[data-testid="input-resend-email"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        input,
        "member@example.com",
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const form = input.closest("form")!;
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    const message = view.querySelector('[data-testid="text-resend-message"]');
    expect(message?.getAttribute("role")).toBe("status");
    expect(message?.textContent).toBe(
      "If an application exists for that address, a secure status link has been requested.",
    );
    expect(message?.textContent).not.toContain("private record");
    expect(message?.textContent).not.toMatch(/sent|on its way/i);
    expect(fetchSpy).toHaveBeenCalledExactlyOnceWith(
      "/api/research/applications/resend-link",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ email: "member@example.com" }) }),
    );
  });

  const draftPolicy = {
    title: "Terms of Service",
    updated: "July 2026",
    sections: [
      {
        heading: "Draft status",
        paragraphs: ["This starter language is an operational draft for qualified counsel."],
      },
      {
        heading: "Accounts",
        paragraphs: ["Starter account language for review."],
      },
    ],
  };

  it("never hides the LegalPage draft marker or presents starter language as accepted", async () => {
    vi.mocked(fetchPolicies).mockResolvedValue({ terms: draftPolicy });
    const view = await render(<LegalPage kind="terms" />);

    expect(view.querySelector('[data-testid="legal-draft-status"]')).not.toBeNull();
    expect(view.querySelector('[data-testid="legal-operational-draft"]')).not.toBeNull();
    expect(view.textContent).toContain("Draft status");
    expect(view.textContent).toContain("operational draft");
    expect(view.textContent).toContain("has not been approved for acceptance");
    expect(view.querySelector('input[type="checkbox"]')).toBeNull();
    expect(view.querySelector("form")).toBeNull();
    expect(
      Array.from(view.querySelectorAll("button")).some((button) =>
        /accept|approve|submit|final/i.test(button.textContent ?? ""),
      ),
    ).toBe(false);
  });

  it("treats a policy fetch failure as a public documentation outage", async () => {
    vi.mocked(fetchPolicies).mockResolvedValue(null);
    const view = await render(<LegalPage kind="privacy" />);

    expect(view.textContent).toContain("Documentation temporarily unavailable");
    expect(view.textContent).toContain("The public Privacy Policy could not be loaded");
    expect(view.textContent).not.toMatch(/private gateway|enter through the gateway|cookie/i);
    expect(
      Array.from(view.querySelectorAll("button")).some((button) =>
        /try again/i.test(button.textContent ?? ""),
      ),
    ).toBe(true);
    expect(links(view)).toContain("/research/support");
    assertKeyboardReachableActions(view);
  });

  it("keeps legacy PolicyPage drafts visibly pending with no acceptance action", async () => {
    window.history.replaceState({}, "", "/research/policies/terms");
    vi.mocked(fetchPolicies).mockResolvedValue({ terms: draftPolicy });
    const view = await render(
      <Route path="/research/policies/:policy">
        <PolicyPage />
      </Route>,
    );

    expect(view.querySelector('[data-testid="policy-draft-status"]')).not.toBeNull();
    expect(view.querySelector('[data-testid="policy-operational-draft"]')).not.toBeNull();
    expect(view.textContent).toContain("Draft status");
    expect(view.textContent).toContain("Documentation pending");
    expect(view.querySelector('input[type="checkbox"]')).toBeNull();
    expect(view.querySelector("form")).toBeNull();
    expect(
      Array.from(view.querySelectorAll("button")).some((button) =>
        /accept|approve|submit|final/i.test(button.textContent ?? ""),
      ),
    ).toBe(false);
  });

  it("fails a rejected legacy policy request closed instead of loading forever", async () => {
    window.history.replaceState({}, "", "/research/policies/privacy");
    vi.mocked(fetchPolicies).mockRejectedValue(new Error("synthetic policy outage"));
    const view = await render(
      <Route path="/research/policies/:policy">
        <PolicyPage />
      </Route>,
    );

    expect(view.textContent).toContain("Policy documentation is temporarily unavailable");
    expect(view.textContent).toContain("will not substitute starter text");
    expect(view.querySelector('[data-testid="ra-loading"]')).toBeNull();
    expect(links(view)).toContain("/research/support");
    expect(view.querySelector("form")).toBeNull();
    assertKeyboardReachableActions(view);
  });

  it("does not infer Shipping approval when the source omits publication metadata", async () => {
    window.history.replaceState({}, "", "/research/policies/shipping");
    vi.mocked(fetchPolicies).mockResolvedValue({
      shipping: {
        title: "Shipping Policy",
        updated: "July 2026",
        sections: [{
          heading: "Fulfillment model",
          paragraphs: ["Starter architecture language for review."],
        }],
      },
    });
    const view = await render(
      <Route path="/research/policies/:policy">
        <PolicyPage />
      </Route>,
    );

    expect(view.textContent).toContain("Publication status unconfirmed");
    expect(view.textContent).toContain("does not provide authoritative approval metadata");
    expect(view.querySelector('[data-testid="policy-operational-draft"]')).not.toBeNull();
    expect(view.querySelector('[data-testid="policy-served-document"]')).toBeNull();
    expect(view.querySelector("form")).toBeNull();
  });

  it("labels Research-use as served without inventing publication approval", async () => {
    window.history.replaceState({}, "", "/research/policies/research-use");
    vi.mocked(fetchPolicies).mockResolvedValue({
      "research-use": {
        title: "Research Use Policy",
        updated: "July 2026",
        sections: [{
          heading: "Purpose",
          paragraphs: ["Served Research-use boundaries."],
        }],
      },
    });
    const view = await render(
      <Route path="/research/policies/:policy">
        <PolicyPage />
      </Route>,
    );

    expect(view.querySelector('[data-testid="policy-served-document"]')).not.toBeNull();
    expect(view.querySelector('[data-testid="policy-operational-draft"]')).toBeNull();
    expect(view.textContent).not.toMatch(/approved policy|publication approved/i);
  });
});
