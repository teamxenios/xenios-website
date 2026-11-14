import { describe, expect, it, vi } from "vitest";
import { requestIntentQuoteOwnerReader } from "./quote-owner-reader";

const OWNER = "a".repeat(64);
const FIRST = "00000000-0000-4000-8000-000000000001";
const SECOND = "00000000-0000-4000-8000-000000000002";

describe("the private quote request owner reader", () => {
  it("binds the exact request and treats an empty match as denial", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: [FIRST], error: null })
      .mockResolvedValueOnce({ data: [], error: null });
    const reader = requestIntentQuoteOwnerReader({ rpc });

    await expect(reader.owns(OWNER, FIRST)).resolves.toBe(true);
    await expect(reader.owns(OWNER, SECOND)).resolves.toBe(false);
    expect(rpc).toHaveBeenNthCalledWith(1, "request_intent_owned_ids", {
      p_owner_hash: OWNER, p_request_id: FIRST, p_after_id: null,
    });
  });

  it("passes the cursor and returns only strictly increasing IDs", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: [SECOND], error: null })
      .mockResolvedValueOnce({ data: [FIRST], error: null });
    const reader = requestIntentQuoteOwnerReader({ rpc });

    await expect(reader.list(OWNER, FIRST)).resolves.toEqual([SECOND]);
    await expect(reader.list(OWNER, FIRST)).rejects.toThrow("invalid_persistence_result");
    expect(rpc).toHaveBeenCalledWith("request_intent_owned_ids", {
      p_owner_hash: OWNER, p_request_id: null, p_after_id: FIRST,
    });
  });

  it("fails closed on a mismatched exact request or provider error", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: [SECOND], error: null })
      .mockResolvedValueOnce({ data: [FIRST], error: { message: "private detail" } });
    const reader = requestIntentQuoteOwnerReader({ rpc });

    await expect(reader.owns(OWNER, FIRST)).rejects.toThrow("invalid_persistence_result");
    await expect(reader.owns(OWNER, FIRST)).rejects.toThrow("request_intent_persistence_uncertain");
    await expect(reader.owns("untrusted", FIRST)).rejects.toThrow("invalid_quote_owner_scope");
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
