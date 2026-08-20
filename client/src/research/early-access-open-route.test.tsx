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
// The shared review gate is LOCKED for this whole suite. That is the point: the
// Early Access journey must render its own content while the legacy password
// gate is shut, because that is the exact state a real visitor arrives in.
vi.mock("./core", () => ({
  useResearch: () => ({
    gate: "locked",
    member: null,
    submitPassword: vi.fn(),
    signOutMember: vi.fn(),
  }),
}));

import ResearchLayout from "./layout";

/**
 * THE EARLY ACCESS JOURNEY IS NOT BEHIND THE SHARED REVIEW PASSWORD.
 *
 * This test exists because the server side of that decision was invisible
 * without it. Every Early Access API was opened and minting anonymous sessions,
 * production reported openAccess:true, and the browser still rendered
 * "Enter the access password to continue" before the customer could reach the
 * catalog. Nothing on the server reported a problem, because nothing was wrong
 * there — the gate was one layer up, in this layout, keyed on a path allowlist
 * the route had never been added to.
 *
 * A live page is the only thing that would have caught it, which is exactly the
 * composition-level gap the founder made mandatory.
 */

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
  act(() =>
    root!.render(
      <ResearchLayout>
        <div data-testid="journey">the ordering journey</div>
      </ResearchLayout>,
    ),
  );
  return container;
}

describe("the Early Access journey renders without the shared review password", () => {
  it.each([
    ["/research/early-access"],
    ["/research/early-access/"],
    ["/research/Early-Access"],
    ["/research/early-access/order-request"],
    ["/research/early-access/order-request/confirmation/XRR-20260820-A1B2C3D4E5"],
    ["/research/early-access/order-request/XRR-20260820-A1B2C3D4E5"],
  ])("%s shows the journey, not the password page", (path) => {
    const view = renderAt(path);
    expect(view.querySelector('[data-testid="journey"]')).not.toBeNull();
    expect(view.querySelector('input[type="password"]')).toBeNull();
    expect(view.textContent).not.toMatch(/enter the access password/i);
  });
});

describe("what stays behind the shared review password", () => {
  it.each([
    ["/research/catalog"],
    ["/research/member"],
    ["/research/member/documents"],
    ["/research/orders"],
  ])("%s still shows the password page", (path) => {
    // Opening one journey must not have opened the section around it. If this
    // ever passes for a member or catalog path, the allowlist has become a
    // prefix exemption and private surfaces are rendering to anonymous callers.
    const view = renderAt(path);
    expect(view.querySelector('[data-testid="journey"]')).toBeNull();
    expect(view.textContent).toMatch(/access password/i);
  });

  it("does not admit an unlisted path that merely starts like the journey", () => {
    const view = renderAt("/research/early-access-admin");
    expect(view.querySelector('[data-testid="journey"]')).toBeNull();
    expect(view.textContent).toMatch(/access password/i);
  });
});
