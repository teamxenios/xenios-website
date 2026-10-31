import { describe, expect, it, vi } from "vitest";
import { createRequestIntentApi, RequestIntentHttpError, isKnownIntentPrewriteRefusal } from "./request-intent-api";
import type { RequestIntentDetail } from "../../../../shared/research/assisted-order/request-intent";
describe("mixed-request canonical transport", () => {
  it("uses the current member token for each call and the exact method-admitted submit path", async () => {
    let token: string | null = "synthetic-first";
    const transport = vi.fn(async (_path: string, _init: RequestInit) => new Response(JSON.stringify({ receipt: null }), { status: 200 }));
    const api = createRequestIntentApi(() => token, transport);
    await api.recover("10000000-0000-4000-8000-000000000001");
    token = "synthetic-second";
    await api.recover("10000000-0000-4000-8000-000000000001");
    token = null;
    // Deliberately invalid body: this test asserts transport only, not server acceptance.
    await api.submit({} as Parameters<typeof api.submit>[0]);
    expect(transport.mock.calls[0][1].headers).toMatchObject({ Authorization: "Bearer synthetic-first" });
    expect(transport.mock.calls[1][1].headers).toMatchObject({ Authorization: "Bearer synthetic-second" });
    expect(transport.mock.calls[2][0]).toBe("/api/research/early-access/request-intents");
    expect(transport.mock.calls[2][1].headers).not.toHaveProperty("Authorization");
    expect(transport.mock.calls[2][1]).toMatchObject({ credentials: "include", cache: "no-store", method: "POST" });
  });
  it("fails closed on a disabled or noncanonical requirement response", async () => {
    const transport = vi.fn(async () => new Response(JSON.stringify({ enabled: true, requiredAgreements: [], formAcknowledgments: [] })));
    await expect(createRequestIntentApi(() => null, transport).config()).rejects.toThrow("Request requirements unavailable.");
  });
});

describe("Doc163 structured refusal classification", () => {
  it("exposes well-formed HTTP status and code without copying server message text", async () => {
    for (const status of [400, 401, 403, 429, 409, 500, 503]) {
      const transport = async () => new Response(JSON.stringify({ error: "synthetic_refusal", message: "private diagnostic" }), { status });
      const api = createRequestIntentApi(() => null, transport);
      const error = await api.submit({} as Parameters<typeof api.submit>[0]).catch((value: unknown) => value);
      expect(error).toBeInstanceOf(RequestIntentHttpError);
      expect(error).toMatchObject({ status, code: "synthetic_refusal" });
      expect(String(error)).not.toContain("private diagnostic");
      expect(isKnownIntentPrewriteRefusal(error)).toBe([400, 401, 403, 429].includes(status));
    }
  });
  it("keeps a known HTTP status UNKNOWN when its body is absent or malformed", async () => {
    for (const status of [400, 401, 403, 429]) {
      for (const body of ["<html>", "null", "{}", "[]", '{"error":7}', '{"message":"refused"}']) {
        const api = createRequestIntentApi(() => null, async () => new Response(body, { status }));
        const error = await api.submit({} as Parameters<typeof api.submit>[0]).catch((value: unknown) => value);
        expect(isKnownIntentPrewriteRefusal(error)).toBe(false);
        expect(error).not.toBeInstanceOf(RequestIntentHttpError);
      }
    }
  });
});

