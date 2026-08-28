// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Route } from "wouter";
import LotVerification from "./LotVerification";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DOCUMENT_ID = "11111111-1111-4111-8111-111111111111";
let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

const body = (kind: "not_found" | "unavailable") => kind === "not_found"
  ? { kind, code: "public_lot_not_found", message: "HOSTILE_SOURCE_TEXT" }
  : { kind, code: "quality_source_unavailable", message: "HOSTILE_SOURCE_TEXT" };

const successBody = {
  kind: "ok",
  lot: {
    lotCode: "LOT-ALPHA-01",
    productName: "Reference material alpha",
    variantLabel: "5 mg vial",
    sourceLabel: "Xenios approved quality record",
    status: "released",
    statusAsOf: "2026-08-27T18:00:00.000Z",
    approvedForPublicAt: "2026-08-27T18:05:00.000Z",
    documents: [{
      documentId: DOCUMENT_ID,
      title: "Certificate of analysis",
      sourceLabel: "Independent laboratory record",
      documentType: "certificate_of_analysis",
      status: "available",
      statusAsOf: "2026-08-27T18:01:00.000Z",
      issuedAt: "2026-08-26T18:00:00.000Z",
      reviewedAt: "2026-08-27T18:00:00.000Z",
      metadataApprovedForPublicAt: "2026-08-27T18:05:00.000Z",
      downloadApprovedForPublicAt: "2026-08-27T18:06:00.000Z",
      testCategories: ["identity", "purity"],
      downloadPath: `/api/research/quality/lots/LOT-ALPHA-01/documents/${DOCUMENT_ID}`,
    }],
  },
};

async function mountAt(path: string, fetcher: typeof fetch): Promise<HTMLDivElement> {
  window.history.replaceState({}, "", path);
  vi.stubGlobal("fetch", vi.fn(fetcher));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<Route path="/research/lots/:lotCode"><LotVerification /></Route>);
    await Promise.resolve();
  });
  return host;
}

async function flushReactWork(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}

