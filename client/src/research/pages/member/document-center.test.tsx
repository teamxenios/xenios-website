// @vitest-environment jsdom
// The member document center (/research/member/documents-center). Covered:
//   1. Signed native agreements render (title, signer, signed date), and the
//      member's OpenSign requests render by status: a pending provider-backed
//      request offers a secure signing link (opening in a new tab) with the
//      honest "confirmed after you return" note, and a completed request shows
//      "Signed on <date>" — never a false "signed" state before completion.
//   2. When both endpoints are disabled or empty, the page renders the calm
//      "no signed documents yet" state, never an error.
// fetch is stubbed with json content-type headers, matching the api lib.

import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactNode } from "react";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { ResearchContext, type ResearchContextValue } from "../../core";
import DocumentCenter from "./DocumentCenter";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.unstubAllGlobals();
});

// Only the fields the page reads need real values (test-only cast, same
// pattern as subscriptions.test.tsx).
function fixtureContext(): ResearchContextValue {
  return {
    gate: "open",
    member: { firstName: "Sam", status: "active", applicationStatus: null },
    memberToken: "member-jwt",
    memberChecking: false,
    recovery: "none",
  } as ResearchContextValue;
}

type StubRoute = { method: string; path: string; status: number; body: unknown };

const SIGNED_PATH = "/api/research/activation/agreements/signed";
const ESIGN_PATH = "/api/research/activation/esign/documents";

function stubFetch(routes: StubRoute[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();
      const route = routes.find((r) => r.method === method && r.path === url);
      if (!route) throw new TypeError(`unstubbed fetch: ${method} ${url}`);
      return {
        status: route.status,
        ok: route.status >= 200 && route.status < 300,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => route.body,
      };
    }),
  );
}

async function renderPage(node: ReactNode): Promise<HTMLDivElement> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<ResearchContext.Provider value={fixtureContext()}>{node}</ResearchContext.Provider>);
  });
  for (let i = 0; i < 4; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  return container!;
}

function byTestId<T extends HTMLElement>(view: HTMLElement, id: string): T {
  const el = view.querySelector(`[data-testid="${id}"]`);
  if (!el) throw new Error(`missing [data-testid="${id}"]`);
  return el as T;
}

// ---------------------------------------------------------------------------
// Fixtures.
// ---------------------------------------------------------------------------

const SIGNED_AGREEMENT = {
  signature: {
    id: "sig-1",
    category: "membership_terms",
    documentVersionId: "dv-9",
    semver: "1.2.0",
    contentHash: "hash-x",
    typedLegalName: "Sam Member",
    separateAcknowledgment: false,
    signedAt: "2026-07-18T12:00:00.000Z",
  },
  document: {
    id: "doc-1",
    category: "membership_terms",
    title: "Membership Terms",
    semver: "1.2.0",
    status: "published",
    content: "The full agreement text.",
    contentHash: "hash-x",
    jurisdiction: "US",
    publishedAt: "2026-01-01T00:00:00.000Z",
    effectiveDate: "2026-01-01",
  },
};

const PENDING_REQUEST = {
  requestId: "req-pending",
  mode: "opensign_document",
  status: "viewed",
  documentVersionIds: ["dv-1"],
  signedPdfHash: null,
  certificateHash: null,
  completedAt: null,
  createdAt: "2026-07-19T12:00:00.000Z",
  signingUrl: "https://sign.example/secure/req-pending",
};

const COMPLETED_REQUEST = {
  requestId: "req-done",
  mode: "opensign_packet",
  status: "completed",
  documentVersionIds: ["dv-2"],
  signedPdfHash: "sha-s",
  certificateHash: "sha-c",
  completedAt: "2026-07-20T12:00:00.000Z",
  createdAt: "2026-07-19T12:00:00.000Z",
};

// ---------------------------------------------------------------------------

describe("Member document center", () => {
  it("renders signed agreements and e-sign requests by status", async () => {
    stubFetch([
      { method: "GET", path: SIGNED_PATH, status: 200, body: { ok: true, signed: [SIGNED_AGREEMENT] } },
      {
        method: "GET",
        path: ESIGN_PATH,
        status: 200,
        body: { ok: true, documents: [PENDING_REQUEST, COMPLETED_REQUEST] },
      },
    ]);
    const view = await renderPage(<DocumentCenter />);

    // The native signed agreement renders with its title and signer.
    const agreement = byTestId(view, "signed-agreement-sig-1");
    expect(agreement.textContent).toContain("Membership Terms");
    expect(agreement.textContent).toContain("Sam Member");
    expect(agreement.textContent).toContain("Jul 18, 2026");

    // A pending provider-backed request offers a secure signing link that
    // opens in a new tab, with the honest post-return note.
    const openLink = byTestId<HTMLAnchorElement>(view, "esign-open-signing-req-pending");
    expect(openLink.getAttribute("href")).toBe("https://sign.example/secure/req-pending");
    expect(openLink.getAttribute("target")).toBe("_blank");
    expect(openLink.getAttribute("rel")).toContain("noopener");
    expect(byTestId(view, "esign-request-req-pending").textContent).toContain("confirmed after you finish and return");

    // The completed request shows a real signed date, and no signing link.
    const done = byTestId(view, "esign-request-req-done");
    expect(done.textContent).toContain("Signed on Jul 20, 2026.");
    expect(view.querySelector('[data-testid="esign-open-signing-req-done"]')).toBeNull();

    // No false "signed" state on the pending request.
    expect(byTestId(view, "esign-request-req-pending").textContent).not.toContain("Signed on");
  });

  it("renders the calm empty state when both endpoints are disabled", async () => {
    stubFetch([
      { method: "GET", path: SIGNED_PATH, status: 200, body: { ok: false, code: "capability_disabled" } },
      { method: "GET", path: ESIGN_PATH, status: 200, body: { ok: false, code: "capability_disabled" } },
    ]);
    const view = await renderPage(<DocumentCenter />);

    expect(view.textContent).toContain("No signed documents yet.");
    // Calm, never an error.
    expect(view.querySelector('[role="alert"]')).toBeNull();
    expect(view.textContent).not.toContain("Something went wrong");
    expect(view.textContent).not.toContain("capability_disabled");
  });

  it("renders the calm empty state when the endpoints are unpublished", async () => {
    stubFetch([
      { method: "GET", path: SIGNED_PATH, status: 404, body: { ok: false } },
      { method: "GET", path: ESIGN_PATH, status: 404, body: { ok: false } },
    ]);
    const view = await renderPage(<DocumentCenter />);
    expect(view.textContent).toContain("No signed documents yet.");
    expect(view.querySelector('[role="alert"]')).toBeNull();
  });
});
