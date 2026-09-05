// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("wouter", () => ({
  useLocation: () => [window.location.pathname, vi.fn()],
  Link: ({ href, children, ...props }: any) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/components/Wordmark", () => ({ default: () => <span>xenios</span> }));
// This is signed-out route/chrome coverage, not a recovery-purpose session.
// Recovery credentials and private-data denial are exercised separately in
// recovery-isolation.test.tsx and the ordinary Auth/partner boundary tests.
vi.mock("./core", () => ({
  useResearch: () => ({
    gate: "locked",
    member: null,
    memberToken: null,
    recovery: "none",
    submitPassword: vi.fn(),
    signOutMember: vi.fn(),
  }),
}));

import ResearchLayout from "./layout";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
});

function renderAt(path: string) {
  window.history.replaceState(null, "", path);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(
    <ResearchLayout>
      <div data-testid="recovery-content">recovery controls</div>
    </ResearchLayout>,
  ));
  return container;
}

describe("recovery route chrome isolation", () => {
  it.each([
    "/research",
    "/research/",
    "/Research",
    "/research/%61pply",
  ])("keeps the public gateway/application journey outside the shared gate at %s", (path) => {
    const view = renderAt(path);
    expect(view.querySelector('[data-testid="recovery-content"]')).toBeTruthy();
    expect(view.querySelector('[data-testid="form-research-access"]')).toBeNull();
  });

  it.each([
    "/research/apply",
    "/research/apply/review",
    "/research/apply/success",
    "/research/about",
    "/research/how-it-works",
    "/research/faq",
    "/research/policies",
    "/research/contact",
    "/research/organizations",
    "/research/partners",
    "/research/affiliates",
    "/research/quality",
    "/research/testing",
    "/research/documents",
    "/research/lots/LOT-ALPHA-01",
    "/research/support",
    "/research/privacy",
    "/research/terms",
    "/research/policies/privacy",
  ])("mounts public Research routes in minimal chrome without the shared gate at %s", (path) => {
    const view = renderAt(path);
    expect(view.querySelector('[data-testid="recovery-content"]')).toBeTruthy();
    expect(view.querySelector('[data-testid="form-research-access"]')).toBeNull();
    expect(view.querySelectorAll("main")).toHaveLength(1);
    expect(view.textContent).toContain("Back to gateway");
    expect(view.querySelector('nav[aria-label="Research information"]')).toBeTruthy();
  });

  it.each([
    "/research/partners/apply",
    "/research/partners/payouts",
    "/research/partners/dashboard/extra",
    "/research/partners/links/extra",
    "/research/organizations/private",
    "/research/affiliates/private",
  ])("keeps B2B descendants behind the shared review gate at %s", (path) => {
    const view = renderAt(path);
    expect(view.querySelector('[data-testid="recovery-content"]')).toBeNull();
    expect(view.querySelector('[data-testid="form-research-access"]')).toBeTruthy();
  });

  it.each([
    "/research/partners/dashboard",
    "/research/partners/links",
  ])("lets exact partner entry %s mount its own account chrome and authorization boundary", (path) => {
    const view = renderAt(path);
    // Reaching the routed boundary is not a partner-access grant. These
    // pages verify normal Auth and their own private server authorities.
    expect(view.querySelector('[data-testid="recovery-content"]')).toBeTruthy();
    expect(view.querySelector('[data-testid="form-research-access"]')).toBeNull();
    expect(view.querySelector('nav[aria-label="Research information"]')).toBeNull();
    expect(view.querySelector('a[href="/research"]')).toBeNull();
  });

  it.each([
    ["/research/about", "about-public-content"],
    ["/research/how-it-works", "how-it-works-public-content"],
    ["/research/faq", "faq-public-content"],
    ["/research/policies", "policies-public-content"],
    ["/research/contact", "contact-public-content"],
  ])("keeps %s public with its own routed content", (path, uniqueContent) => {
    window.history.replaceState(null, "", path);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root!.render(
      <ResearchLayout>
        <div data-testid={uniqueContent}>{uniqueContent}</div>
      </ResearchLayout>,
    ));

    expect(container.querySelector(`[data-testid="${uniqueContent}"]`)).toBeTruthy();
    expect(container.querySelector('[data-testid="form-research-access"]')).toBeNull();
    expect(container.querySelectorAll("main")).toHaveLength(1);
  });

  it.each([
    "/research/reset-password",
    "/research/reset-password/",
    "/Research/reset-password",
    "/research/%72eset-password",
  ])("mounts the navigation-free recovery chrome outside the shared gate at %s", (path) => {
    const view = renderAt(path);
    expect(view.querySelector('[data-testid="recovery-content"]')).toBeTruthy();
    expect(view.querySelector('[data-testid="form-research-access"]')).toBeNull();
    expect(view.querySelector('a[href="/research"]')).toBeNull();
    expect(view.querySelector('a[href*="/policies/"]')).toBeNull();
    expect(view.textContent).not.toContain("Back to gateway");
    expect(view.textContent).not.toContain("Privacy");
    expect(view.textContent).not.toContain("Terms");
  });

  it("mounts member password sign-in outside the shared gate in isolated account chrome", () => {
    const view = renderAt("/research/sign-in");
    expect(view.querySelector('[data-testid="recovery-content"]')).toBeTruthy();
    expect(view.querySelector('[data-testid="form-research-access"]')).toBeNull();
    expect(view.querySelector('a[href="/research"]')).toBeNull();
  });

  it.each([
    "/research/activate",
    "/research/activate/",
    "/Research/Activate",
    "/research/%61ctivate",
  ])("mounts membership activation in isolated account chrome at %s", (path) => {
    const view = renderAt(path);
    expect(view.querySelector('[data-testid="recovery-content"]')).toBeTruthy();
    expect(view.querySelector('[data-testid="form-research-access"]')).toBeNull();
    expect(view.querySelector('a[href="/research"]')).toBeNull();
    expect(view.querySelector('a[href*="/policies/"]')).toBeNull();
  });

  it.each([
    "/research/access-state",
    "/research/access-state/",
    "/Research/Access-State",
    "/research/%61ccess-state",
  ])("mounts the member access-state screens in isolated account chrome, never behind the shared gate, at %s", (path) => {
    // Their audience is exactly the visitor who is NOT an authenticated
    // member (recovery-purpose sessions, lapsed billing, inactive
    // membership) - a password wall here would dead-end the screens for the
    // people they explain things to.
    const view = renderAt(path);
    expect(view.querySelector('[data-testid="recovery-content"]')).toBeTruthy();
    expect(view.querySelector('[data-testid="form-research-access"]')).toBeNull();
  });

  it.each([
    "/research/apply/status",
    "/research/application/status",
    "/research/application-status",
    "/research/application-status/",
    "/Research/Apply/Status",
    "/research/%61pply/status",
  ])("mounts token-scoped application status in isolated account chrome at %s", (path) => {
    const view = renderAt(path);
    expect(view.querySelector('[data-testid="recovery-content"]')).toBeTruthy();
    expect(view.querySelector('[data-testid="form-research-access"]')).toBeNull();
    expect(view.querySelector('a[href="/research"]')).toBeNull();
    expect(view.querySelector('a[href*="/policies/"]')).toBeNull();
  });

  it.each([1440, 720, 375, 320])(
    "keeps the routed signed-out member catalog gate to one main and one H1 at %dpx",
    (width) => {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: width,
      });

      const view = renderAt("/research/member/products");
      const main = view.querySelector("main");

      expect(view.querySelectorAll("main")).toHaveLength(1);
      expect(view.querySelectorAll("h1")).toHaveLength(1);
      expect(main?.querySelector('[data-testid="form-research-access"]')).toBeTruthy();
      expect(main?.querySelector("h1")?.textContent).toBe("This area is under review.");
    },
  );
});
