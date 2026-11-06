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
import { act, useLayoutEffect } from "react";
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
function fixtureContext(overrides: Partial<ResearchContextValue> = {}): ResearchContextValue {
  return {
    gate: "open",
    member: { firstName: "Sam", status: "active", applicationStatus: null },
    memberToken: "member-jwt",
    memberChecking: false,
    recovery: "none",
    ...overrides,
  } as ResearchContextValue;
}

type StubRoute = { method: string; path: string; status: number; body: unknown; token?: string; waitFor?: Promise<void> };

function deferredRead() {
  let release!: () => void;
  const waitFor = new Promise<void>((resolve) => { release = resolve; });
  return { waitFor, release };
}

const SIGNED_PATH = "/api/research/activation/agreements/signed";
const ESIGN_PATH = "/api/research/activation/esign/documents";

function stubFetch(routes: StubRoute[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();
      const bearer = new Headers(init?.headers).get("authorization");
      const route = routes.find((r) => r.method === method && r.path === url
        && (r.token === undefined || bearer === "Bearer " + r.token));
      if (!route) throw new TypeError(`unstubbed fetch: ${method} ${url}`);
      if (route.waitFor) await route.waitFor;
      return {
        status: route.status,
        ok: route.status >= 200 && route.status < 300,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => route.body,
      };
    }),
  );
}

// Layout effects observe the committed DOM before passive effects can clear stale rows.
function CommitProbe({ record }: { record: () => void }) {
  useLayoutEffect(record);
  return null;
}

async function rerenderPage(node: ReactNode, context: ResearchContextValue, record?: () => void) {
  await act(async () => {
    root!.render(
      <ResearchContext.Provider value={context}>
        {node}
        {record && <CommitProbe record={record} />}
      </ResearchContext.Provider>,
    );
  });
}

async function renderPage(node: ReactNode, context = fixtureContext()): Promise<HTMLDivElement> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await rerenderPage(node, context);
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

const tokenA = "synthetic-document-owner-a";
const tokenB = "synthetic-document-owner-b";
const ownerA = fixtureContext({ memberToken: tokenA });
const ownerB = fixtureContext({
  member: { firstName: "Fixture B", status: "active", applicationStatus: null },
  memberToken: tokenB,
});

