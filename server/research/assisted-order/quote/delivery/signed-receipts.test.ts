import { createHash, createHmac, randomBytes } from "node:crypto";
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { TEAM } from "./mail.mjs";
import { attachResendReceiptDoor, signedQuoteReceiptVerifier } from "./signed-receipts.mjs";

// Pins the quote channel's filter on top of the shared signature check: which
// verified events are quote mail, what is kept from them, and what the one
// receipt endpoint hands to the customer-notice channel.

const NOW = Date.UTC(2026, 10, 18, 15, 0, 0);
const TS = String(Math.floor(NOW / 1000));
const key = randomBytes(32);
const secret = "whsec_" + key.toString("base64");
const tagKey = randomBytes(32);
const EMAIL_ID = "4F1C2D3E-0000-4000-8000-00000000ABCD";
const QUOTE_SUBJECT = "A private update from Team Xenios";

function signed(value: unknown, id = "msg_quote_synthetic") {
  const bytes = Buffer.from(JSON.stringify(value));
  const sig = createHmac("sha256", key).update(`${id}.${TS}.`, "ascii").update(bytes).digest("base64");
  return { bytes, headers: ["svix-id", id, "svix-timestamp", TS, "svix-signature", `v1,${sig}`] };
}
const quoteEvent = (type: string, extra: Record<string, unknown> = {}) => ({
  type,
  data: { email_id: EMAIL_ID, from: `Team Xenios <${TEAM}>`, to: ["buyer@example.invalid"], subject: QUOTE_SUBJECT, ...extra },
});
const expectedTag = (address: string) =>
  createHmac("sha256", tagKey).update(JSON.stringify(["resend-recipient", address])).digest("hex");

describe("quote receipt verifier", () => {
  const verify = signedQuoteReceiptVerifier({ secrets: [secret], tagKey, now: () => NOW });

  it.each([["email.sent", "accepted"], ["email.delivered", "delivered"], ["email.bounced", "bounced"]])(
    "keeps only the event id, provider id, kind, digest and recipient tag for %s", (type, kind) => {
      const { bytes, headers } = signed(quoteEvent(type));
      expect(verify(bytes, headers)).toEqual({
        eid: "msg_quote_synthetic",
        pid: EMAIL_ID.toLowerCase(),
        kind,
        digest: createHash("sha256").update(bytes).digest("hex"),
        addressTag: expectedTag("buyer@example.invalid"),
      });
    });

  it("accepts the bare team sender as well as the named one", () => {
    const { bytes, headers } = signed(quoteEvent("email.delivered", { from: TEAM }));
    expect(verify(bytes, headers)?.kind).toBe("delivered");
  });

  it.each([
    ["another event type", quoteEvent("email.opened")],
    ["another subject", quoteEvent("email.delivered", { subject: "Your request is being reviewed" })],
    ["another sender", quoteEvent("email.delivered", { from: "notices@example.invalid" })],
  ])("does not claim %s", (_name, event) => {
    const { bytes, headers } = signed(event);
    expect(verify(bytes, headers)).toBeNull();
  });

  it.each([
    ["a provider id that is not a uuid", quoteEvent("email.delivered", { email_id: "not-a-uuid" })],
    ["a sender that is not text", quoteEvent("email.delivered", { from: 7 })],
    ["no recipient list", quoteEvent("email.delivered", { to: "buyer@example.invalid" })],
    ["two recipients on quote mail", quoteEvent("email.delivered", { to: ["a@example.invalid", "b@example.invalid"] })],
    ["an unusual recipient form", quoteEvent("email.delivered", { to: ["Buyer <buyer@example.invalid>"] })],
  ])("rejects %s", (_name, event) => {
    const { bytes, headers } = signed(event);
    expect(() => verify(bytes, headers)).toThrow("Invalid provider event.");
  });

  it("rejects a bad signature before reading the event", () => {
    const { bytes, headers } = signed(quoteEvent("email.delivered"));
    headers[5] = "v1," + Buffer.alloc(32).toString("base64");
    expect(() => verify(bytes, headers)).toThrow("Invalid provider event.");
  });

  it("refuses a short tag key, and a secret list outside one or two", () => {
    expect(() => signedQuoteReceiptVerifier({ secrets: [secret], tagKey: randomBytes(16) })).toThrow("Invalid provider event.");
    expect(() => signedQuoteReceiptVerifier({ secrets: [], tagKey })).toThrow("Invalid provider event.");
    expect(() => signedQuoteReceiptVerifier({ secrets: [secret, secret, secret], tagKey })).toThrow("Invalid provider event.");
  });
});