describe("private queue response page identity and bounds", () => {
  const first = { kind: "unapproved_selection_request", status: "pending_review",
    requestId: "30000000-0000-4000-8000-000000000001",
    publicReference: "XRI-30000000000040008000000000000001",
    createdAt: "2026-10-14T12:00:00.000Z", lineCount: 2 };
  const second = { ...first, requestId: "30000000-0000-4000-8000-000000000002",
    publicReference: "XRI-30000000000040008000000000000002" };
  const valid = { items: [first], total: 51, page: 1, pageSize: 25 };
  function fixture(body: unknown) {
    const transport = vi.fn(async (_path: string, _init: RequestInit) => new Response(JSON.stringify(body), { status: 200 }));
    return { api: createRequestIntentApi(() => "synthetic-staff", transport), transport };
  }
  it.each([0, 1.5, 10001])("refuses invalid requested page %s before transport", async (page) => {
    const { api, transport } = fixture(valid);
    await expect(api.staffQueue(page)).rejects.toThrow("Queue unavailable.");
    expect(transport).not.toHaveBeenCalled();
  });
  it.each([
    ["missing returned page", { ...valid, page: undefined }],
    ["wrong returned page", { ...valid, page: 2 }],
    ["missing page size", { ...valid, pageSize: undefined }],
    ["zero page size", { ...valid, pageSize: 0 }],
    ["fractional page size", { ...valid, pageSize: 25.5 }],
    ["unsafe page size", { ...valid, pageSize: Number.MAX_SAFE_INTEGER + 1 }],
    ["more rows than page size", { ...valid, items: [first, second], pageSize: 1 }],
    ["more rows than total", { ...valid, total: 0 }],
  ])("refuses a successful envelope with %s", async (_reason, body) => {
    const { api, transport } = fixture(body);
    await expect(api.staffQueue(1)).rejects.toThrow("Queue unavailable.");
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("keeps a valid partial page and its supplied positive page size", async () => {
    const partial = { ...valid, pageSize: 7 };
    const { api, transport } = fixture(partial);
    await expect(api.staffQueue(1)).resolves.toEqual(partial);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport).toHaveBeenCalledWith("/api/research/early-access/request-intents/staff?page=1",
      expect.objectContaining({ method: "GET", credentials: "include", cache: "no-store" }));
  });
  it("accepts an empty later page at the existing bound without deriving a maximum from total", async () => {
    const empty = { items: [], total: 0, page: 10000, pageSize: 25 };
    const { api, transport } = fixture(empty);
    await expect(api.staffQueue(10000)).resolves.toEqual(empty);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0][0]).toBe("/api/research/early-access/request-intents/staff?page=10000");
  });
});

