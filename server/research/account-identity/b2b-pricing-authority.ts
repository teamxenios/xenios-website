import { z } from "zod";
import {
  ACCEPTED_KRIS_VOLUME_PARTNER_CATALOG_SHA,
  type SponsoredB2BPricingAuthority,
} from "./b2b-sponsored-claim";

const OverlayEntrySchema = z.object({
  state: z.enum(["priced", "pending"]),
}).passthrough();

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
    KRIS_VOLUME_PARTNER: z.record(z.string(), OverlayEntrySchema),
  }).passthrough(),
}).passthrough();

/**
 * Derive entitlement version/effective time from the accepted catalog artifact
 * rather than operator input. Version is the artifact schema version and the
 * effective instant is its generatedAt. Only the explicitly accepted catalog
 * commit can authorize this entitlement; its SHA is persisted with the claim.
 */
export function resolveKrisVolumePartnerPricingAuthority(
  rawArtifact: unknown,
  sourceSha: string,
): SponsoredB2BPricingAuthority | null {
  if (sourceSha !== ACCEPTED_KRIS_VOLUME_PARTNER_CATALOG_SHA) return null;
  const parsed = CatalogAuthoritySchema.safeParse(rawArtifact);
  if (!parsed.success) return null;
  const overlay = Object.values(parsed.data.priceOverlays.KRIS_VOLUME_PARTNER);
  const priced = overlay.filter((entry) => entry.state === "priced").length;
  const pending = overlay.filter((entry) => entry.state === "pending").length;
  if (
    overlay.length !== parsed.data.counts.items
    || priced !== parsed.data.counts.priced
    || pending !== parsed.data.counts.pricePending
  ) return null;
  return {
    profileKey: "KRIS_VOLUME_PARTNER",
    profileVersion: parsed.data.schemaVersion,
    profileEffectiveAt: parsed.data.generatedAt,
    sourceSha,
  };
}
