import { describe, expect, it } from "vitest";
import { resolveKrisVolumePartnerPricingAuthority } from "./b2b-pricing-authority";

const SHA = "e7bc0b691ed813b5ce024f0026e8ab5ba64d74f4";

function artifact() {
  return {
    schemaVersion: 1,
    generatedAt: "2026-08-13T21:47:34.813Z",
    counts: { items: 420, priced: 418, pricePending: 2 },
    priceProfiles: ["KRIS_VOLUME_PARTNER"],
    priceOverlays: {
      KRIS_VOLUME_PARTNER: Object.fromEntries(
        Array.from({ length: 420 }, (_, index) => [
          `item-${index}`,
          { state: index < 418 ? "priced" : "pending" },
        ]),
      ),
    },
  };
}

describe("resolveKrisVolumePartnerPricingAuthority", () => {
  it("derives the immutable version/effective time from the accepted 420/418/2 artifact", () => {
    expect(resolveKrisVolumePartnerPricingAuthority(artifact(), SHA)).toEqual({
      profileKey: "KRIS_VOLUME_PARTNER",
      profileVersion: 1,
      profileEffectiveAt: "2026-08-13T21:47:34.813Z",
      sourceSha: SHA,
    });
  });

  it.each([
    [{ ...artifact(), schemaVersion: 0 }, SHA],
    [{ ...artifact(), counts: { items: 419, priced: 418, pricePending: 1 } }, SHA],
    [{ ...artifact(), priceProfiles: ["DEFAULT"] }, SHA],
    [{ ...artifact(), priceOverlays: { KRIS_VOLUME_PARTNER: {} } }, SHA],
    [{
      ...artifact(),
      priceOverlays: {
        KRIS_VOLUME_PARTNER: Object.fromEntries(
          Array.from({ length: 420 }, (_, index) => [`item-${index}`, { state: "priced" }]),
        ),
      },
    }, SHA],
    [artifact(), "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
    [artifact(), "not-a-sha"],
  ])("fails closed for a non-authoritative artifact", (raw, sha) => {
    expect(resolveKrisVolumePartnerPricingAuthority(raw, sha)).toBeNull();
  });
});
