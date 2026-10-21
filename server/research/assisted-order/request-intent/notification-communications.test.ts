import { describe, expect, it, vi } from "vitest";
import { notificationRecipients, notificationSendEnabled, renderRequestIntentNotification, REQUEST_INTENT_NOTIFICATION_STAFF_LINK_READY as ready, REQUEST_INTENT_NOTIFICATION_TEMPLATE as key } from "./notification-communications";
const env = { SITE_URL: "https://example.invalid", RESEARCH_REQUEST_INTENT_NOTIFICATION_RECIPIENTS: "staff@example.invalid" };
const payload = { publicReference: "XRI-" + "A".repeat(32) };
describe("request-intent minimal internal notification", () => {
  it("defaults delivery off and accepts only exact true", () => {
    for (const value of [undefined, "false", "TRUE", "1"]) expect(notificationSendEnabled({ RESEARCH_REQUEST_INTENT_NOTIFICATIONS_SEND_ENABLED: value })).toBe(false);
    expect(notificationSendEnabled({ RESEARCH_REQUEST_INTENT_NOTIFICATIONS_SEND_ENABLED: "true" })).toBe(true);
  });
  it("uses an explicit normalized allowlist without admin fallback", () => {
    expect(notificationRecipients({ ADMIN_EMAIL: "staff@example.invalid" })).toEqual([]);
    expect(notificationRecipients({ RESEARCH_REQUEST_INTENT_NOTIFICATION_RECIPIENTS: " B@example.invalid ,a@example.invalid" })).toEqual(["a@example.invalid", "b@example.invalid"]);
  });
  it.each(["", "bad", "a@example.invalid,a@example.invalid", "a@example.invalid\n", Array(6).fill(0).map((_,i)=>"u"+i+"@example.invalid").join(",")])("fails closed on invalid recipients %j", value => {
    expect(notificationRecipients({ RESEARCH_REQUEST_INTENT_NOTIFICATION_RECIPIENTS: value })).toEqual([]);
  });
  it("preserves legacy reference-only content without inventing metadata or queue readiness", () => {
    const result = renderRequestIntentNotification(key, payload, "staff@example.invalid", env)!;
    expect(result.text).toContain(payload.publicReference);
    expect(result.text).not.toContain("https://");
    expect(result.text).not.toContain("Sign in");
    expect(result.text).not.toContain("Status:");
    expect(result.text).not.toContain("Submitted at");
    expect(result.text).toContain("pending review");
    expect(result.text).not.toContain("?");
    expect(Object.keys(result)).toEqual(["subject", "text"]);
  });
  it("renders only the supplied complete canonical status/time without reading a clock", () => {
    const supplied = { ...payload, status: "pending_review", submittedAt: "2026-10-18T12:00:00.000Z" };
    const clock = vi.spyOn(Date, "now").mockImplementation(() => { throw new Error("no fabricated current time"); });
    const result = (() => {
      try { return renderRequestIntentNotification(key, supplied, "staff@example.invalid", env)!; }
      finally { clock.mockRestore(); }
    })();
    expect(result.subject).toBe("Quick Order request pending review");
    expect(result.text).toContain("Status: pending review");
    expect(result.text).toContain("Submitted at (UTC): " + supplied.submittedAt);
    expect(result.text).not.toContain("https://");
    expect(result.text).toContain("not a payment, prescription, or fulfillment confirmation");
    expect(supplied).toEqual({ ...payload, status: "pending_review", submittedAt: "2026-10-18T12:00:00.000Z" });
  });
  it.each([
    { ...payload, status: "pending_review" }, { ...payload, submittedAt: "2026-10-18T12:00:00.000Z" },
    ...["paid", "approved", "shipped", null, "PENDING_REVIEW"].map(status => ({ ...payload, status, submittedAt: "2026-10-18T12:00:00.000Z" })),
    ...[null, 0, "", "not-a-date", "2026-02-30T12:00:00.000Z", "2026-10-18T12:00:00Z", "2026-10-18T12:00:00.000+00:00"].map(submittedAt => ({ ...payload, status: "pending_review", submittedAt })),
    { ...payload, status: "pending_review", submittedAt: "2026-10-18T12:00:00.000Z", contact: "private" },
  ])("refuses partial, untruthful, noncanonical or extended metadata %j", input => {
    expect(() => renderRequestIntentNotification(key, input, "staff@example.invalid", env)).toThrow("request_intent_notification_invalid");
  });
  it.each([undefined, "false", "TRUE", "1", "true "])("omits the link for unverified readiness %j even when staff reads are enabled", value => {
    const result = renderRequestIntentNotification(key, payload, "staff@example.invalid", { ...env, [ready]: value, RESEARCH_REQUEST_INTENT_STAFF_READ_ENABLED: "true" })!;
    expect(result.text).not.toContain("Sign in");
    expect(result.text).not.toContain("https://");
  });
  it.each([undefined, "false", "TRUE", "1"])("does not confuse a readiness setting with staff-read enablement %j", value => {
    expect(renderRequestIntentNotification(key, payload, "staff@example.invalid", { ...env, [ready]: "true", RESEARCH_REQUEST_INTENT_STAFF_READ_ENABLED: value })!.text).not.toContain("Sign in");
  });
  it("includes only the fixed same-origin authenticated route after both explicit checks", () => {
    const result = renderRequestIntentNotification(key, payload, "staff@example.invalid", { ...env, [ready]: "true", RESEARCH_REQUEST_INTENT_STAFF_READ_ENABLED: "true", ADMIN_EMAIL: "staff@example.invalid" })!;
    expect(result.text).toContain("https://example.invalid/care/request-intents");
    expect(result.text).not.toContain("?");
    expect(result.text).not.toContain(payload.publicReference + "/");
    expect(result.text).not.toContain("token=");
  });
  it("rejects extra non-enumerable or symbol fields without mutating the payload", () => {
    for (const input of [Object.defineProperty({ ...payload }, "contact", { value: "private" }), { ...payload, [Symbol("private")]: "hidden" }]) {
      expect(() => renderRequestIntentNotification(key, input, "staff@example.invalid", env)).toThrow();
    }
  });
  it.each([{ ...payload, contact: {} }, { ...payload, token: "private" }, { ...payload, productName: "item" }, { publicReference: "<script>" }, [], null])("refuses noncanonical payload %j", input => {
    expect(() => renderRequestIntentNotification(key, input, "staff@example.invalid", env)).toThrow();
  });
  it.each(["http://example.invalid", "https://name:secret@example.invalid", "https://example.invalid/path", "https://example.invalid/?token=bad"])("refuses unsafe origin %s", SITE_URL => {
    expect(() => renderRequestIntentNotification(key, payload, "staff@example.invalid", {...env,SITE_URL})).toThrow();
  });
  it("refuses an unapproved recipient and ignores other templates", () => {
    expect(() => renderRequestIntentNotification(key, payload, "other@example.invalid", env)).toThrow();
    expect(renderRequestIntentNotification("other", {}, "", {})).toBeNull();
  });
});
