import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PUBLIC_LOT_COMPOSED_SERVER_LOOKUP_MAX_MS,
  PUBLIC_LOT_FETCH_TIMEOUT_MARGIN_MS,
  PUBLIC_LOT_FETCH_TIMEOUT_MS,
  fetchPublicLot,
} from "./public-lot-api";

const DOCUMENT_ID = "11111111-1111-4111-8111-111111111111";
const responseRecord = {
  kind: "ok" as const,
  lot: {
    lotCode: "LOT-ALPHA-01",
    productName: "Reference material alpha",
    variantLabel: null,
    sourceLabel: "Xenios approved quality record",
    status: "released" as const,
    statusAsOf: "2026-08-27T18:00:00.000Z",
    approvedForPublicAt: "2026-08-27T18:05:00.000Z",
    documents: [{
      documentId: DOCUMENT_ID,
      title: "Certificate of analysis",
      sourceLabel: "Independent laboratory record",
      documentType: "certificate_of_analysis" as const,
      status: "available" as const,
      statusAsOf: "2026-08-27T18:01:00.000Z",
      issuedAt: "2026-08-26T18:00:00.000Z",
      reviewedAt: "2026-08-27T18:00:00.000Z",
      metadataApprovedForPublicAt: "2026-08-27T18:05:00.000Z",
      downloadApprovedForPublicAt: "2026-08-27T18:06:00.000Z",
      testCategories: ["identity" as const],
      downloadPath: `/api/research/quality/lots/LOT-ALPHA-01/documents/${DOCUMENT_ID}`,
    }],
  },
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function expectAbortedSignal(value: unknown): void {
  expect(value).toBeInstanceOf(AbortSignal);
  if (!(value instanceof AbortSignal)) {
    throw new Error("expected a captured AbortSignal");
  }
  expect(value.aborted).toBe(true);
}

describe("public lot browser adapter", () => {
  it("keeps the browser deadline above the valid composed server lookup envelope", () => {
    expect(PUBLIC_LOT_COMPOSED_SERVER_LOOKUP_MAX_MS).toBe(8_500);
    expect(PUBLIC_LOT_FETCH_TIMEOUT_MARGIN_MS).toBe(3_500);
    expect(PUBLIC_LOT_FETCH_TIMEOUT_MS).toBe(12_000);
    expect(PUBLIC_LOT_FETCH_TIMEOUT_MS).toBeGreaterThan(
      PUBLIC_LOT_COMPOSED_SERVER_LOOKUP_MAX_MS,
    );
    expect(PUBLIC_LOT_FETCH_TIMEOUT_MS).toBe(
      PUBLIC_LOT_COMPOSED_SERVER_LOOKUP_MAX_MS + PUBLIC_LOT_FETCH_TIMEOUT_MARGIN_MS,
    );
  });

  it("rejects invalid input without a network request", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect((await fetchPublicLot("../../private")).kind).toBe("invalid_request");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("normalizes the exact path and uses a public no-store, no-referrer request", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(responseRecord), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetcher);
    expect((await fetchPublicLot(" lot-alpha-01 ")).kind).toBe("ok");
    expect(fetcher).toHaveBeenCalledWith(
      "/api/research/quality/lots/LOT-ALPHA-01",
      expect.objectContaining({
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
        referrerPolicy: "no-referrer",
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("fails closed on a wrong exact lot, private field, external URL, malformed JSON, or status/body mismatch", async () => {
    const cases = [
      new Response(JSON.stringify({
        ...responseRecord,
        lot: { ...responseRecord.lot, lotCode: "LOT-BETA-02", documents: [] },
      }), { status: 200 }),
      new Response(JSON.stringify({ ...responseRecord, signedUrl: "https://storage.example/private" }), { status: 200 }),
      new Response(JSON.stringify({
        ...responseRecord,
        lot: {
          ...responseRecord.lot,
          documents: [{
            ...responseRecord.lot.documents[0],
            downloadApprovalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          }],
        },
      }), { status: 200 }),
      new Response(JSON.stringify({
        ...responseRecord,
        lot: {
          ...responseRecord.lot,
          documents: [{
            ...responseRecord.lot.documents[0],
            downloadPath: "https://storage.example/private",
          }],
        },
      }), { status: 200 }),
      new Response("not json", { status: 200 }),
      new Response(JSON.stringify(responseRecord), { status: 404 }),
    ];
    for (const response of cases) {
      vi.stubGlobal("fetch", vi.fn(async () => response));
      expect((await fetchPublicLot("LOT-ALPHA-01")).kind).toBe("unavailable");
    }
  });

  it("preserves complete, partial, not-found, unavailable, and rate-limited states", async () => {
    const bodies = [
      { status: 200, body: responseRecord },
      {
        status: 200,
        body: {
          kind: "partial",
          code: "quality_source_partial",
          message: "Only part of the source is available.",
          incomplete: ["documents"],
          lot: { ...responseRecord.lot, documents: [] },
        },
      },
      { status: 404, body: { kind: "not_found", code: "public_lot_not_found", message: "No approved public record was found for that lot code." } },
      { status: 503, body: { kind: "unavailable", code: "public_quality_guard_unavailable", message: "Public lot verification is temporarily unavailable." } },
      { status: 429, body: { kind: "rate_limited", code: "public_quality_rate_limited", message: "Public verification is temporarily busy." } },
    ] as const;
    for (const item of bodies) {
      vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(item.body), { status: item.status })));
      expect((await fetchPublicLot("LOT-ALPHA-01")).kind).toBe(item.body.kind);
    }
  });

  it("bounds a fetch that never settles and returns unavailable", async () => {
    vi.useFakeTimers();
    let fetchSignal: AbortSignal | null = null;
    vi.stubGlobal("fetch", vi.fn((_input, init) => {
      fetchSignal = init?.signal ?? null;
      return new Promise<Response>(() => undefined);
    }));
    const result = fetchPublicLot("LOT-ALPHA-01", undefined, 5);
    await vi.advanceTimersByTimeAsync(5);
    expect((await result).kind).toBe("unavailable");
    expectAbortedSignal(fetchSignal);
  });

  it("keeps caller abort distinct so route cleanup cannot become an outage result", async () => {
    vi.stubGlobal("fetch", vi.fn((_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("aborted", "AbortError"));
      }, { once: true });
    })));
    const controller = new AbortController();
    const result = fetchPublicLot("LOT-ALPHA-01", controller.signal, 50);
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
  });
});
