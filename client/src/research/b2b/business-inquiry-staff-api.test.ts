import { describe, expect, it, vi } from "vitest";
import type { BusinessInquiryPage, BusinessInquiryRecord } from "@shared/research/business-inquiry";
import {
  BusinessInquiryStaffError, createBusinessInquiryStaffApi,
  type BusinessInquiryStaffErrorCode,
} from "./business-inquiry-staff-api";

const id = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const basePath = "/api/admin/research/business-inquiries";
const record: BusinessInquiryRecord = {
  id, reference: `BE-${"A".repeat(24)}`, receivedAt: "2026-11-18T22:00:00.000Z",
  provenance: "web", category: "b2b_organization", state: "needs_human_review", revision: 1,
  assignedTo: null, organizationId: null, policyVersion: "business-2026-11-18",
  enquiry: {
    contactName: "Example Contact", contactEmail: "contact@example.test", organizationName: "Example Laboratory",
    organizationType: "research", location: "Austin", categories: ["research"],
    selections: [{ description: "Exact requested item", variant: "Requested presentation", quantity: 2.5, unit: "bottle" }],
    packagingPreference: "not_sure", siteCount: 1, replenishment: "one_time", services: [],
  },
};
const page: BusinessInquiryPage = { items: [record], nextBefore: otherId };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "Content-Type": "application/json; charset=utf-8" },
});
function setup(response = json(page)) {
  const fetcher = vi.fn(async (_path: string, _init: RequestInit) => response);
  const api = createBusinessInquiryStaffApi({ fetcher, isCurrent: () => true });
  return { api, fetcher };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function refusal(pending: Promise<unknown>, code: BusinessInquiryStaffErrorCode) {
  const error: unknown = await pending.then(() => null, (value: unknown) => value);
  expect(error).toBeInstanceOf(BusinessInquiryStaffError);
  expect(error).toMatchObject({ name: "BusinessInquiryStaffError", code, message: new BusinessInquiryStaffError(code).message });
  return error as BusinessInquiryStaffError;
}

describe("business enquiry staff GET API (authored, unrun)", () => {
  it("gets the first strict page through the injected transport with no authority selectors", async () => {
    const { api, fetcher } = setup(); const abort = new AbortController();
    expect(await api.list(undefined, { signal: abort.signal })).toEqual(page);
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(basePath, {
      method: "GET", credentials: "same-origin", cache: "no-store", redirect: "error",
      headers: { Accept: "application/json" }, signal: abort.signal,
    });
    expect(fetcher.mock.calls[0][1]).not.toHaveProperty("body");
  });
  it("requests only the validated before cursor and preserves an empty final page", async () => {
    const empty: BusinessInquiryPage = { items: [], nextBefore: null };
    const { api, fetcher } = setup(json(empty));
    expect(await api.list(otherId)).toEqual(empty);
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(`${basePath}?before=${encodeURIComponent(otherId)}`, {
      method: "GET", credentials: "same-origin", cache: "no-store", redirect: "error",
      headers: { Accept: "application/json" }, signal: undefined,
    });
  });
  it("gets an exact detail ID using the same explicit GET options", async () => {
    const { api, fetcher } = setup(json(record)); const abort = new AbortController();
    expect(await api.read(id, { signal: abort.signal })).toEqual(record);
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(`${basePath}/${id}`, {
      method: "GET", credentials: "same-origin", cache: "no-store", redirect: "error",
      headers: { Accept: "application/json" }, signal: abort.signal,
    });
  });
  it.each([
    "", "not-a-uuid", `${id}/assign`, `${id}?actorId=${otherId}`, ` ${id}`, `${id}\n`, null, 42,
  ])("rejects invalid ID and cursor %s before dispatch", async (value) => {
    const { api, fetcher } = setup();
    await refusal(api.list(value as string), "invalid_request");
    await refusal(api.read(value as string), "invalid_request");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects a missing detail ID before dispatch", async () => {
    const { api, fetcher } = setup();
    await refusal(api.read(undefined as unknown as string), "invalid_request");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([undefined, null, {}, { fetcher: vi.fn() }, { isCurrent: () => true }])(
    "requires both callbacks and cannot fall back to a global transport: %s", (transport) => {
      expect(() => createBusinessInquiryStaffApi(transport as Parameters<typeof createBusinessInquiryStaffApi>[0]))
        .toThrow(new BusinessInquiryStaffError("unavailable"));
      if (transport && "fetcher" in transport) expect(transport.fetcher).not.toHaveBeenCalled();
    },
  );
  it.each([
    () => false, () => undefined, () => "true", () => { throw new Error("private context diagnostic"); },
  ])("fails closed for a missing, false, invalid or throwing current binding", async (isCurrent) => {
    const fetcher = vi.fn(async (_path: string, _init: RequestInit) => json(page));
    const api = createBusinessInquiryStaffApi({ fetcher, isCurrent: isCurrent as () => boolean });
    await refusal(api.list(), "stale"); await refusal(api.read(id), "stale");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("does not dispatch an already aborted read", async () => {
    const { api, fetcher } = setup(); const abort = new AbortController(); abort.abort();
    await refusal(api.list(undefined, { signal: abort.signal }), "stale");
    await refusal(api.read(id, { signal: abort.signal }), "stale");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([200, 401, 403])("discards a late %i result after the Root binding changes without reading its body", async (status) => {
    const pending = deferred<Response>(); let current = true;
    const response = json(status === 200 ? page : { error: "private diagnostic" }, status);
    const read = vi.spyOn(response.body!, "getReader");
    const fetcher = vi.fn((_path: string, _init: RequestInit) => pending.promise);
    const api = createBusinessInquiryStaffApi({ fetcher, isCurrent: () => current });
    const result = api.list(); current = false; pending.resolve(response);
    await refusal(result, "stale"); expect(read).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("discards an aborted successful fetch even if the transport ignores cancellation", async () => {
    const pending = deferred<Response>(); const abort = new AbortController();
    const response = json(record); const read = vi.spyOn(response.body!, "getReader");
    const api = createBusinessInquiryStaffApi({ fetcher: () => pending.promise, isCurrent: () => true });
    const result = api.read(id, { signal: abort.signal }); abort.abort(); pending.resolve(response);
    await refusal(result, "stale"); expect(read).not.toHaveBeenCalled();
  });
  it.each([[401, "unauthenticated"], [403, "denied"]] as const)(
    "preserves a resolved %i denial for the current binding even after this operation is cancelled", async (status, code) => {
      const pending = deferred<Response>(); const abort = new AbortController();
      const response = json({ error: "private provider diagnostic" }, status);
      const read = vi.spyOn(response.body!, "getReader");
      const api = createBusinessInquiryStaffApi({ fetcher: () => pending.promise, isCurrent: () => true });
      const result = api.list(undefined, { signal: abort.signal }); abort.abort(); pending.resolve(response);
      await refusal(result, code); expect(read).not.toHaveBeenCalled();
    },
  );
  it.each(["context", "abort"])("discards a reply when %s changes during a body read and cancels the stream", async (change) => {
    const entered = deferred<void>(); const cancel = vi.fn(); const abort = new AbortController(); let current = true;
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({
      start(value) { controller = value; }, pull() { entered.resolve(); }, cancel,
    }, { highWaterMark: 0 });
    const response = new Response(body, { headers: { "Content-Type": "application/json" } });
    const api = createBusinessInquiryStaffApi({ fetcher: async () => response, isCurrent: () => current });
    const result = api.list(undefined, { signal: abort.signal }); await entered.promise;
    if (change === "context") current = false; else abort.abort();
    controller.enqueue(new TextEncoder().encode(JSON.stringify(page)));
    await refusal(result, "stale"); expect(cancel).toHaveBeenCalledTimes(1);
  });
  it("returns stale when a pending transport fails after its context has been revoked", async () => {
    const pending = deferred<Response>(); let current = true;
    const api = createBusinessInquiryStaffApi({ fetcher: () => pending.promise, isCurrent: () => current });
    const result = api.list(); current = false; pending.reject(new Error("private provider diagnostic"));
    await refusal(result, "stale");
  });
  it("returns stale for an aborted transport rejection without turning it into an auth denial", async () => {
    const pending = deferred<Response>(); const abort = new AbortController();
    const api = createBusinessInquiryStaffApi({ fetcher: () => pending.promise, isCurrent: () => true });
    const result = api.list(undefined, { signal: abort.signal }); abort.abort();
    pending.reject(new Error("private abort diagnostic")); await refusal(result, "stale");
  });
  it.each([
    [401, "unauthenticated"], [403, "denied"], [404, "not_found"], [400, "invalid_request"],
    [201, "unavailable"], [302, "unavailable"], [429, "unavailable"], [503, "unavailable"],
  ] as const)("maps status %i to the fixed %s error without reading or reflecting its body", async (status, code) => {
    const response = json({ error: "private@example.test provider-secret" }, status);
    const read = vi.spyOn(response.body!, "getReader"); const { api, fetcher } = setup(response);
    const error = await refusal(api.read(id), code);
    expect(error.message).not.toContain("private"); expect(error.message).not.toContain("provider-secret");
    expect(read).not.toHaveBeenCalled(); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([
    ["invalid JSON", () => new Response("{private diagnostic", { headers: { "Content-Type": "application/json" } })],
    ["HTML fallback", () => new Response("<html>private</html>", { headers: { "Content-Type": "text/html" } })],
    ["missing content type", () => new Response(JSON.stringify(page), { headers: { "Content-Type": "" } })],
    ["null", () => json(null)],
    ["wrong envelope", () => json({ records: [record], nextBefore: null })],
    ["extra outer field", () => json({ ...page, actorId: otherId })],
    ["extra record field", () => json({ ...page, items: [{ ...record, attemptKey: "private" }] })],
    ["extra enquiry field", () => json({ ...page, items: [{ ...record, enquiry: { ...record.enquiry, userId: otherId } }] })],
    ["invalid next cursor", () => json({ ...page, nextBefore: "not-a-uuid" })],
    ["overlong page", () => json({ items: Array(51).fill(record), nextBefore: null })],
  ] as const)("refuses a successful %s response through the shared strict DTO", async (_label, response) => {
    const { api, fetcher } = setup(response());
    await refusal(api.list(), "unavailable"); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([
    ["mismatched ID", { ...record, id: otherId }],
    ["extra field", { ...record, privateNotes: "private diagnostic" }],
    ["wrong envelope", { record }],
  ])("refuses a successful detail with %s", async (_label, data) => {
    const { api } = setup(json(data)); await refusal(api.read(id), "unavailable");
  });
  it("refuses a redirected success before reading its body", async () => {
    const response = json(page); Object.defineProperty(response, "redirected", { value: true });
    const read = vi.spyOn(response.body!, "getReader"); const { api } = setup(response);
    await refusal(api.list(), "unavailable"); expect(read).not.toHaveBeenCalled();
  });
  it("bounds actual streamed bytes even when the declared content length is small", async () => {
    const cancel = vi.fn(); let chunks = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) { controller.enqueue(new Uint8Array(2 * 1024 * 1024 + (++chunks === 2 ? 1 : 0))); },
      cancel,
    }, { highWaterMark: 0 });
    const response = new Response(body, { headers: { "Content-Type": "application/json", "Content-Length": "1" } });
    const { api, fetcher } = setup(response);
    await refusal(api.list(), "unavailable");
    expect(chunks).toBe(2); expect(cancel).toHaveBeenCalledTimes(1); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("refuses invalid UTF-8 rather than accepting decoder replacement text", async () => {
    const response = new Response(new Uint8Array([0xff]), { headers: { "Content-Type": "application/json" } });
    const { api } = setup(response); await refusal(api.list(), "unavailable");
  });
  it("sanitizes a failed body stream", async () => {
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.error(new Error("private body diagnostic")); } });
    const { api } = setup(new Response(body, { headers: { "Content-Type": "application/json" } }));
    const error = await refusal(api.list(), "unavailable"); expect(error.message).not.toContain("diagnostic");
  });
  it("sanitizes transport failures and never retries or substitutes an auth store", async () => {
    const fetcher = vi.fn(async (_path: string, _init: RequestInit): Promise<Response> => {
      throw new Error("private@example.test provider-secret");
    });
    const api = createBusinessInquiryStaffApi({ fetcher, isCurrent: () => true });
    const error = await refusal(api.list(), "unavailable");
    expect(error.message).not.toContain("private"); expect(error).not.toHaveProperty("cause");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
