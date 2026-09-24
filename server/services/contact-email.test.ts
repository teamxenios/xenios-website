import { beforeEach, describe, expect, it, vi } from "vitest";
const provider = vi.hoisted(() => ({ send: vi.fn(), configuration: vi.fn() }));
vi.mock("resend", () => ({ Resend: class { emails = { send: provider.send }; } }));
vi.mock("./email-config", () => ({ resolveEmailConfiguration: provider.configuration }));
import { sendContactMessage, sendContactAutoReply, TEAM_EMAIL } from "./email";

const message = { name: "Audit", email: "audit@example.invalid", persona: "enterprise" as const, subject: "[Untrusted] Synthetic inquiry", message: "Synthetic inquiry for local test only." };
beforeEach(() => {
  provider.send.mockReset().mockResolvedValue({ data: { id: "synthetic-id" }, error: null });
  provider.configuration.mockReset().mockResolvedValue({ provider: "resend", apiKey: "synthetic-only", fromEmail: "xenios <team@xeniostechnology.com>" });
});
describe("contact provider acceptance", () => {
  it("reuses distinct team/courtesy keys on retry and separates changed inquiries", async () => {
    await sendContactMessage(message);
    await sendContactMessage(message);
    await sendContactAutoReply(message);
    await sendContactAutoReply(message);
    await sendContactMessage({ ...message, message: message.message + " Changed." });
    await sendContactAutoReply({ ...message, message: message.message + " Changed." });
    const keys = provider.send.mock.calls.map(call => call[1].idempotencyKey);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).toBe(keys[3]);
    expect(new Set([keys[0], keys[2], keys[4], keys[5]]).size).toBe(4);
    expect(keys.join()).not.toContain(message.email);
  });
  it("uses the team inbox and bounded subject, and returns only on acceptance", async () => {
    await sendContactMessage(message);
    expect(provider.send).toHaveBeenCalledWith(expect.objectContaining({ to: TEAM_EMAIL, replyTo: message.email, subject: "[Enterprise] Synthetic inquiry" }), { idempotencyKey: expect.stringMatching(/^contact-team\/[a-f0-9]{64}$/) });
  });
  for (const send of [sendContactMessage, sendContactAutoReply]) {
    it(`${send.name} fails when configuration is unavailable`, async () => {
      provider.configuration.mockResolvedValue({ provider: "unavailable" });
      await expect(send(message)).rejects.toThrow(/unavailable/);
      expect(provider.send).not.toHaveBeenCalled();
    });
    it(`${send.name} fails on a provider error response`, async () => {
      provider.send.mockResolvedValue({ data: null, error: { message: "rejected" } });
      await expect(send(message)).rejects.toThrow(/not accepted/);
    });
    it(`${send.name} does not treat a malformed response as acceptance`, async () => {
      provider.send.mockResolvedValue({ data: null, error: null });
      await expect(send(message)).rejects.toThrow(/not accepted/);
    });
  }
  it("sends a courtesy reply without an invented response deadline", async () => {
    await sendContactAutoReply(message);
    const sent = provider.send.mock.calls[0][0];
    expect(sent.to).toBe(message.email);
    expect(sent.replyTo).toBe(TEAM_EMAIL);
    expect(sent.text).toContain("accepted for delivery");
    expect(sent.text).not.toContain("two business days");
  });
});
