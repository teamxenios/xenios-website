import type {
  MediaApprovalState,
  MediaRightsState,
  SourceMatchState,
} from "../official-sources/contracts";

export const PUBLICATION_RIGHTS_STATES = new Set<MediaRightsState>([
  "SUPPLIER_PROVIDED_APPROVED",
  "BRAND_MEDIA_PORTAL_APPROVED",
  "AUTHORIZED_RESELLER_USE",
  "WRITTEN_PERMISSION_APPROVED",
  "ORIGINAL_XENIOS_RENDER",
]);

export function rightsAllowIngestion(status: MediaRightsState): boolean {
  return PUBLICATION_RIGHTS_STATES.has(status);
}

export function rightsAllowPublication(status: MediaRightsState): boolean {
  return PUBLICATION_RIGHTS_STATES.has(status);
}

export function deriveApprovalState(
  matchState: SourceMatchState,
  rightsState: MediaRightsState,
): MediaApprovalState {
  if (rightsState === "DO_NOT_USE") return "DO_NOT_USE";
  if (matchState === "NO_MATCH") return "PENDING_SOURCE";
  if (matchState === "CONFLICT") return "REJECTED";
  if (!rightsAllowIngestion(rightsState)) return "RIGHTS_PENDING";
  return "AWAITING_REVIEW";
}

export function mayLinkPublicAsset(input: {
  approvalStatus: MediaApprovalState;
  rightsStatus: MediaRightsState;
  matchState: SourceMatchState;
  exactVariantId: string | null;
  sourceUrl: string | null;
}): boolean {
  return (
    input.approvalStatus === "APPROVED" &&
    rightsAllowPublication(input.rightsStatus) &&
    input.matchState === "EXACT_MATCH" &&
    Boolean(input.exactVariantId?.trim()) &&
    Boolean(input.sourceUrl?.trim())
  );
}
