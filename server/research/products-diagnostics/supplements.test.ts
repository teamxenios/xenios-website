import { describe, expect, it, vi } from "vitest";
import {
  SupplementPlaceholderRepository,
  type SupplementPlaceholderConfig,
} from "./supplements";

describe("Supplement placeholders", () => {
  it("publishes truthful admin-editable category placeholders without private partner references", async () => {
    const repository = new SupplementPlaceholderRepository();
    const channels: SupplementPlaceholderConfig["channelMetadata"] = {
      affiliate: {
        configured: true,
        partnerReference: "partner-internal-1",
        publicUrl: "https://partner.example/supplements",
      },
      wholesale: { configured: false, partnerReference: null, publicUrl: null },
      professional_dispensary: {
        configured: false,
        partnerReference: null,
        publicUrl: null,
      },
      partner_fulfilled: {
        configured: false,
        partnerReference: null,
        publicUrl: null,
      },
      private_label: { configured: false, partnerReference: null, publicUrl: null },
    };

    await repository.update(
      "foundational",
      {
        label: "Foundational supplements in review",
        channelMetadata: channels,
      },
      "admin@example.com",
      "2026-07-25T12:00:00.000Z",
    );

    const publicRow = repository
      .listPublic()
      .find((row) => row.category === "foundational");
    expect(publicRow).toMatchObject({
      label: "Foundational supplements in review",
      status: "coming_soon",
      priceCents: null,
      brand: null,
      stockState: null,
      servingInstructions: null,
      channelMetadata: { affiliate: { configured: true } },
    });
    expect(JSON.stringify(publicRow)).not.toContain("partner-internal-1");
    expect(JSON.stringify(publicRow)).not.toContain("partner.example");
  });

  it("persists before reporting or mutating a successful update", async () => {
    const persist = vi.fn().mockRejectedValue(new Error("database unavailable"));
    const repository = new SupplementPlaceholderRepository(persist);

    await expect(
      repository.update(
        "performance",
        { label: "Updated performance category" },
        "admin@example.com",
        "2026-07-25T12:00:00.000Z",
      ),
    ).rejects.toThrow("database unavailable");

    expect(persist).toHaveBeenCalledOnce();
    expect(
      repository.listAdmin().find((row) => row.category === "performance")?.label,
    ).toBe("Performance supplements");
  });

  it("rejects unsafe public and channel configuration", async () => {
    const repository = new SupplementPlaceholderRepository();
    await expect(
      repository.update(
        "specialty",
        { launchInterestHref: "https://outside.example/collect" },
        "admin@example.com",
        "2026-07-25T12:00:00.000Z",
      ),
    ).rejects.toThrow("Research member area");
  });
});