describe("the one receipt endpoint", () => {
  function app(quote: { status: number; unclaimed?: boolean }, notices: { receive: ReturnType<typeof vi.fn> } | null) {
    const router = express();
    const receipts = { receive: vi.fn(async () => quote) };
    attachResendReceiptDoor(router, { raw: express.raw, receipts, reconcile: vi.fn(), notices });
    return { router, receipts };
  }
  const post = (router: express.Express) => request(router).post("/api/webhooks/early-access/quote-delivery")
    .set("Content-Type", "application/json").send(JSON.stringify(quoteEvent("email.delivered")));

  it("leaves a claimed quote event with the quote channel", async () => {
    const notices = { receive: vi.fn(async () => ({ status: 503 })) };
    const { router, receipts } = app({ status: 204 }, notices);
    const res = await post(router);
    expect(res.status).toBe(204);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(receipts.receive).toHaveBeenCalledTimes(1);
    expect(notices.receive).not.toHaveBeenCalled();
  });

  it.each([400, 409, 503])("never passes a quote %i on to the notice channel", async (status) => {
    const notices = { receive: vi.fn(async () => ({ status: 204 })) };
    const { router } = app({ status }, notices);
    expect((await post(router)).status).toBe(status);
    expect(notices.receive).not.toHaveBeenCalled();
  });

  it.each([204, 400, 409, 503])("hands an unclaimed event to the notice channel with the same bytes, which answers %i", async (status) => {
    const notices = { receive: vi.fn(async (_bytes: Buffer, _headers: readonly string[]) => ({ status })) };
    const { router } = app({ status: 204, unclaimed: true }, notices);
    expect((await post(router)).status).toBe(status);
    expect(notices.receive).toHaveBeenCalledTimes(1);
    const [bytes, headers] = notices.receive.mock.calls[0];
    expect(Buffer.isBuffer(bytes)).toBe(true);
    expect(JSON.parse(bytes.toString()).data.email_id).toBe(EMAIL_ID);
    expect(headers).toContain("Content-Type");
  });

  it("answers 503 when the notice channel throws or returns an unknown status", async () => {
    for (const receive of [vi.fn(async () => { throw new Error("database down"); }), vi.fn(async () => ({ status: 200 }))]) {
      const { router } = app({ status: 204, unclaimed: true }, { receive });
      expect((await post(router)).status).toBe(503);
    }
  });

  it("without a notice channel, an unclaimed event is acknowledged as before", async () => {
    const { router } = app({ status: 204, unclaimed: true }, null);
    expect((await post(router)).status).toBe(204);
  });

  it("refuses a notice channel that cannot receive", () => {
    expect(() => attachResendReceiptDoor(express(), {
      raw: express.raw, receipts: { receive: vi.fn() }, reconcile: vi.fn(), notices: {} as never,
    })).toThrow("Invalid provider event.");
  });

  it("still refuses non-JSON and compressed bodies before either channel", async () => {
    const notices = { receive: vi.fn(async () => ({ status: 204 })) };
    const { router, receipts } = app({ status: 204, unclaimed: true }, notices);
    const text = await request(router).post("/api/webhooks/early-access/quote-delivery").set("Content-Type", "text/plain").send("x");
    expect(text.status).toBe(415);
    const gz = await request(router).post("/api/webhooks/early-access/quote-delivery")
      .set("Content-Type", "application/json").set("Content-Encoding", "gzip").send("{}");
    // express.raw refuses an encoded body with 415, which the door reports as 400.
    expect(gz.status).toBe(400);
    expect(receipts.receive).not.toHaveBeenCalled();
    expect(notices.receive).not.toHaveBeenCalled();
  });
});
