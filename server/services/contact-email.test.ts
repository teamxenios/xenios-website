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
  it("uses the team inbox and bounded subject, and returns only on acceptance", async () => {
    await sendContactMessage(message);
    expect(provider.send).toHaveBeenCalledWith(expect.objectContaining({ to: TEAM_EMAIL, replyTo: message.email, subject: "[Enterprise] Synthetic inquiry" }));
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
