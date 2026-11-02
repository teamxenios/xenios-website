import { describe, expect, it, vi } from "vitest";
import {
  forgetConfirmedReceipt, readConfirmedReceiptRecord, receiptFromPublicReference, referenceConfirmedInThisTab,
  rememberConfirmedReceipt, requestIntentConfirmationHref, requestIntentSupportMailto, REQUEST_INTENT_RECEIPT_RECORD_KEY,
} from "./request-intent-continuation";
import { clearAssistedOrderStorage } from "./storage";

const receipt = {
  kind: "unapproved_selection_request" as const, requestId: "30000000-0000-4000-8000-000000000001",
  publicReference: "XRI-30000000000040008000000000000001", status: "pending_review" as const, createdAt: "2026-10-14T12:00:00.000Z",
};
class FakeStorage {
  readonly map = new Map<string, string>();
  get length() { return this.map.size; }
  key(index: number) { return [...this.map.keys()][index] ?? null; }
  getItem(key: string) { return this.map.get(key) ?? null; }
  setItem(key: string, value: string) { this.map.set(key, String(value)); }
  removeItem(key: string) { this.map.delete(key); }
  clear() { this.map.clear(); }
}
/** A reload evaluates the module again, so the stored page-load id no longer matches the current one. */
function fromAnEarlierPageLoad(storage: FakeStorage) {
  const raw = storage.map.get(REQUEST_INTENT_RECEIPT_RECORD_KEY)!;
  storage.map.set(REQUEST_INTENT_RECEIPT_RECORD_KEY, JSON.stringify({ ...JSON.parse(raw), pageLoad: "an-earlier-page-load" }));
}