describe("customer catalog response page identity and bounds", () => {
  const item = { productId: "synthetic-product", variantId: "synthetic-variant",
    selectableForReview: true, clinicalReviewRequired: false };
  const valid = { items: [item], total: 51, page: 1, pageSize: 24,
    families: [], channels: [], workflowModes: [] };
  function fixture(body: unknown) {
    const transport = vi.fn(async (_path: string, _init: RequestInit) => new Response(JSON.stringify(body), { status: 200 }));
    return { api: createRequestIntentApi(() => "synthetic-customer", transport), transport };
  }
  it.each([
    { label: "zero page", query: { page: 0 } },
    { label: "fractional page", query: { page: 1.5 } },
    { label: "unsafe page", query: { page: Number.MAX_SAFE_INTEGER + 1 } },
    { label: "NaN page", query: { page: Number.NaN } },
    { label: "infinite page", query: { page: Number.POSITIVE_INFINITY } },
    { label: "zero page size", query: { pageSize: 0 } },
    { label: "fractional page size", query: { pageSize: 1.5 } },
    { label: "page size above the server bound", query: { pageSize: 101 } },
    { label: "unsafe page size", query: { pageSize: Number.MAX_SAFE_INTEGER + 1 } },
  ])("refuses requested $label before transport", async ({ query }) => {
    const { api, transport } = fixture(valid);
    await expect(api.catalog(query)).rejects.toThrow("The current catalog could not be confirmed.");
    expect(transport).not.toHaveBeenCalled();
  });
  it.each([
    ["wrong returned page", { ...valid, page: 2 }],
    ["zero returned page", { ...valid, page: 0 }],
    ["negative returned page", { ...valid, page: -1 }],
    ["zero returned page size", { ...valid, pageSize: 0 }],
    ["negative returned page size", { ...valid, pageSize: -1 }],
    ["wrong returned page size", { ...valid, pageSize: 100 }],
    ["more rows than requested page size", { ...valid, items: Array.from({ length: 25 }, (_, i) =>
      ({ ...item, productId: "synthetic-" + i, variantId: "synthetic-variant-" + i })) }],
    ["more rows than total", { ...valid, total: 0 }],
  ])("refuses a successful catalog envelope with %s", async (_reason, body) => {
    const { api, transport } = fixture(body);
    await expect(api.catalog({ page: 1, pageSize: 24 })).rejects.toThrow("The current catalog could not be confirmed.");
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("preserves the existing default page 1 and page size 24", async () => {
    const { api, transport } = fixture(valid);
    await expect(api.catalog({})).resolves.toEqual(valid);
    expect(transport).toHaveBeenCalledWith("/api/research/early-access/request-intents/catalog?page=1&pageSize=24",
      expect.objectContaining({ method: "GET", credentials: "include", cache: "no-store" }));
  });
  it("accepts the server's maximum requested page size without clamping", async () => {
    const body = { ...valid, total: 1, pageSize: 100 };
    const { api, transport } = fixture(body);
    await expect(api.catalog({ pageSize: 100 })).resolves.toEqual(body);
    expect(transport.mock.calls[0][0]).toBe("/api/research/early-access/request-intents/catalog?page=1&pageSize=100");
  });
  it("keeps the reader's valid nine-row partial page 5 of 105 items", async () => {
    const body = { ...valid, page: 5, total: 105, items: Array.from({ length: 9 }, (_, i) =>
      ({ ...item, productId: "synthetic-" + i, variantId: "synthetic-variant-" + i })) };
    const { api, transport } = fixture(body);
    await expect(api.catalog({ page: 5 })).resolves.toEqual(body);
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it.each([10001, Number.MAX_SAFE_INTEGER])("keeps an empty later catalog page %s without an invented ceiling", async (page) => {
    const body = { ...valid, items: [], total: 0, page, pageSize: 100 };
    const { api, transport } = fixture(body);
    await expect(api.catalog({ page, pageSize: 100 })).resolves.toEqual(body);
    expect(transport.mock.calls[0][0]).toBe("/api/research/early-access/request-intents/catalog?page=" + page + "&pageSize=100");
    expect(transport).toHaveBeenCalledTimes(1);
  });
});

describe("private detail requested identity", () => {
  const id = "a0000000-bbbb-4ccc-8ddd-000000000001";
  const otherId = "b0000000-bbbb-4ccc-8ddd-000000000002";
  const otherReference = "XRI-B0000000BBBB4CCC8DDD000000000002";
  const detail: RequestIntentDetail = {
    kind: "unapproved_selection_request", requestId: id,
    publicReference: "XRI-A0000000BBBB4CCC8DDD000000000001",
    status: "pending_review", createdAt: "2026-10-14T12:00:00.000Z",
    contact: {
      fullLegalName: "Synthetic Customer", email: "synthetic@example.invalid",
      mobilePhone: "+15555550123", ageConfirmed: true,
      shippingAddress: { line1: "1 Synthetic Street", city: "Test", region: "TX",
        postalCode: "00000", countryCode: "US" },
      billingSameAsShipping: true,
    },
    agreements: [{ kind: "synthetic-review-terms", version: "synthetic-v1",
      accepted: true, acceptedAt: "2026-10-14T11:59:00.000Z" }],
    lines: [{ productId: "synthetic-product", variantId: "synthetic-variant",
      sourceVariantId: "synthetic-source-variant", productName: "Synthetic research item",
      specification: "Synthetic specification", family: "research_peptides_materials",
      workflowMode: "direct_order_request", quantity: 1, researchUseOnly: true,
      clinicalReviewRequired: false, sourceDisplayState: "request_access",
      sourceVariantDisplayState: "request_access", sourceRefusal: null,
      catalogVersion: "synthetic-v1", reviewState: "pending" }],
  };
  function fixture(body: RequestIntentDetail) {
    const transport = vi.fn(async (_path: string, _init: RequestInit) => new Response(JSON.stringify(body), { status: 200 }));
    return { api: createRequestIntentApi(() => "synthetic-staff", transport), transport };
  }
  it.each([
    { label: "exact spelling", requested: id, body: detail },
    { label: "uppercase request", requested: id.toUpperCase(), body: detail },
    { label: "uppercase response", requested: id, body: { ...detail, requestId: id.toUpperCase() } },
  ])("preserves matching detail with $label", async ({ requested, body }) => {
    const { api, transport } = fixture(body);
    await expect(api.staff(requested)).resolves.toEqual(body);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport).toHaveBeenCalledWith("/api/research/early-access/request-intents/staff/" + requested,
      expect.objectContaining({ method: "GET", credentials: "include", cache: "no-store",
        headers: { accept: "application/json", Authorization: "Bearer synthetic-staff" } }));
  });
  it("refuses another request's complete detail even when its receipt is internally consistent", async () => {
    const { api, transport } = fixture({ ...detail, requestId: otherId, publicReference: otherReference });
    await expect(api.staff(id)).rejects.toThrow("Request detail is unavailable.");
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0][0]).toBe("/api/research/early-access/request-intents/staff/" + id);
  });
  it("retains receipt refusal when the returned ID and public reference disagree", async () => {
    const { api, transport } = fixture({ ...detail, publicReference: otherReference });
    await expect(api.staff(id)).rejects.toThrow("Request outcome is unconfirmed.");
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("retains invalid requested identity refusal before transport", async () => {
    const { api, transport } = fixture(detail);
    await expect(api.staff("not-a-request-id")).rejects.toThrow("Invalid request identity.");
    expect(transport).not.toHaveBeenCalled();
  });
});
