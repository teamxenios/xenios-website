import { describe, expect, it, vi } from "vitest";
import type { BusinessInquiryInput } from "@shared/research/business-inquiry";
import { createBusinessInquiryAttemptKey, createBusinessInquiryCommand, submitBusinessInquiry } from "./business-inquiry-api";

const enquiry: BusinessInquiryInput = {
  contactName: "Example Contact", contactEmail: "contact@example.test", organizationName: "Example Laboratory",
  organizationType: "research", location: "Austin", categories: ["research"],
  selections: [{ description: "Exact requested item", variant: "Requested presentation", quantity: 2.5, unit: "bottle" }],
  packagingPreference: "not_sure", siteCount: 1, replenishment: "one_time", services: [],
};
const receipt = { reference: `BE-${"A".repeat(24)}`, receivedAt: "2026-11-18T20:00:00.000Z", state: "needs_human_review", replayed: false };
const command = () => createBusinessInquiryCommand("synthetic-business-attempt-000001", enquiry);
const json = (value: unknown, status = 201) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });
function transport(response: Response) {
  const fetcher = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => response);
  const abort = new AbortController();
  return { fetcher, signal: abort.signal, isCurrent: () => true };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("business enquiry API candidate (authored, unrun)", () => {
  it("mints a cryptographic key in the existing bounded attempt grammar", () => {
    expect(createBusinessInquiryAttemptKey()).toMatch(/^[a-f0-9]{64}$/);
  });
  it("posts only the strict command to the fixed same-origin JSON endpoint", async () => {
    const tx = transport(json(receipt));
    const result = await submitBusinessInquiry(command(), tx);
    expect(result).toEqual({ kind: "saved", receipt });
    expect(tx.fetcher).toHaveBeenCalledExactlyOnceWith("/api/research/business-inquiries", {
      method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(command()), signal: tx.signal,
    });
    const body = JSON.parse(tx.fetcher.mock.calls[0][1]!.body as string);
    expect(Object.keys(body)).toEqual(["attemptKey", "enquiry"]);
    expect(body.enquiry.selections[0]).toEqual(enquiry.selections[0]);
  });
  it("preserves a validated normalized command against later edits to the source object", async () => {
    const source = { ...enquiry, contactEmail: " CONTACT@EXAMPLE.TEST ", categories: [...enquiry.categories], selections: enquiry.selections.map((item) => ({ ...item })) };
    const frozen = createBusinessInquiryCommand("synthetic-business-attempt-000001", source);
    source.contactName = "Changed"; source.selections[0].quantity = 999; source.categories.push("other");
    const tx = transport(json(receipt));
    await submitBusinessInquiry(frozen, tx);
    const posted = JSON.parse(tx.fetcher.mock.calls[0][1]!.body as string);
    expect(posted.enquiry.contactName).toBe("Example Contact");
    expect(posted.enquiry.contactEmail).toBe("contact@example.test");
    expect(posted.enquiry.categories).toEqual(["research"]);
    expect(posted.enquiry.selections[0].quantity).toBe(2.5);
  });
  it("accepts an exact replay receipt only with the route's 200 replay semantics", async () => {
    expect(await submitBusinessInquiry(command(), transport(json({ ...receipt, replayed: true }, 200))))
      .toEqual({ kind: "saved", receipt: { ...receipt, replayed: true } });
  });
  it.each([
    { ...enquiry, actorId: "browser-selected" },
    { ...enquiry, selections: [{ ...enquiry.selections[0], unit: undefined }] },
  ])("refuses an invalid or authority-bearing enquiry before transport", (input) => {
    expect(() => createBusinessInquiryCommand("synthetic-business-attempt-000001", input)).toThrow("invalid_business_inquiry_command");
  });
  it("rejects an extra outer authority field even from a misbehaving internal caller", async () => {
    const tx = transport(json(receipt));
    const altered = { ...command(), organizationId: "browser-selected" };
    expect(await submitBusinessInquiry(altered, tx)).toEqual({ kind: "invalid_command" });
    expect(tx.fetcher).not.toHaveBeenCalled();
  });
  it.each([
    [400, "invalid_request", { kind: "rejected", code: "invalid_request" }],
    [413, "invalid_request", { kind: "rejected", code: "invalid_request" }],
    [403, "not_permitted", { kind: "rejected", code: "not_permitted" }],
    [404, "not_found", { kind: "rejected", code: "not_found" }],
    [409, "conflict", { kind: "conflict" }],
    [503, "not_ready", { kind: "uncertain" }],
    [500, "unavailable", { kind: "uncertain" }],
    [429, "rate_limited", { kind: "uncertain" }],
  ] as const)("handles status %i / %s without creating another attempt", async (status, error, expected) => {
    const tx = transport(json({ error }, status));
    expect(await submitBusinessInquiry(command(), tx)).toEqual(expected);
    expect(tx.fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([
    json({ ...receipt, contactEmail: "private@example.test" }),
    json({ ok: true, receipt }),
    json({ ...receipt, reference: "invalid" }),
    json(receipt, 200),
    json({ ...receipt, replayed: true }, 201),
    new Response("<html>private@example.test</html>", { status: 200, headers: { "Content-Type": "text/html" } }),
    new Response("{invalid", { status: 200, headers: { "Content-Type": "application/json" } }),
    json({ error: "not_permitted", diagnostic: "private@example.test" }, 403),
  ])("treats malformed/fallback/overbroad or inconsistent replies as uncertain", async (response) => {
    expect(await submitBusinessInquiry(command(), transport(response))).toEqual({ kind: "uncertain" });
  });
  it("sanitizes network failure and never retries automatically", async () => {
    const tx = transport(json(receipt));
    tx.fetcher.mockRejectedValueOnce(new Error("private@example.test provider-secret"));
    const result = await submitBusinessInquiry(command(), tx);
    expect(result).toEqual({ kind: "uncertain" });
    expect(JSON.stringify(result)).not.toContain("private");
    expect(tx.fetcher).toHaveBeenCalledTimes(1);
  });
  it("does not dispatch when the live context fence already denies", async () => {
    const tx = transport(json(receipt));
    expect(await submitBusinessInquiry(command(), { ...tx, isCurrent: () => false })).toEqual({ kind: "discarded" });
    expect(tx.fetcher).not.toHaveBeenCalled();
  });
  it("rejects a late response after context change before reading its body", async () => {
    const pending = deferred<Response>(); let current = true;
    const fetcher = vi.fn((_url: RequestInfo | URL, _init?: RequestInit) => pending.promise);
    const response = json(receipt); const read = vi.spyOn(response, "text");
    const sent = submitBusinessInquiry(command(), { fetcher, signal: new AbortController().signal, isCurrent: () => current });
    current = false; pending.resolve(response);
    expect(await sent).toEqual({ kind: "discarded" }); expect(read).not.toHaveBeenCalled();
  });
  it("rejects a late body result after the context changes during parsing", async () => {
    const body = deferred<string>(); const started = deferred<void>(); let current = true;
    const response = json(receipt);
    vi.spyOn(response, "text").mockImplementation(() => { started.resolve(); return body.promise; });
    const tx = transport(response);
    const sent = submitBusinessInquiry(command(), { ...tx, isCurrent: () => current });
    await started.promise; current = false; body.resolve(JSON.stringify(receipt));
    expect(await sent).toEqual({ kind: "discarded" });
  });
  it("does not dispatch an aborted command", async () => {
    const abort = new AbortController(); abort.abort(); const tx = transport(json(receipt));
    expect(await submitBusinessInquiry(command(), { ...tx, signal: abort.signal })).toEqual({ kind: "discarded" });
    expect(tx.fetcher).not.toHaveBeenCalled();
  });
});