describe("public lot verification UI", () => {
  it("shows a truthful loading state until the exact response resolves", async () => {
    const view = await mountAt("/research/lots/LOT-ALPHA-01", () => new Promise<Response>(() => {}));
    expect(view.querySelectorAll("h1")).toHaveLength(1);
    expect(view.querySelector('[data-testid="public-lot-result-loading"]')?.getAttribute("role")).toBe("status");
    expect(view.textContent).toContain("No status is shown until the exact response is verified");
    expect(view.textContent).not.toContain("Released");
  }, 15_000);

  it("keeps not-found and source-unavailable states visibly distinct without hostile text", async () => {
    for (const [kind, status, expected] of [
      ["not_found", 404, "No approved public match."],
      ["unavailable", 503, "Verification is unavailable."],
    ] as const) {
      const view = await mountAt("/research/lots/LOT-ALPHA-01", async () => new Response(JSON.stringify(body(kind)), { status }));
      await act(async () => {
        await vi.waitFor(() => expect(view.textContent).toContain(expected));
      });
      expect(view.textContent).not.toContain("HOSTILE_SOURCE_TEXT");
      expect(view.textContent).not.toContain("Released");
      act(() => root!.unmount()); root = null; view.remove(); host = null;
    }
  });

  it("renders the exact public record and only its derived same-origin PDF link", async () => {
    const view = await mountAt("/research/lots/lot-alpha-01", async () => new Response(JSON.stringify(successBody), { status: 200 }));
    await act(async () => {
      await vi.waitFor(() => expect(view.querySelector('[data-testid="public-lot-result-ok"]')).not.toBeNull());
    });
    expect(view.textContent).toContain("Reference material alpha");
    expect(view.textContent).toContain("LOT-ALPHA-01");
    expect(view.textContent).toContain("Released");
    expect(view.textContent).toContain("Identity");
    expect(view.textContent).toContain("Xenios approved quality record");
    expect(view.textContent).toContain("Independent laboratory record");
    expect(view.textContent).toContain("not a safety, clinical, potency, sterility, or suitability conclusion");
    const link = view.querySelector<HTMLAnchorElement>('[data-testid="public-lot-document-link"]')!;
    expect(link.getAttribute("href")).toBe(successBody.lot.documents[0].downloadPath);
    expect(link.getAttribute("rel")).toContain("noreferrer");
    expect(link.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(link.getAttribute("aria-label")).toBe("Download Certificate of analysis PDF");
    expect(link.textContent).toContain("Download PDF");
    expect(view.innerHTML).not.toMatch(/signedUrl|storageKey|uploadUrl/);
  });

  it("turns a malformed or external document projection into unavailable, never a link", async () => {
    const hostile = {
      ...successBody,
      lot: {
        ...successBody.lot,
        documents: [{ ...successBody.lot.documents[0], downloadPath: "https://storage.example/HOSTILE_PRIVATE_MARKER" }],
      },
    };
    const view = await mountAt("/research/lots/LOT-ALPHA-01", async () => new Response(JSON.stringify(hostile), { status: 200 }));
    await act(async () => {
      await vi.waitFor(() => expect(view.textContent).toContain("Verification is unavailable."));
    });
    expect(view.querySelector('[data-testid="public-lot-document-link"]')).toBeNull();
    expect(view.innerHTML).not.toContain("HOSTILE_PRIVATE_MARKER");
  });

  it("lets the same exact lot retry an unavailable source without inventing a new route", async () => {
    let calls = 0;
    const view = await mountAt("/research/lots/LOT-ALPHA-01", async () => {
      calls += 1;
      return calls === 1
        ? new Response(JSON.stringify(body("unavailable")), { status: 503 })
        : new Response(JSON.stringify(successBody), { status: 200 });
    });
    await act(async () => {
      await vi.waitFor(() => expect(view.textContent).toContain("Verification is unavailable."));
    });
    act(() => {
      view.querySelector<HTMLFormElement>("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await flushReactWork();
    expect(view.querySelector('[data-testid="public-lot-result-ok"]')).not.toBeNull();
    expect(calls).toBe(2);
    expect(window.location.pathname).toBe("/research/lots/LOT-ALPHA-01");
  });

  it("renders partial evidence without treating an empty document list as authoritative absence", async () => {
    const partial = {
      kind: "partial",
      code: "quality_source_partial",
      message: "HOSTILE_SOURCE_TEXT",
      incomplete: ["documents"],
      lot: { ...successBody.lot, documents: [] },
    };
    const view = await mountAt(
      "/research/lots/LOT-ALPHA-01",
      async () => new Response(JSON.stringify(partial), { status: 200 }),
    );
    await act(async () => {
      await vi.waitFor(() => expect(view.querySelector('[data-testid="public-lot-result-partial"]')).not.toBeNull());
    });
    expect(view.textContent).toContain("Partial exact public match");
    expect(view.textContent).toContain("No document absence");
    expect(view.textContent).not.toContain("HOSTILE_SOURCE_TEXT");
  });

  it("uses fixed local copy for rate limits and upstream invalid-request messages", async () => {
    for (const [status, payload, expected] of [
      [429, { kind: "rate_limited", code: "public_quality_rate_limited", message: "HOSTILE_SOURCE_TEXT" }, "Try again shortly."],
      [400, { kind: "invalid_request", code: "invalid_lot_code", message: "HOSTILE_SOURCE_TEXT" }, "Check the lot code."],
    ] as const) {
      const view = await mountAt(
        "/research/lots/LOT-ALPHA-01",
        async () => new Response(JSON.stringify(payload), { status }),
      );
      await act(async () => {
        await vi.waitFor(() => expect(view.textContent).toContain(expected));
      });
      expect(view.textContent).not.toContain("HOSTILE_SOURCE_TEXT");
      act(() => root!.unmount()); root = null; view.remove(); host = null;
    }
  });

  it("prevents an older lot response from replacing a newer exact lookup", async () => {
    let resolveFirst!: (response: Response) => void;
    const newer = {
      ...successBody,
      lot: {
        ...successBody.lot,
        lotCode: "LOT-BETA-02",
        productName: "Reference material beta",
        documents: [],
      },
    };
    const view = await mountAt("/research/lots/LOT-ALPHA-01", async (input) => {
      if (String(input).endsWith("LOT-ALPHA-01")) {
        return new Promise<Response>((resolve) => { resolveFirst = resolve; });
      }
      return new Response(JSON.stringify(newer), { status: 200 });
    });
    const input = view.querySelector<HTMLInputElement>('input[name="lotCode"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "LOT-BETA-02");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => {
      input.closest("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await flushReactWork();
    expect(view.textContent).toContain("Reference material beta");
    await act(async () => {
      resolveFirst(new Response(JSON.stringify(successBody), { status: 200 }));
      await Promise.resolve();
    });
    expect(view.textContent).toContain("Reference material beta");
    expect(view.textContent).not.toContain("Reference material alpha");
  });

  it.each([
    "/research/lots/ab",
    "/research/lots/LOT%2FPRIVATE",
  ])("treats malformed route code %s as invalid without fetching", async (path) => {
    const fetcher = vi.fn();
    const view = await mountAt(path, fetcher as never);
    expect(view.querySelector('[data-testid="public-lot-result-invalid_request"]')).not.toBeNull();
    expect(view.textContent).toContain("Check the lot code.");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
