import { describe, expect, it, vi } from "vitest";
import { createRequestIntentApi, RequestIntentHttpError, isKnownIntentPrewriteRefusal } from "./request-intent-api";
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
