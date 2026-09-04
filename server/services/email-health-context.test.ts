import { beforeEach, describe, expect, it, vi } from "vitest";

const provider = vi.hoisted(() => ({
  send: vi.fn(async () => ({
    data: { id: "synthetic-health-contact-message" },
    error: null,
  })),
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: provider.send };
  },
}));

vi.mock("./email-config", () => ({
  resolveEmailConfiguration: async () => ({
    provider: "resend-env",
    apiKey: "synthetic-provider-key",
    fromEmail: "Unrelated Site <wrong-sender@example.test>",
    replyToEmail: "wrong-replies@example.test",
    adminRecipients: ["care-operations@example.test"],
  }),
}));

import {
  sendContactAutoReply,
  sendContactMessage,
  sendHealthContactAutoReply,
  sendHealthContactMessage,
  XENIOS_HEALTH_EMAIL_FROM,
} from "./email";

const message = {
  name: "Jordan Test",
  email: "jordan@example.test",
  persona: "other" as const,
  subject: "Care pathway support",
  message: "I need help finding the correct nonclinical Care support pathway.",
};

describe("Xenios Health contact email envelopes", () => {
  beforeEach(() => {
    provider.send.mockClear();
  });

  it("forces both Health contact messages to the team sender and preserves reply boundaries", async () => {
    await sendHealthContactMessage(message);
    await sendHealthContactAutoReply(message);

    expect(XENIOS_HEALTH_EMAIL_FROM).toBe(
      "Xenios Health <team@xeniostechnology.com>",
    );
    expect(provider.send).toHaveBeenNthCalledWith(1, expect.objectContaining({
      from: XENIOS_HEALTH_EMAIL_FROM,
      to: "team@xeniostechnology.com",
      replyTo: "jordan@example.test",
    }));
    expect(provider.send).toHaveBeenNthCalledWith(2, expect.objectContaining({
      from: XENIOS_HEALTH_EMAIL_FROM,
      to: "jordan@example.test",
      replyTo: "team@xeniostechnology.com",
    }));
    expect(JSON.stringify(provider.send.mock.calls)).not.toContain(
      "wrong-sender@example.test",
    );
  });

  it("leaves the generic contact sender behavior unchanged", async () => {
    await sendContactMessage(message);
    await sendContactAutoReply(message);

    expect(provider.send).toHaveBeenNthCalledWith(1, expect.objectContaining({
      from: "Unrelated Site <wrong-sender@example.test>",
    }));
    expect(provider.send).toHaveBeenNthCalledWith(2, expect.objectContaining({
      from: "Unrelated Site <wrong-sender@example.test>",
    }));
  });
});
