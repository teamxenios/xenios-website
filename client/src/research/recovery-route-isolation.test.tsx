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
vi.mock("./core", () => ({
  useResearch: () => ({
    gate: "locked",
    member: null,
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

  it("keeps non-recovery pre-member pages behind the shared password gate", () => {
    const view = renderAt("/research/sign-in");
    expect(view.querySelector('[data-testid="recovery-content"]')).toBeNull();
    expect(view.querySelector('[data-testid="form-research-access"]')).toBeTruthy();
  });
});
