import { createHash, createHmac, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { resendDeliveryKind, resendWebhookVerifier } from "./resend-webhook-signature.mjs";

const NOW = Date.UTC(2026, 10, 18, 15, 0, 0);
const TS = String(Math.floor(NOW / 1000));
const keyA = randomBytes(24);
const keyB = randomBytes(32);
const secretA = "whsec_" + keyA.toString("base64");
const secretB = "whsec_" + keyB.toString("base64");

function sign(key: Buffer, id: string, ts: string, bytes: Buffer): string {
  return createHmac("sha256", key).update(`${id}.${ts}.`, "ascii").update(bytes).digest("base64");
}
function headers(key: Buffer, bytes: Buffer, id = "msg_2pQ7synthetic", ts = TS): string[] {
  return ["Content-Type", "application/json", "svix-id", id, "svix-timestamp", ts, "svix-signature", `v1,${sign(key, id, ts, bytes)}`];
}
const body = (value: unknown) => Buffer.from(JSON.stringify(value));
const delivered = body({ type: "email.delivered", data: { email_id: "4f1c2d3e-0000-4000-8000-00000000abcd", to: ["x@example.invalid"] } });

describe("Resend webhook signature verification", () => {
  const verify = resendWebhookVerifier({ secrets: [secretA], now: () => NOW });

  it("returns the signed id, the parsed event and the digest of the exact bytes", () => {
    const result = verify(delivered, headers(keyA, delivered));
    expect(result.eid).toBe("msg_2pQ7synthetic");
    expect(result.event.type).toBe("email.delivered");
    expect(result.digest).toBe(createHash("sha256").update(delivered).digest("hex"));
    expect(Object.keys(result).sort()).toEqual(["digest", "eid", "event"]);
  });

  it("verifies any event type; deciding what a type means is the channel's job", () => {
    const opened = body({ type: "email.opened", data: {} });
    expect(verify(opened, headers(keyA, opened)).event.type).toBe("email.opened");
  });

  it("accepts either of two approved secrets, for rotation", () => {
    const both = resendWebhookVerifier({ secrets: [secretA, secretB], now: () => NOW });
    expect(both(delivered, headers(keyB, delivered)).eid).toBe("msg_2pQ7synthetic");
    expect(() => verify(delivered, headers(keyB, delivered))).toThrow("Invalid provider event.");
  });

  it("accepts a valid signature among several listed", () => {
    const h = headers(keyA, delivered);
    h[7] = `v1,${"A".repeat(43)}= v2,ignored ${h[7]}`;
    expect(verify(delivered, h).eid).toBe("msg_2pQ7synthetic");
  });

  it.each([
    ["a changed byte", (h: string[]) => ({ bytes: Buffer.from(delivered.toString().replace("delivered", "bounced")), headers: h })],
    ["a missing signature", (h: string[]) => ({ bytes: delivered, headers: h.slice(0, 6) })],
    ["a duplicated signed header", (h: string[]) => ({ bytes: delivered, headers: [...h, "svix-id", "msg_2pQ7synthetic"] })],
    ["a non-string header value", (h: string[]) => ({ bytes: delivered, headers: [...h.slice(0, 7), 7 as unknown as string] })],
    ["an odd header list", (h: string[]) => ({ bytes: delivered, headers: h.slice(0, 7) })],
    ["an invalid message id", (_h: string[]) => ({ bytes: delivered, headers: headers(keyA, delivered, "msg bad") })],
    ["a timestamp over 300 s old", (_h: string[]) => ({ bytes: delivered, headers: headers(keyA, delivered, undefined, String(Number(TS) - 301)) })],
    ["a timestamp over 300 s ahead", (_h: string[]) => ({ bytes: delivered, headers: headers(keyA, delivered, undefined, String(Number(TS) + 301)) })],
    ["a non-numeric timestamp", (_h: string[]) => ({ bytes: delivered, headers: headers(keyA, delivered, undefined, "17e8") })],
  ])("rejects %s", (_name, mutate) => {
    const { bytes, headers: h } = mutate(headers(keyA, delivered));
    expect(() => verify(bytes, h)).toThrow();
  });

  it("accepts a timestamp exactly 300 s away", () => {
    const edge = String(Number(TS) - 300);
    expect(verify(delivered, headers(keyA, delivered, undefined, edge)).eid).toBe("msg_2pQ7synthetic");
  });

  it("rejects empty, oversized, non-UTF-8 and non-event bodies even when signed", () => {
    const big = Buffer.alloc(65537, 0x20);
    const latin = Buffer.from([0x7b, 0x22, 0x74, 0xff, 0x22, 0x7d]);
    const noType = body({ data: {} });
    expect(() => verify(Buffer.alloc(0), headers(keyA, Buffer.alloc(0)))).toThrow();
    expect(() => verify(big, headers(keyA, big))).toThrow();
    expect(() => verify(latin, headers(keyA, latin))).toThrow();
    expect(() => verify(noType, headers(keyA, noType))).toThrow();
    expect(() => verify(delivered.toString() as unknown as Buffer, headers(keyA, delivered))).toThrow();
  });

  it.each([
    ["no secrets", []],
    ["three secrets", [secretA, secretB, secretA]],
    ["a secret without the whsec_ prefix", [keyA.toString("base64")]],
    ["a secret that is not base64", ["whsec_not*base64"]],
    ["a secret shorter than 16 bytes", ["whsec_" + randomBytes(8).toString("base64")]],
  ])("refuses to build a verifier with %s", (_name, secrets) => {
    expect(() => resendWebhookVerifier({ secrets: secrets as string[] })).toThrow("Invalid provider event.");
  });

  it("maps exactly three event types to delivery kinds", () => {
    expect(resendDeliveryKind("email.sent")).toBe("accepted");
    expect(resendDeliveryKind("email.delivered")).toBe("delivered");
    expect(resendDeliveryKind("email.bounced")).toBe("bounced");
    for (const other of ["email.opened", "email.clicked", "email.complained", "email.delivery_delayed", "EMAIL.SENT", "", null, 1]) {
      expect(resendDeliveryKind(other)).toBeNull();
    }
  });
});
