import { expect, it, vi } from "vitest";
import { requestIntentQuoteRequestReader } from "./rpc-repository";

const XRI = "00000000-0000-4000-8000-000000000001";
const QUOTE = "00000000-0000-4000-8000-000000000002";
const OWNER = "a".repeat(64);

const detail = {
  requestId: XRI, publicReference: "XRI-00000000000040008000000000000001",
  kind: "unapproved_selection_request", status: "pending_review", createdAt: "2026-11-14T00:00:00Z",
  contact: { email: "synthetic@example.invalid" }, agreements: [], lines: [],
};

it("routes the customer and dispatch scopes without a staff actor", async () => {
  const rpc = vi.fn()
    .mockResolvedValueOnce({ data: detail, error: null })
    .mockResolvedValueOnce({ data: null, error: null });
  const reader = requestIntentQuoteRequestReader({ rpc });

  await expect(reader.forCustomer(OWNER, XRI)).resolves.toEqual(detail);
  await expect(reader.forDispatch(XRI, QUOTE)).resolves.toBeNull();
  expect(rpc).toHaveBeenNthCalledWith(1, "request_intent_quote_read", {
    p_request_id: XRI, p_owner_hash: OWNER, p_quote_id: null,
  });
  expect(rpc).toHaveBeenNthCalledWith(2, "request_intent_quote_read", {
    p_request_id: XRI, p_owner_hash: null, p_quote_id: QUOTE,
  });
});

it("fails closed on a mismatched request or a private provider error", async () => {
  const rpc = vi.fn()
    .mockResolvedValueOnce({ data: { ...detail, requestId: QUOTE }, error: null })
    .mockResolvedValueOnce({ data: null, error: { message: "provider detail" } });
  const reader = requestIntentQuoteRequestReader({ rpc });

  await expect(reader.forCustomer(OWNER, XRI)).rejects.toThrow("invalid_persistence_result");
  await expect(reader.forDispatch(XRI, QUOTE)).rejects.toThrow("request_intent_persistence_uncertain");
});
