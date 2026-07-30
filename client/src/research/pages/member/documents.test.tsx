// @vitest-environment jsdom
// The member Documents page (/research/member/documents) against the REAL
// server envelope from GET /api/research/documents.
//
// server/research/documents.ts:594
//     res.json({ ok: true, documents: rows.map(toPlanDocument) });
// server/research/documents.ts:78 (toPlanDocument, the only serializer)
//     { documentId, type, title, version, templateVersion, checksumSha256,
//       status, supersedesDocumentId, reviewedBy, publishedAt, acknowledgedAt }
//
// Covered:
//   1. The POPULATED state: real rows render with title, humanized type,
//      template version, numeric version, reviewedBy, formatted publishedAt,
//      and acknowledgment derived from acknowledgedAt. The pending state must
//      NOT fire when documents are present.
//   2. An archived row shows "Archived" and never the false call to action
//      "Needs acknowledgment".
//   3. The history drawer is built from the stored facts only (published,
//      acknowledged, supersedes, template version, checksum).
//   4. No download link is fabricated: this route carries no signedUrl, so the
//      pending badge stands.
//   5. An empty list and an unpublished endpoint still render their honest
//      states, and an expired session still renders the sign-in state.
// fetch is stubbed with json content-type headers, matching the api lib.

import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactNode } from "react";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { ResearchContext, type ResearchContextValue } from "../../core";
import Documents, { normalizeDocuments } from "./Documents";

const DOCUMENTS_PATH = "/api/research/documents";

const env = import.meta.env as unknown as Record<string, unknown>;
const originalProd = env.PROD;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  env.PROD = originalProd;
  vi.unstubAllGlobals();
});

// Only the fields the page reads need real values (test-only cast, same
// pattern as document-center.test.tsx).
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
  await settle();
  return container!;
}

