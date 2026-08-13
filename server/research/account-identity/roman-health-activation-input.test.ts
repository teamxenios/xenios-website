import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SponsoredB2BClaimInputSchema } from "./b2b-sponsored-claim";

const packet = JSON.parse(fs.readFileSync(path.resolve(
  "supabase/pack02-candidates/roman_health_b2b_activation_input.json",
), "utf8"));

describe("founder-confirmed Roman Health activation input", () => {
  it("is accepted by the strict no-password B2B claim schema", () => {
    expect(SponsoredB2BClaimInputSchema.parse(packet.request)).toEqual({
      path: "new_sponsored_claim",
      email: "info@romanhealthcollective.com",
      firstName: "Kristopher",
      lastName: "Lopez",
      country: "USA",
      stateOrRegion: "Texas",
      businessKey: "roman-health",
      businessDisplayName: "Roman Health",
      roles: ["organization_owner", "business_buyer"],
    });
    expect(packet.passwordAcceptedOrStored).toBe(false);
    expect(JSON.stringify(packet)).not.toMatch(/"password"\s*:/i);
  });

  it("binds pricing resolution to the accepted catalog rather than operator input", () => {
    expect(packet.pricingAuthority).toEqual({
      profileKey: "KRIS_VOLUME_PARTNER",
      deriveFromAcceptedCatalog: true,
      acceptedCatalogSourceSha: "e7bc0b691ed813b5ce024f0026e8ab5ba64d74f4",
      requiredCounts: { items: 420, priced: 418, pricePending: 2 },
    });
    expect(packet.request).not.toHaveProperty("profileVersion");
    expect(packet.request).not.toHaveProperty("profileEffectiveAt");
  });
});
