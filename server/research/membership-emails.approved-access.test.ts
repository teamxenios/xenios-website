import { beforeEach, describe, expect, it, vi } from "vitest";
const mail = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("../services/email", () => ({ getResendClient: async () => ({ client: { emails: mail } }) }));
import { sendApprovedCustomerClaim, sendApprovedCustomerWelcome } from "./membership-emails";
beforeEach(() => { mail.send.mockReset().mockResolvedValue({ data: { id: "provider-test-only" }, error: null }); });
describe("approved customer Health emails", () => {
  const base = { email: "customer@example.invalid", firstName: "Customer", idempotencyKey: "approved-customer:test-only:1" };
  it("uses team identity, encoded ownership link and provider retry key without fees", async () => {
    await sendApprovedCustomerClaim({ ...base, token: "synthetic&token", approvalExpiresAt: new Date("2026-09-19T00:00:00Z") });
    const [message, options] = mail.send.mock.calls[0];
    expect(message).toMatchObject({ from: "Xenios Health <team@xeniostechnology.com>", replyTo: "team@xeniostechnology.com", to: base.email });
    expect(options).toEqual({ idempotencyKey: base.idempotencyKey });
    expect(message.text).toContain("token=synthetic%26token"); expect(message.text).not.toMatch(/\$50|\$25|monthly membership|activate your membership/i);
  });
  it("welcome directs normal sign-in to the account and has no token or membership charge", async () => {
    expect(await sendApprovedCustomerWelcome(base)).toMatchObject({ ok: true });
    const text = mail.send.mock.calls[0][0].text;
    expect(text).toContain("/research/sign-in?returnTo=%2Fresearch%2Faccount"); expect(text).not.toMatch(/token=|membership|\$/i);
  });
  it("does not claim delivery on a provider rejection", async () => {
    mail.send.mockResolvedValue({ data: null, error: { name: "provider_rejected" } });
    expect(await sendApprovedCustomerWelcome(base)).toMatchObject({ ok: false, id: null });
  });
});
