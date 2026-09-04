import { beforeEach, describe, expect, it, vi } from "vitest";

const provider = vi.hoisted(() => ({
  send: vi.fn(async () => ({
    data: { id: "synthetic-health-contact-message" },
    error: null,
  })),
}));

vi.mock("../services/email", () => ({
  TEAM_EMAIL: "team@xeniostechnology.com",
  getResendClient: async () => ({
    client: { emails: { send: provider.send } },
    fromEmail: "Unrelated Site <wrong-sender@example.test>",
    replyToEmail: "wrong-replies@example.test",
  }),
}));

import {
  sendCareContactAutoReply,
  sendCareContactInternalAlert,
} from "./contact";
import { XENIOS_HEALTH_EMAIL_FROM } from "./email-identity";

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

  it("forces both messages to the Health team sender and preserves reply boundaries", async () => {
    await sendCareContactInternalAlert(message);
    await sendCareContactAutoReply(message);

    expect(XENIOS_HEALTH_EMAIL_FROM).toBe(
      "Xenios Health <team@xeniostechnology.com>",
    );
    expect(provider.send).toHaveBeenNthCalledWith(1, expect.objectContaining({
      from: XENIOS_HEALTH_EMAIL_FROM,
      to: "team@xeniostechnology.com",
      replyTo: "jordan@example.test",
      subject: "[Xenios Health] Care pathway support",
    }));
    expect(provider.send).toHaveBeenNthCalledWith(2, expect.objectContaining({
      from: XENIOS_HEALTH_EMAIL_FROM,
      to: "jordan@example.test",
      replyTo: "team@xeniostechnology.com",
      subject: "We received your Xenios Health support message",
    }));
    expect(JSON.stringify(provider.send.mock.calls)).not.toContain(
      "wrong-sender@example.test",
    );
  });
});
