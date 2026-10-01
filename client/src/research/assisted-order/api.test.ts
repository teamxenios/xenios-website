import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ASSISTED_ORDER_STATUS_TOKEN_HEADER,
  acceptAssistedOrderQuote,
  createAssistedOrderUploadTicket,
  loadAssistedOrderQuote,
  loadAssistedOrderStatus,
  uploadAssistedOrderDocument,
} from "./api";

function successfulJson(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("owner-bound customer quote transport and projection", () => {
  const publicReference = "XRR-20260930-ABCDEF1234";
  const quote = {
    requestId: "11111111-1111-4111-8111-111111111111", publicReference,
    quoteId: "22222222-2222-4222-8222-222222222222", version: 3, state: "issued",
    lines: [{ lineId: "33333333-3333-4333-8333-333333333333", productName: "Synthetic research item",
      specification: "10 mg", quantity: 2, unitPriceCents: 16927, lineTotalCents: 33854, currency: "USD" }],
    totalCents: 33854, currency: "USD" as const, validUntil: "2099-09-30T20:00:00Z",
    customerNote: null, acceptanceId: null, acceptedAt: null,
  };
  const acceptance = { quoteId: quote.quoteId, version: quote.version, totalCents: quote.totalCents,
    currency: quote.currency, acceptanceId: "44444444-4444-4444-8444-444444444444", acceptedAt: "2026-09-30T12:00:00Z" };

  it("gets an owner quote with only the member header and discards unprojected private fields", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(successfulJson({ ...quote, pricing_basis: { private: true } }));
    vi.stubGlobal("fetch", fetchMock);
    const actual = await loadAssistedOrderQuote(publicReference, "old-guest", "member-current");
    expect(actual).toEqual(quote);
    expect(actual).not.toHaveProperty("pricing_basis");
    expect(fetchMock).toHaveBeenCalledWith(`/api/research/early-access/assisted-orders/${publicReference}/quote`,
      expect.objectContaining({ credentials: "include", cache: "no-store", redirect: "error",
        headers: { accept: "application/json", Authorization: "Bearer member-current" } }));
  });

  it("accepts only the displayed quote echo with a header-only guest credential", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(successfulJson({ ...acceptance, replayed: false }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await acceptAssistedOrderQuote(publicReference, quote, "guest?private=token")).toEqual(acceptance);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api/research/early-access/assisted-orders/${publicReference}/quote/accept`);
    expect(init).toMatchObject({ method: "POST", credentials: "include", cache: "no-store", redirect: "error",
      headers: { [ASSISTED_ORDER_STATUS_TOKEN_HEADER]: "guest?private=token" } });
    expect(JSON.parse(String(init?.body))).toEqual({ quoteId: quote.quoteId, version: 3, expectedTotalCents: 33854 });
    expect(String(url) + String(init?.body)).not.toContain("guest?private=token");
  });

  it("preserves form-not-stated line identities while displaying a null specification as empty", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(successfulJson({ ...quote,
      lines: [{ ...quote.lines[0], specification: null }] })));
    const result = await loadAssistedOrderQuote(publicReference);
    expect(result.lines[0]).toEqual({ ...quote.lines[0], specification: "" });
    expect(result.quoteId).toBe(quote.quoteId);
    expect(result.requestId).toBe(quote.requestId);
    expect(result.totalCents).toBe(quote.totalCents);
  });

  it("accepts ordinary multiline customer notes as literal text", async () => {
    const customerNote = "Review the exact quantity.\nContact Support with questions.";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(successfulJson({ ...quote, customerNote })));
    expect((await loadAssistedOrderQuote(publicReference)).customerNote).toBe(customerNote);
  });

  it("member acceptance never inherits the prior guest credential or adds a token to the body", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(successfulJson(acceptance));
    vi.stubGlobal("fetch", fetchMock);
    await acceptAssistedOrderQuote(publicReference, quote, "old-guest", "member-current");
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ Authorization: "Bearer member-current" });
    expect(fetchMock.mock.calls[0][1]?.headers).not.toHaveProperty(ASSISTED_ORDER_STATUS_TOKEN_HEADER);
    expect(String(fetchMock.mock.calls[0][1]?.body)).not.toMatch(/old-guest|member-current/);
  });

  it.each([
    { publicReference: "XRR-20260930-ABCDEF9999" }, { totalCents: 0 }, { totalCents: 33855 },
    { currency: "EUR" }, { version: 0 }, { state: "paid" }, { lines: [] },
    { lines: [...quote.lines, ...quote.lines], totalCents: 67708 },
    { lines: [{ ...quote.lines[0], currency: "EUR" }] },
    { lines: [{ ...quote.lines[0], specification: undefined }] },
    { lines: [{ ...quote.lines[0], unitPriceCents: 0 }] },
    { state: "accepted" }, { validUntil: "not-a-date" },
  ])("refuses unusable financial quote data %j", async (override) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(successfulJson({ ...quote, ...override })));
    await expect(loadAssistedOrderQuote(publicReference)).rejects.toMatchObject({ code: "quote_unusable" });
  });

  it.each([null, { ...acceptance, currency: "EUR" }, { ...acceptance, version: 4 },
    { ...acceptance, totalCents: 33855 }, { ...acceptance, quoteId: "other" },
    { ...acceptance, acceptanceId: null }, { ...acceptance, acceptedAt: null }])(
    "does not turn an absent or mismatched acceptance response into a success", async (body) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(successfulJson(body)));
      await expect(acceptAssistedOrderQuote(publicReference, quote)).rejects.toMatchObject({ code: "quote_unusable" });
    });
});

describe("loadAssistedOrderStatus", () => {
  it("uses the signed-in owner bearer instead of a previous visitor's cached status credential", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(successfulJson({ publicReference: "XRR-20260829-ABCDEF1234" }));
    vi.stubGlobal("fetch", fetchMock);
    await loadAssistedOrderStatus("XRR-20260829-ABCDEF1234", "previous-guest-token", "current-member-token");
    const [url, init] = fetchMock.mock.calls[0];
    expect(init?.cache).toBe("no-store");
    expect(init?.redirect).toBe("error");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer current-member-token" });
    expect(init?.headers).not.toHaveProperty(ASSISTED_ORDER_STATUS_TOKEN_HEADER);
    expect(String(url)).not.toMatch(/token|\?/);
  });
  it("sends the opaque status credential only in the dedicated request header", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      successfulJson({ publicReference: "XRR-20260829-ABCDEF1234" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const statusToken = "opaque.status/token?with=url&characters";

    await loadAssistedOrderStatus("XRR-20260829-ABCDEF1234", statusToken);

    expect(ASSISTED_ORDER_STATUS_TOKEN_HEADER).toBe(
      "x-xenios-order-status-token",
    );
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "/api/research/early-access/assisted-orders/XRR-20260829-ABCDEF1234",
    );
    expect(String(url)).not.toContain("?");
    expect(String(url)).not.toContain(statusToken);
    expect(init?.headers).toMatchObject({
      accept: "application/json",
      [ASSISTED_ORDER_STATUS_TOKEN_HEADER]: statusToken,
    });
  });

  it("keeps the status URL clean when no browser credential is available", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      successfulJson({ publicReference: "XRR-20260829-ABCDEF1234" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await loadAssistedOrderStatus("XRR-20260829-ABCDEF1234");

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).not.toContain("?");
    expect(init?.headers).not.toHaveProperty(
      ASSISTED_ORDER_STATUS_TOKEN_HEADER,
    );
  });
});

describe("assisted-order document credential transport", () => {
  const statusToken = "opaque.document/status?token=must-not-serialize";
  const requestId = "11111111-1111-4111-8111-111111111111";
  const publicReference = "XRR-20260829-ABCDEF1234";

  it("uses only member bearer on the same-origin ticket door and encodes hostile request identifiers", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(successfulJson({}));
    vi.stubGlobal("fetch", fetchMock);
    await createAssistedOrderUploadTicket("https://other.example/private", {
      publicReference, documentType: "government_id", side: "front", fileName: "synthetic.pdf", mimeType: "application/pdf", sizeBytes: 4,
    }, statusToken, "current-member-token");
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("/api/research/early-access/assisted-orders/https%3A%2F%2Fother.example%2Fprivate/documents/upload-url");
    expect(init).toMatchObject({ cache: "no-store", redirect: "error" });
    expect(init?.headers).toMatchObject({ Authorization: "Bearer current-member-token" });
    expect(init?.headers).not.toHaveProperty(ASSISTED_ORDER_STATUS_TOKEN_HEADER);
    expect(String(init?.body)).not.toMatch(/current-member-token|opaque\.document/);
  });

  it("never forwards member or guest credentials to the off-origin presigned storage request", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce({ ok: true, status: 200 } as Response)
      .mockResolvedValueOnce({ ok: true, status: 204 } as Response);
    vi.stubGlobal("fetch", fetchMock);
    await uploadAssistedOrderDocument({
      documentId: "document-1", uploadUrl: "https://storage.example/upload?signed=synthetic",
      objectPath: `${requestId}/document-1/synthetic.pdf`, expiresAt: "2026-09-21T12:15:00Z",
      requiredHeaders: { "x-upload-fixture": "1", authorization: "Bearer current-member-token", "X-Xenios-Order-Status-Token": statusToken },
    }, new File(["synthetic"], "synthetic.pdf", { type: "application/pdf" }), { publicReference }, statusToken, "current-member-token");
    const [storageUrl, storageInit] = fetchMock.mock.calls[0];
    expect(storageUrl).toBe("https://storage.example/upload?signed=synthetic");
    expect(storageInit).toMatchObject({ credentials: "omit", redirect: "error" });
    expect(new Headers(storageInit?.headers).has("Authorization")).toBe(false);
    expect(new Headers(storageInit?.headers).has(ASSISTED_ORDER_STATUS_TOKEN_HEADER)).toBe(false);
    expect(new Headers(storageInit?.headers).get("x-upload-fixture")).toBe("1");
    expect(JSON.stringify(storageInit?.headers)).not.toContain("current-member-token");
    const [completeUrl, completeInit] = fetchMock.mock.calls[1];
    expect(String(completeUrl)).toBe(`/api/research/early-access/assisted-orders/${requestId}/documents/document-1/complete`);
    expect(completeInit).toMatchObject({ cache: "no-store", redirect: "error" });
    expect(completeInit?.headers).toMatchObject({ Authorization: "Bearer current-member-token" });
    expect(completeInit?.headers).not.toHaveProperty(ASSISTED_ORDER_STATUS_TOKEN_HEADER);
    expect(String(completeInit?.body)).toBe(JSON.stringify({ publicReference }));
  });

  it("does not call the authenticated completion door when a storage upload or redirect is refused", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValueOnce(new TypeError("redirect refused"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(uploadAssistedOrderDocument({ documentId: "document-1", uploadUrl: "https://storage.example/upload",
      objectPath: `${requestId}/document-1/synthetic.pdf`, expiresAt: "2026-09-21T12:15:00Z", requiredHeaders: {},
    }, new File(["synthetic"], "synthetic.pdf", { type: "application/pdf" }), { publicReference }, statusToken, "current-member-token"))
      .rejects.toThrow("redirect refused");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: "omit", redirect: "error" });
  });

  it("sends the upload-ticket credential only in the dedicated header", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      successfulJson({
        documentId: "document-1",
        uploadUrl: "https://storage.example/upload",
        objectPath: `${requestId}/document-1/id-front.jpg`,
        expiresAt: "2026-08-29T12:15:00.000Z",
        requiredHeaders: { "x-upload-fixture": "1" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await createAssistedOrderUploadTicket(
      requestId,
      {
        publicReference,
        documentType: "government_id",
        side: "front",
        fileName: "id-front.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 123,
      },
      statusToken,
    );

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).not.toContain(statusToken);
    expect(String(init?.body)).not.toContain(statusToken);
    expect(JSON.parse(String(init?.body))).toEqual({
      publicReference,
      documentType: "government_id",
      side: "front",
      fileName: "id-front.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 123,
    });
    expect(init?.headers).toMatchObject({
      [ASSISTED_ORDER_STATUS_TOKEN_HEADER]: statusToken,
    });
  });

  it("never sends the status credential to storage or serializes it in completion JSON", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce({ ok: true, status: 200 } as Response)
      .mockResolvedValueOnce({ ok: true, status: 204 } as Response);
    vi.stubGlobal("fetch", fetchMock);
    const ticket = {
      documentId: "document-1",
      uploadUrl: "https://storage.example/upload",
      objectPath: `${requestId}/document-1/id-front.jpg`,
      expiresAt: "2026-08-29T12:15:00.000Z",
      requiredHeaders: { "x-upload-fixture": "1" },
    };

    await uploadAssistedOrderDocument(
      ticket,
      new File(["fixture"], "id-front.jpg", { type: "image/jpeg" }),
      { publicReference },
      statusToken,
    );

    const [storageUrl, storageInit] = fetchMock.mock.calls[0];
    expect(storageUrl).toBe(ticket.uploadUrl);
    expect(storageInit?.headers).not.toHaveProperty(
      ASSISTED_ORDER_STATUS_TOKEN_HEADER,
    );
    const [completionUrl, completionInit] = fetchMock.mock.calls[1];
    expect(String(completionUrl)).not.toContain(statusToken);
    expect(String(completionInit?.body)).not.toContain(statusToken);
    expect(JSON.parse(String(completionInit?.body))).toEqual({ publicReference });
    expect(completionInit?.headers).toMatchObject({
      [ASSISTED_ORDER_STATUS_TOKEN_HEADER]: statusToken,
    });
  });
});
