import { z } from "zod";
import type { SponsoredB2BPricingAuthority } from "./b2b-sponsored-claim";

const CatalogAuthoritySchema = z.object({
  schemaVersion: z.number().int().positive(),
  generatedAt: z.string().datetime({ offset: true }),
  counts: z.object({
    items: z.literal(420),
    priced: z.literal(418),
    pricePending: z.literal(2),
  }).strict(),
  priceProfiles: z.array(z.string()).refine(
    (profiles) => profiles.length === 1 && profiles[0] === "KRIS_VOLUME_PARTNER",
  ),
  priceOverlays: z.object({
    KRIS_VOLUME_PARTNER: z.record(z.string(), z.unknown()),
  }).passthrough(),
}).passthrough();

/**
 * Derive entitlement version/effective time from the accepted catalog artifact
 * rather than operator input. Version is the artifact schema version and the
 * effective instant is its generatedAt. The source commit is retained as
 * immutable audit evidence by the caller/handoff.
 */
export function resolveKrisVolumePartnerPricingAuthority(
  rawArtifact: unknown,
  sourceSha: string,
): SponsoredB2BPricingAuthority | null {
  if (!/^[a-f0-9]{40}$/.test(sourceSha)) return null;
  const parsed = CatalogAuthoritySchema.safeParse(rawArtifact);
  if (!parsed.success) return null;
  const overlayCount = Object.keys(parsed.data.priceOverlays.KRIS_VOLUME_PARTNER).length;
  if (overlayCount !== parsed.data.counts.items) return null;
  return {
    profileKey: "KRIS_VOLUME_PARTNER",
    profileVersion: parsed.data.schemaVersion,
    profileEffectiveAt: parsed.data.generatedAt,
    sourceSha,
  };
}
