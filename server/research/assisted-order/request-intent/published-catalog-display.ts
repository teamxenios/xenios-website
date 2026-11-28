import { z } from "zod";
import type { ReviewedProductContent, ReviewedProductMedia } from "../../../../shared/research/master-offerings/approved-content";

const uuid = z.string().regex(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/)
  .refine(value => value !== "00000000-0000-0000-0000-000000000000");
const digest = z.string().regex(/^[0-9a-f]{64}$/);
const publicText = (limit: number) => z.string().min(1).max(limit)
  .refine(value => value === value.trim() && !/[\u0000-\u0008\u000b-\u001f\u007f]/.test(value))
  .refine(value => !/[$€£¥]|\b(?:USD|EUR|GBP)\s*\d|\bprice\s*:/i.test(value));
const subject = z.object({
  offeringId: z.string().regex(/^mo_[0-9a-f]+$/),
  offeringVariantId: z.string().regex(/^mov_[0-9a-f]+$/),
  productId: uuid,
  variantId: uuid,
}).strict();

export type PublicationSubject = z.infer<typeof subject>;
export type CatalogPublicationPilot = Readonly<{
  selected: Readonly<PublicationSubject>;
  readPublishedRevision(identity: Readonly<PublicationSubject>): Promise<unknown>;
}>;

const revision = z.object({
  revisionId: uuid,
  generation: z.number().int().safe().positive(),
  identity: subject,
  content: z.object({
    summary: publicText(20000), overview: publicText(20000), storage: publicText(20000).optional(),
  }).strict(),
  media: z.object({
    primary: z.object({
      href: z.string().max(160), altText: publicText(1000),
      width: z.number().int().positive().max(20000), height: z.number().int().positive().max(20000),
    }).strict(),
    representation: z.enum(["catalog_reference", "proposed_carton", "proposed_vial"]),
    packagingDesign: z.boolean(),
  }).strict(),
  provenance: z.object({
    contentSha256: digest, mediaSha256: digest, rightsApprovalSha256: digest,
  }).strict(),
}).strict();

function sameSubject(a: Readonly<PublicationSubject>, b: Readonly<PublicationSubject>): boolean {
  return a.productId === b.productId && a.variantId === b.variantId
    && a.offeringId === b.offeringId && a.offeringVariantId === b.offeringVariantId;
}

/** Only the server-owned reader can establish current publication and rights. The client receives display fields alone. */
export async function readPilotDisplay(pilot: CatalogPublicationPilot, identity: PublicationSubject):
Promise<{ content: ReviewedProductContent; media: ReviewedProductMedia } | null> {
  if (!sameSubject(pilot.selected, identity) || !subject.safeParse(identity).success) return null;
  try {
    const parsed = revision.safeParse(await pilot.readPublishedRevision(identity));
    if (!parsed.success || !sameSubject(parsed.data.identity, identity)) return null;
    const { revisionId, content, media } = parsed.data;
    const prefix = "/api/research/catalog-media/" + revisionId + "/";
    const href = media.primary.href;
    if (!href.startsWith(prefix) || !uuid.safeParse(href.slice(prefix.length)).success) return null;
    return { content, media };
  } catch {
    // Read failures retain the version-pinned reviewed catalog on this request.
    return null;
  }
}