describe("document center read recovery", () => {
  it("removes A's rendered documents in the first commit for B", async () => {
    const b = deferredRead();
    stubFetch([
      { method: "GET", path: SIGNED_PATH, token: tokenA, status: 200, body: { signed: [SIGNED_AGREEMENT] } },
      { method: "GET", path: ESIGN_PATH, token: tokenA, status: 200, body: { documents: [PENDING_REQUEST] } },
      { method: "GET", path: SIGNED_PATH, token: tokenB, status: 200, body: { signed: [] }, waitFor: b.waitFor },
      { method: "GET", path: ESIGN_PATH, token: tokenB, status: 200, body: { documents: [COMPLETED_REQUEST] }, waitFor: b.waitFor },
    ]);
    const view = await renderPage(<DocumentCenter />, ownerA);
    expect(view.textContent).toContain("Membership Terms");
    expect(byTestId(view, "esign-open-signing-req-pending")).toBeTruthy();

    const commits: Array<{ text: string; hasSigningLink: boolean }> = [];
    await rerenderPage(<DocumentCenter />, ownerB, () => {
      commits.push({ text: view.textContent ?? "", hasSigningLink: !!view.querySelector('[data-testid="esign-open-signing-req-pending"]') });
    });
    expect(commits).toHaveLength(1);
    expect(commits[0].text).not.toContain("Membership Terms");
    expect(commits[0].hasSigningLink).toBe(false);
    expect(view.querySelector('[data-testid="esign-request-req-done"]')).toBeNull();

    await act(async () => b.release());
    expect(byTestId(view, "esign-request-req-done")).toBeTruthy();
    expect(view.textContent).not.toContain("Membership Terms");
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("discards A's late document responses after B's reads have loaded", async () => {
    const a = deferredRead();
    stubFetch([
      { method: "GET", path: SIGNED_PATH, token: tokenA, status: 200, body: { signed: [SIGNED_AGREEMENT] }, waitFor: a.waitFor },
      { method: "GET", path: ESIGN_PATH, token: tokenA, status: 200, body: { documents: [PENDING_REQUEST] }, waitFor: a.waitFor },
      { method: "GET", path: SIGNED_PATH, token: tokenB, status: 200, body: { signed: [] } },
      { method: "GET", path: ESIGN_PATH, token: tokenB, status: 200, body: { documents: [COMPLETED_REQUEST] } },
    ]);
    const view = await renderPage(<DocumentCenter />, ownerA);
    await rerenderPage(<DocumentCenter />, ownerB);
    expect(byTestId(view, "esign-request-req-done")).toBeTruthy();

    await act(async () => a.release());
    expect(byTestId(view, "esign-request-req-done")).toBeTruthy();
    expect(view.textContent).not.toContain("Membership Terms");
    expect(view.querySelector('[data-testid="esign-request-req-pending"]')).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("recovers document reads after an unauthorized result when a fresh token arrives", async () => {
    const refreshedToken = "synthetic-document-owner-a-refreshed";
    stubFetch([
      { method: "GET", path: SIGNED_PATH, token: tokenA, status: 401, body: { ok: false } },
      { method: "GET", path: ESIGN_PATH, token: tokenA, status: 200, body: { documents: [PENDING_REQUEST] } },
      { method: "GET", path: SIGNED_PATH, token: refreshedToken, status: 200, body: { signed: [SIGNED_AGREEMENT] } },
      { method: "GET", path: ESIGN_PATH, token: refreshedToken, status: 200, body: { documents: [] } },
    ]);
    const view = await renderPage(<DocumentCenter />, ownerA);
    expect(view.textContent).toContain("Please sign in.");
    expect(view.querySelector('[data-testid="esign-request-req-pending"]')).toBeNull();

    await rerenderPage(<DocumentCenter />, { ...ownerA, memberToken: refreshedToken });
    expect(view.textContent).toContain("Membership Terms");
    expect(view.textContent).not.toContain("Please sign in.");
    expect(fetch).toHaveBeenCalledTimes(4);
  });
  it("distinguishes failed reads from confirmed empty history and retries only on an explicit action", async () => {
    const routes = [
      { method: "GET", path: SIGNED_PATH, status: 500, body: { ok: false, message: "private diagnostic" } as unknown },
      { method: "GET", path: ESIGN_PATH, status: 500, body: { ok: false } as unknown },
    ];
    stubFetch(routes); const view = await renderPage(<DocumentCenter />);
    expect(view.textContent).not.toContain("No signed documents yet.");
    expect(view.textContent).toContain("Some document history could not be loaded.");
    expect(view.textContent).not.toContain("private diagnostic");
    const retry = [...view.querySelectorAll("button")].find(b => b.textContent === "Retry document history");
    expect(retry).toBeTruthy(); expect(fetch).toHaveBeenCalledTimes(2);
    routes[0].status = 200; routes[0].body = { ok: true, signed: [] };
    routes[1].status = 200; routes[1].body = { ok: true, documents: [] };
    await act(async () => retry!.click());
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(view.textContent).toContain("No signed documents yet.");
    expect(view.textContent).not.toContain("Some document history could not be loaded.");
    for (const [, init] of vi.mocked(fetch).mock.calls) expect(init?.method ?? "GET").toBe("GET");
  });
  it("keeps successfully returned signed agreements visible while the e-signature read fails", async () => {
    stubFetch([
      { method: "GET", path: SIGNED_PATH, status: 200, body: { ok: true, signed: [SIGNED_AGREEMENT] } },
      { method: "GET", path: ESIGN_PATH, status: 500, body: { ok: false } },
    ]);
    const view = await renderPage(<DocumentCenter />);
    expect(view.textContent).toContain("Membership Terms");
    expect(view.textContent).toContain("Some document history could not be loaded.");
    expect(view.textContent).not.toContain("No signed documents yet.");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("keeps successfully returned e-sign documents visible while the signed-agreement read fails", async () => {
    stubFetch([
      { method: "GET", path: SIGNED_PATH, status: 500, body: { ok: false } },
      { method: "GET", path: ESIGN_PATH, status: 200, body: { ok: true, documents: [COMPLETED_REQUEST] } },
    ]);
    const view = await renderPage(<DocumentCenter />);
    expect(view.querySelector('[data-testid="esign-request-req-done"]')).not.toBeNull();
    expect(view.textContent).toContain("Some document history could not be loaded.");
    expect(view.textContent).not.toContain("No signed documents yet.");
  });
  it("does not display documents from a partial result when either source requires sign-in", async () => {
    stubFetch([
      { method: "GET", path: SIGNED_PATH, status: 401, body: { ok: false } },
      { method: "GET", path: ESIGN_PATH, status: 200, body: { ok: true, documents: [COMPLETED_REQUEST] } },
    ]);
    const view = await renderPage(<DocumentCenter />);
    expect(view.querySelector('[data-testid="esign-request-req-done"]')).toBeNull();
    expect(view.textContent).not.toContain("Some document history could not be loaded.");
  });
});

// ---------------------------------------------------------------------------
