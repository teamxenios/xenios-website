import { createHash, createHmac, randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("../../../supabase", () => ({ getSupabaseAdmin: () => ({ rpc }) }));

import { resendWebhookVerifier } from "../../email/resend-webhook-signature.mjs";
import {
  CUSTOMER_NOTICE_RECEIPT_RECORD_RPC,
  CUSTOMER_NOTICE_RECEIPTS_RECONCILE_RPC,
  CustomerNoticeReceiptConflict,
  createCustomerNoticeReceipts,
  customerNoticeReceiptChannel,
  reconcileCustomerNoticeReceipts,
  recordCustomerNoticeReceipt,
  type CustomerNoticeReceipt,
} from "./customer-notice-receipts";

const key = randomBytes(32);
const secret = "whsec_" + key.toString("base64");
const EMAIL_ID = "9A7B6C5D-0000-4000-8000-0000000000EF";

function signed(value: unknown, id = "msg_notice_synthetic", ts = String(Math.floor(Date.now() / 1000))) {
  const bytes = Buffer.from(JSON.stringify(value));
  const sig = createHmac("sha256", key).update(`${id}.${ts}.`, "ascii").update(bytes).digest("base64");
  return { bytes, headers: ["Content-Type", "application/json", "svix-id", id, "svix-timestamp", ts, "svix-signature", `v1,${sig}`] };
}
const event = (type: string, data: Record<string, unknown> = {}) => ({
  type,
  created_at: "2026-11-18T15:00:00.000Z",
  data: {
    email_id: EMAIL_ID,
    from: "Team Xenios <notices@example.invalid>",
    to: ["customer@example.invalid"],
    subject: "Your request is being reviewed · XRI-0123456789ABCDEF0123456789ABCDEF",
    bounce: { message: "synthetic bounce text that must not be kept" },
    ...data,
  },
});

beforeEach(() => {
  rpc.mockReset();
});

describe("customer-notice receipt channel", () => {
  function channel(record = vi.fn(async (_r: CustomerNoticeReceipt) => "matched" as const)) {
    return { record, receipts: createCustomerNoticeReceipts({ verify: resendWebhookVerifier({ secrets: [secret] }), record }) };
  }

  it.each([["email.sent", "accepted"], ["email.delivered", "delivered"], ["email.bounced", "bounced"]] as const)(
    "records %s as %s with the event id, lower-case provider id and digest only", async (type, kind) => {
      const { record, receipts } = channel();
      const { bytes, headers } = signed(event(type));
      expect(await receipts.receive(bytes, headers)).toEqual({ status: 204 });
      expect(record).toHaveBeenCalledTimes(1);
      const receipt = record.mock.calls[0][0];
      expect(receipt).toEqual({
        eventId: "msg_notice_synthetic",
        messageId: EMAIL_ID.toLowerCase(),
        kind,
        digest: createHash("sha256").update(bytes).digest("hex"),
      });
      // No address, subject, sender or bounce text leaves the channel.
      expect(JSON.stringify(receipt)).not.toMatch(/customer@|notices@|XRI-|synthetic bounce|being reviewed/);
    });

  it("acknowledges an unmatched receipt the same way as a matched one", async () => {
    const { receipts } = channel(vi.fn(async () => "unmatched" as const));
    const { bytes, headers } = signed(event("email.delivered"));
    expect(await receipts.receive(bytes, headers)).toEqual({ status: 204 });
  });

  it.each(["email.opened", "email.clicked", "email.complained", "email.delivery_delayed"])(
    "acknowledges %s without recording it", async (type) => {
      const { record, receipts } = channel();
      const { bytes, headers } = signed(event(type));
      expect(await receipts.receive(bytes, headers)).toEqual({ status: 204 });
      expect(record).not.toHaveBeenCalled();
    });

  it.each([
    ["two recipients", ["a@example.invalid", "b@example.invalid"]],
    ["no recipients", []],
  ])("never records a report about %s", async (_name, to) => {
    const { record, receipts } = channel();
    const { bytes, headers } = signed(event("email.delivered", { to }));
    expect(await receipts.receive(bytes, headers)).toEqual({ status: 204 });
    expect(record).not.toHaveBeenCalled();
  });

  it.each([
    ["a provider id that is not a uuid", { email_id: "re_not_a_uuid" }],
    ["no recipient list", { to: "customer@example.invalid" }],
  ])("rejects %s", async (_name, data) => {
    const { record, receipts } = channel();
    const { bytes, headers } = signed(event("email.delivered", data));
    expect(await receipts.receive(bytes, headers)).toEqual({ status: 400 });
    expect(record).not.toHaveBeenCalled();
  });

  it("rejects a bad signature, a stale timestamp and a changed byte before recording", async () => {
    const { record, receipts } = channel();
    const good = signed(event("email.delivered"));
    const badSig = [...good.headers];
    badSig[7] = "v1," + Buffer.alloc(32).toString("base64");
    const stale = signed(event("email.delivered"), undefined, String(Math.floor(Date.now() / 1000) - 3600));
    const changed = Buffer.from(good.bytes.toString().replace("delivered", "bounced"));
    expect(await receipts.receive(good.bytes, badSig)).toEqual({ status: 400 });
    expect(await receipts.receive(stale.bytes, stale.headers)).toEqual({ status: 400 });
    expect(await receipts.receive(changed, good.headers)).toEqual({ status: 400 });
    expect(record).not.toHaveBeenCalled();
  });

  it("answers 409 for a replayed event id with other facts and 503 when recording fails", async () => {
    const { bytes, headers } = signed(event("email.delivered"));
    const conflict = channel(vi.fn(async () => { throw new CustomerNoticeReceiptConflict(); }));
    expect(await conflict.receipts.receive(bytes, headers)).toEqual({ status: 409 });
    const down = channel(vi.fn(async () => { throw new Error("database unavailable"); }));
    expect(await down.receipts.receive(bytes, headers)).toEqual({ status: 503 });
  });

  it("builds the endpoint channel from the endpoint's own secrets", async () => {
    const record = vi.fn(async () => "matched" as const);
    const receipts = customerNoticeReceiptChannel([secret], record);
    const { bytes, headers } = signed(event("email.delivered"));
    expect(await receipts.receive(bytes, headers)).toEqual({ status: 204 });
    const other = customerNoticeReceiptChannel(["whsec_" + randomBytes(32).toString("base64")], record);
    expect(await other.receive(bytes, headers)).toEqual({ status: 400 });
    expect(record).toHaveBeenCalledTimes(1);
  });
});

describe("the database calls", () => {
  const receipt: CustomerNoticeReceipt = {
    eventId: "msg_notice_synthetic", messageId: EMAIL_ID.toLowerCase(), kind: "delivered", digest: "c".repeat(64),
  };

  it("records through the backend-only function with exactly four arguments", async () => {
    rpc.mockResolvedValueOnce({ data: "unmatched", error: null });
    expect(await recordCustomerNoticeReceipt(receipt)).toBe("unmatched");
    expect(rpc).toHaveBeenCalledWith(CUSTOMER_NOTICE_RECEIPT_RECORD_RPC, {
      p_provider_event_id: "msg_notice_synthetic",
      p_provider_message_id: EMAIL_ID.toLowerCase(),
      p_kind: "delivered",
      p_digest: "c".repeat(64),
    });
  });

  it("turns a 23505 into a conflict and any other failure or answer into an error", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "23505", message: "customer_notice_receipt_identity_conflict" } });
    await expect(recordCustomerNoticeReceipt(receipt)).rejects.toBeInstanceOf(CustomerNoticeReceiptConflict);
    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "denied" } });
    await expect(recordCustomerNoticeReceipt(receipt)).rejects.not.toBeInstanceOf(CustomerNoticeReceiptConflict);
    rpc.mockResolvedValueOnce({ data: "applied", error: null });
    await expect(recordCustomerNoticeReceipt(receipt)).rejects.toThrow("customer notice receipt not recorded");
  });

  it("reconciles by provider id and reports a failed or invalid answer as null, never zero", async () => {
    rpc.mockResolvedValueOnce({ data: 2, error: null });
    expect(await reconcileCustomerNoticeReceipts(EMAIL_ID)).toBe(2);
    expect(rpc).toHaveBeenLastCalledWith(CUSTOMER_NOTICE_RECEIPTS_RECONCILE_RPC, { p_provider_message_id: EMAIL_ID.toLowerCase() });
    rpc.mockResolvedValueOnce({ data: null, error: { message: "down" } });
    expect(await reconcileCustomerNoticeReceipts(EMAIL_ID)).toBeNull();
    rpc.mockResolvedValueOnce({ data: "2", error: null });
    expect(await reconcileCustomerNoticeReceipts(EMAIL_ID)).toBeNull();
    rpc.mockRejectedValueOnce(new Error("network"));
    expect(await reconcileCustomerNoticeReceipts(EMAIL_ID)).toBeNull();
    const calls = rpc.mock.calls.length;
    expect(await reconcileCustomerNoticeReceipts("not-a-uuid")).toBeNull();
    expect(rpc.mock.calls.length).toBe(calls);
  });
});
