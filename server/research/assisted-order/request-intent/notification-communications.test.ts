import { describe, expect, it } from "vitest";
import { notificationRecipients, notificationSendEnabled, renderRequestIntentNotification, REQUEST_INTENT_NOTIFICATION_TEMPLATE as key } from "./notification-communications";
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
  it("renders reference only and a static authenticated path with request-only wording", () => {
    const result = renderRequestIntentNotification(key, payload, "staff@example.invalid", env)!;
    expect(result.text).toContain("https://example.invalid/care/request-intents");
    expect(result.text).toContain("pending review");
    expect(result.text).not.toContain("?");
    expect(Object.keys(result)).toEqual(["subject", "text"]);
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