async function settle() {
  for (let i = 0; i < 4; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

function byTestId<T extends HTMLElement>(view: HTMLElement, id: string): T {
  const el = view.querySelector(`[data-testid="${id}"]`);
  if (!el) throw new Error(`missing [data-testid="${id}"]`);
  return el as T;
}

function cardFor(view: HTMLElement, documentId: string): HTMLElement {
  const actions = byTestId(view, `document-actions-${documentId}`);
  const card = actions.closest('[data-testid="ra-document"]');
  if (!card) throw new Error(`no document card wrapping ${documentId}`);
  return card as HTMLElement;
}

// ---------------------------------------------------------------------------
// Fixtures: exactly what toPlanDocument emits, field for field.
// ---------------------------------------------------------------------------

const CURRENT_BLUEPRINT = {
  documentId: "doc-blueprint-2",
  type: "blueprint_pdf",
  title: "Your Blueprint",
  version: 2,
  templateVersion: "3",
  checksumSha256: "a".repeat(64),
  status: "current",
  supersedesDocumentId: "doc-blueprint-1",
  reviewedBy: "Samuel",
  publishedAt: "2026-06-02T09:00:00.000Z",
  acknowledgedAt: "2026-06-04T17:30:00.000Z",
};

const UNACKNOWLEDGED_NUTRITION = {
  documentId: "doc-nutrition-1",
  type: "nutrition_plan_pdf",
  title: "Nutrition Plan",
  version: 1,
  templateVersion: "1",
  checksumSha256: "b".repeat(64),
  status: "current",
  supersedesDocumentId: null,
  reviewedBy: "Samuel",
  publishedAt: "2026-05-18T09:00:00.000Z",
  acknowledgedAt: null,
};

const ARCHIVED_BLUEPRINT = {
  documentId: "doc-blueprint-1",
  type: "blueprint_pdf",
  title: "Your Blueprint",
  version: 1,
  templateVersion: "2",
  checksumSha256: "c".repeat(64),
  status: "archived",
  supersedesDocumentId: null,
  reviewedBy: "Samuel",
  publishedAt: "2026-03-14T09:00:00.000Z",
  acknowledgedAt: null,
};

const REAL_ENVELOPE = {
  ok: true,
  documents: [CURRENT_BLUEPRINT, UNACKNOWLEDGED_NUTRITION, ARCHIVED_BLUEPRINT],
};

// ---------------------------------------------------------------------------

describe("Member Documents page", () => {
  it("renders the real server envelope: every row, mapped field by field", async () => {
    stubFetch([{ method: "GET", path: DOCUMENTS_PATH, status: 200, body: REAL_ENVELOPE }]);
    const view = await renderPage(<Documents />);

    // Populated, so the pending state must NOT fire.
    expect(view.textContent).not.toContain("Your documents appear after activation.");
    expect(view.querySelectorAll('[data-testid="ra-document"]').length).toBe(3);

    // documentId keys the row; the machine type becomes member-facing copy;
    // templateVersion and the NUMERIC version both render.
    const blueprint = cardFor(view, "doc-blueprint-2");
    expect(blueprint.textContent).toContain("Your Blueprint");
    expect(blueprint.textContent).toContain("Blueprint · template v3 · v2");
    // reviewedBy, not "reviewer".
    expect(blueprint.textContent).toContain("Reviewed by Samuel.");
    // publishedAt is an ISO timestamp, rendered as a readable date.
    expect(blueprint.textContent).toContain("Published Jun 2, 2026.");
    expect(blueprint.textContent).not.toContain("2026-06-02T09:00:00.000Z");
    // acknowledgedAt present means acknowledged.
    expect(blueprint.textContent).toContain("Acknowledged");
    expect(blueprint.textContent).not.toContain("Needs acknowledgment");

    // A current row with acknowledgedAt null is the real call to action.
    const nutrition = cardFor(view, "doc-nutrition-1");
    expect(nutrition.textContent).toContain("Nutrition plan · template v1 · v1");
    expect(nutrition.textContent).toContain("Needs acknowledgment");

    // The serializer has no storage_path, and nothing here invents one.
    expect(view.textContent).not.toContain("research-documents/");
    expect(view.textContent).not.toContain("storage");
  });

  it("shows an archived row as archived, never as a false call to action", async () => {
    stubFetch([{ method: "GET", path: DOCUMENTS_PATH, status: 200, body: REAL_ENVELOPE }]);
    const view = await renderPage(<Documents />);

    const archived = cardFor(view, "doc-blueprint-1");
    expect(archived.textContent).toContain("Archived");
    // The server refuses to acknowledge a replaced document, so the page never
    // asks the member to.
    expect(archived.textContent).not.toContain("Needs acknowledgment");
  });

  it("builds the history drawer from the stored facts only", async () => {
    stubFetch([{ method: "GET", path: DOCUMENTS_PATH, status: 200, body: REAL_ENVELOPE }]);
    const view = await renderPage(<Documents />);

    const historyButton = cardFor(view, "doc-blueprint-2").querySelector("button");
    expect(historyButton?.textContent).toContain("History");
    await act(async () => {
      (historyButton as HTMLButtonElement).click();
    });
    await settle();

    const drawer = byTestId(document.body, "document-history-doc-blueprint-2");
    expect(drawer.textContent).toContain("Blueprint · v2 · template v3 · current version");
    expect(drawer.textContent).toContain(`Checksum (SHA-256): ${"a".repeat(64)}`);

    const timeline = byTestId(document.body, "ra-timeline");
    expect(timeline.textContent).toContain("Acknowledged by you");
    expect(timeline.textContent).toContain("Version 2 published");
    expect(timeline.textContent).toContain("Template version 3.");
    // supersedesDocumentId is stated in plain language, and the opaque id of
    // the replaced document is not shown to the member.
    expect(timeline.textContent).toContain("Replaces an earlier version.");
    expect(timeline.textContent).not.toContain("doc-blueprint-1");
    // Newest first.
    const items = timeline.querySelectorAll("li");
    expect(items[0].textContent).toContain("Acknowledged by you");
    expect(items[1].textContent).toContain("Version 2 published");
  });

  it("never fabricates a download link: this route carries no signed URL", async () => {
    stubFetch([{ method: "GET", path: DOCUMENTS_PATH, status: 200, body: REAL_ENVELOPE }]);
    const view = await renderPage(<Documents />);

    expect(cardFor(view, "doc-blueprint-2").textContent).toContain("Download pending");
    // No anchor anywhere in the document list.
    expect(view.querySelectorAll('[data-testid="ra-document"] a').length).toBe(0);
  });

  it("renders the honest pending state for an empty document list", async () => {
    stubFetch([{ method: "GET", path: DOCUMENTS_PATH, status: 200, body: { ok: true, documents: [] } }]);
    const view = await renderPage(<Documents />);

    expect(view.textContent).toContain("Your documents appear after activation.");
    expect(view.querySelector('[data-testid="ra-document"]')).toBeNull();
    expect(view.querySelector('[role="alert"]')).toBeNull();
  });

  it("renders the honest pending state in production when the endpoint is unpublished", async () => {
    env.PROD = true;
    stubFetch([{ method: "GET", path: DOCUMENTS_PATH, status: 404, body: { ok: false } }]);
    const view = await renderPage(<Documents />);

    expect(view.textContent).toContain("Your documents appear after activation.");
    expect(view.textContent).not.toContain("Development preview data");
    expect(view.querySelector('[data-testid="ra-document"]')).toBeNull();
  });

  it("renders the sign-in state when the member session has expired", async () => {
    stubFetch([{ method: "GET", path: DOCUMENTS_PATH, status: 401, body: { ok: false } }]);
    const view = await renderPage(<Documents />);

    expect(view.textContent).toContain("Please sign in.");
    expect(view.querySelector('[data-testid="ra-document"]')).toBeNull();
  });

  it("keeps the dev preview honest: fixtures flow through the same normalizer", async () => {
    env.PROD = false;
    stubFetch([{ method: "GET", path: DOCUMENTS_PATH, status: 404, body: { ok: false } }]);
    const view = await renderPage(<Documents />);

    expect(view.textContent).toContain("Development preview data");
    expect(cardFor(view, "fixture-blueprint-v2").textContent).toContain("Blueprint · template v3 · v2");
    expect(cardFor(view, "fixture-blueprint-v1").textContent).toContain("Archived");
  });
});

describe("normalizeDocuments", () => {
  it("reads the { ok, documents } envelope and tolerates a bare array", () => {
    expect(normalizeDocuments(REAL_ENVELOPE).map((d) => d.documentId)).toEqual([
      "doc-blueprint-2",
      "doc-nutrition-1",
      "doc-blueprint-1",
    ]);
    expect(normalizeDocuments([CURRENT_BLUEPRINT]).map((d) => d.documentId)).toEqual(["doc-blueprint-2"]);
  });

  it("drops rows with no documentId and never invents missing fields", () => {
    const docs = normalizeDocuments({
      ok: true,
      documents: [
        { type: "other", title: "No id here", version: 1 },
        null,
        { documentId: "doc-sparse" },
      ],
    });
    expect(docs.length).toBe(1);
    const sparse = docs[0];
    expect(sparse.documentId).toBe("doc-sparse");
    expect(sparse.version).toBeNull();
    expect(sparse.templateVersion).toBeNull();
    expect(sparse.reviewedBy).toBeNull();
    expect(sparse.publishedAt).toBeNull();
    expect(sparse.acknowledgedAt).toBeNull();
    expect(sparse.status).toBeNull();
    expect(sparse.title).toBe("Untitled document");
  });
});
