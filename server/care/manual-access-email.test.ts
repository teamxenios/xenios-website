import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CareManualAccessRequest } from "@shared/care/manual-access";

const provider = vi.hoisted(() => ({
  send: vi.fn(async () => ({
    data: { id: "synthetic-care-message" },
    error: null,
  })),
}));

vi.mock("../services/email", () => ({
  TEAM_EMAIL: "team@xeniostechnology.com",
  getResendClient: async () => ({
    client: { emails: { send: provider.send } },
    // Care owns its sender identity. A generic site override must not win.
    fromEmail: "Unrelated Site <wrong-sender@example.test>",
    replyToEmail: "wrong-replies@example.test",
  }),
}));

vi.mock("../services/email-config", () => ({
  adminRecipients: () => ["care-operations@example.test"],
  resolveEmailConfiguration: async () => ({
    provider: "resend-env",
    apiKey: "synthetic-provider-key",
    adminRecipients: ["care-operations@example.test"],
  }),
}));

import {
  buildCareManualAccessProductionDependencies,
} from "./manual-access";
import { XENIOS_HEALTH_EMAIL_FROM } from "./email-identity";

const request: CareManualAccessRequest = {
  fullName: "Jordan Test",
  email: "jordan@example.test",
  locationState: "TX",
  careGoal: "new_care_request",
  contactMethod: "email",
  contactWindow: "afternoon",
  adultConfirmation: true,
  boundaryAcknowledgement: true,
};

describe("Xenios Health Care email envelopes", () => {
  beforeEach(() => {
    provider.send.mockClear();
  });

  it("sends the internal Care alert from the canonical team address", async () => {
    const deps = buildCareManualAccessProductionDependencies();

    await expect(
      deps.sendInternalAlert(request, "CARE-123E4567"),
    ).resolves.toBe(true);

    expect(XENIOS_HEALTH_EMAIL_FROM).toBe(
      "Xenios Health <team@xeniostechnology.com>",
    );
    expect(provider.send).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        from: XENIOS_HEALTH_EMAIL_FROM,
        to: ["care-operations@example.test"],
        replyTo: "jordan@example.test",
        subject: "[Xenios Care] New access request CARE-123E4567",
      }),
    );
    expect(JSON.stringify(provider.send.mock.calls)).not.toContain(
      "wrong-sender@example.test",
    );
  });

  it("sends the requester confirmation from and back to the team address", async () => {
    const deps = buildCareManualAccessProductionDependencies();

    await expect(
      deps.sendConfirmation(request, "CARE-123E4567"),
    ).resolves.toBe(true);

    expect(provider.send).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        from: XENIOS_HEALTH_EMAIL_FROM,
        to: "jordan@example.test",
        replyTo: "team@xeniostechnology.com",
        subject: "We received your Xenios Care request (CARE-123E4567)",
      }),
    );
    expect(JSON.stringify(provider.send.mock.calls)).not.toContain(
      "wrong-sender@example.test",
    );
  });
});