describe("confirmed reference record", () => {
  it("round-trips only the owner, reference, time and page-load id, and rebuilds the same receipt after a reload", () => {
    const storage = new FakeStorage();
    expect(rememberConfirmedReceipt(storage, "owner-a", receipt)).toBe(true);
    expect([...storage.map.keys()]).toEqual([REQUEST_INTENT_RECEIPT_RECORD_KEY]);
    expect(JSON.parse(storage.map.get(REQUEST_INTENT_RECEIPT_RECORD_KEY)!)).toEqual({
      owner: "owner-a", publicReference: receipt.publicReference, createdAt: receipt.createdAt, pageLoad: expect.any(String),
    });
    // Same page load: not reopened, but kept for a later load.
    expect(readConfirmedReceiptRecord(storage, "owner-a")).toBeNull();
    expect(storage.map.size).toBe(1);
    fromAnEarlierPageLoad(storage);
    expect(readConfirmedReceiptRecord(storage, "owner-a")).toEqual(receipt);
    expect(storage.map.size).toBe(1);
    expect(referenceConfirmedInThisTab(storage, receipt.publicReference)).toBe(receipt.createdAt);
    expect(referenceConfirmedInThisTab(storage, "XRI-30000000000040008000000000000002")).toBeNull();
    expect(referenceConfirmedInThisTab(null, receipt.publicReference)).toBeNull();
  });
  it("reports the reference as confirmed in this tab during the same page load too", () => {
    const storage = new FakeStorage();
    rememberConfirmedReceipt(storage, "owner-a", receipt);
    expect(referenceConfirmedInThisTab(storage, receipt.publicReference)).toBe(receipt.createdAt);
  });
  it("is reopened by a fresh evaluation of the module, which is what a reload is", async () => {
    const storage = new FakeStorage();
    rememberConfirmedReceipt(storage, "owner-a", receipt);
    expect(readConfirmedReceiptRecord(storage, "owner-a")).toBeNull();
    vi.resetModules();
    const reloaded = await import("./request-intent-continuation");
    expect(reloaded.readConfirmedReceiptRecord(storage, "owner-a")).toEqual(receipt);
    // The evaluation that wrote the record still treats it as its own load.
    expect(readConfirmedReceiptRecord(storage, "owner-a")).toBeNull();
    // And a record the fresh evaluation writes is in turn not reopened by it.
    reloaded.rememberConfirmedReceipt(storage, "owner-a", receipt);
    expect(reloaded.readConfirmedReceiptRecord(storage, "owner-a")).toBeNull();
    expect(readConfirmedReceiptRecord(storage, "owner-a")).toEqual(receipt);
  });
  it("is swept with the rest of the assisted-order key family on Early Access sign-out", () => {
    const storage = new FakeStorage();
    rememberConfirmedReceipt(storage, "owner-a", receipt);
    storage.setItem("unrelated.key", "stays");
    clearAssistedOrderStorage(storage as unknown as Storage);
    expect(storage.getItem(REQUEST_INTENT_RECEIPT_RECORD_KEY)).toBeNull();
    expect(storage.getItem("unrelated.key")).toBe("stays");
  });
  it("discards another owner's record instead of showing it, in either page load", () => {
    const storage = new FakeStorage();
    rememberConfirmedReceipt(storage, "owner-a", receipt);
    expect(readConfirmedReceiptRecord(storage, "owner-b")).toBeNull();
    expect(storage.map.size).toBe(0);
    rememberConfirmedReceipt(storage, "owner-a", receipt); fromAnEarlierPageLoad(storage);
    expect(readConfirmedReceiptRecord(storage, "owner-b")).toBeNull();
    expect(storage.map.size).toBe(0);
    expect(readConfirmedReceiptRecord(storage, "owner-a")).toBeNull();
  });
  it.each([
    ["not json", "{"],
    ["an array", "[]"],
    ["an extra field", JSON.stringify({ owner: "o", publicReference: receipt.publicReference, createdAt: receipt.createdAt, pageLoad: "x", lines: [] })],
    ["a legacy reference", JSON.stringify({ owner: "o", publicReference: "XRR-20260819-ABCDEF1234", createdAt: receipt.createdAt, pageLoad: "x" })],
    ["a lowercase reference", JSON.stringify({ owner: "o", publicReference: receipt.publicReference.toLowerCase(), createdAt: receipt.createdAt, pageLoad: "x" })],
    ["an invalid time", JSON.stringify({ owner: "o", publicReference: receipt.publicReference, createdAt: "yesterday", pageLoad: "x" })],
    ["a missing owner", JSON.stringify({ publicReference: receipt.publicReference, createdAt: receipt.createdAt, pageLoad: "x" })],
    ["a missing page-load id", JSON.stringify({ owner: "o", publicReference: receipt.publicReference, createdAt: receipt.createdAt })],
    ["an empty page-load id", JSON.stringify({ owner: "o", publicReference: receipt.publicReference, createdAt: receipt.createdAt, pageLoad: "" })],
  ])("ignores a record holding %s", (_label, raw) => {
    const storage = new FakeStorage();
    storage.setItem(REQUEST_INTENT_RECEIPT_RECORD_KEY, raw);
    expect(readConfirmedReceiptRecord(storage, "o")).toBeNull();
    expect(referenceConfirmedInThisTab(storage, receipt.publicReference)).toBeNull();
  });
  it("refuses to remember a receipt whose reference is not a review-request reference", () => {
    const storage = new FakeStorage();
    expect(rememberConfirmedReceipt(storage, "o", { ...receipt, publicReference: "XRR-20260819-ABCDEF1234" })).toBe(false);
    expect(rememberConfirmedReceipt(storage, "o", { ...receipt, createdAt: "not a time" })).toBe(false);
    expect(storage.map.size).toBe(0);
  });
  it("leaves nothing behind when storage refuses the write", () => {
    const storage = new FakeStorage();
    storage.setItem = () => { throw new DOMException("quota", "QuotaExceededError"); };
    expect(rememberConfirmedReceipt(storage, "o", receipt)).toBe(false);
    expect(storage.map.size).toBe(0);
    const denied = new FakeStorage();
    denied.getItem = () => { throw new DOMException("denied", "SecurityError"); };
    expect(readConfirmedReceiptRecord(denied, "o")).toBeNull();
    expect(referenceConfirmedInThisTab(denied, receipt.publicReference)).toBeNull();
    expect(() => forgetConfirmedReceipt({ removeItem: () => { throw new Error("denied"); } })).not.toThrow();
  });
  it("forgets the record on request", () => {
    const storage = new FakeStorage();
    rememberConfirmedReceipt(storage, "o", receipt);
    forgetConfirmedReceipt(storage);
    expect(storage.map.size).toBe(0);
  });
  it("rebuilds the request id from the reference only", () => {
    expect(receiptFromPublicReference(receipt.publicReference, receipt.createdAt)).toEqual(receipt);
    expect(receiptFromPublicReference("XRI-notahexreference", receipt.createdAt)).toBeNull();
    expect(receiptFromPublicReference(receipt.publicReference, "")).toBeNull();
  });
});

describe("reference continuation links", () => {
  it("builds the registered confirmation route from the reference alone", () => {
    expect(requestIntentConfirmationHref(receipt.publicReference))
      .toBe("/research/early-access/order-request/confirmation/" + receipt.publicReference);
  });
  it("prefills support email with the reference and the no-medical-details boundary, nothing else", () => {
    const href = requestIntentSupportMailto(receipt.publicReference);
    const url = new URL(href);
    expect(url.protocol).toBe("mailto:");
    expect(url.pathname).toBe("research@xeniostechnology.com");
    expect(url.searchParams.get("subject")).toBe("Quick Order request " + receipt.publicReference);
    expect(url.searchParams.get("body")).toBe("Reference: " + receipt.publicReference
      + "\n\nPlease do not include medical information or payment details in email.");
    expect([...url.searchParams.keys()]).toEqual(["subject", "body"]);
    expect(href).not.toMatch(/token|key=|@example/i);
  });
});
