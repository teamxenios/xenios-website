import type {
  MediaApprovalState,
  RightsEvidence,
  SourceMatchState,
} from "../official-sources/contracts";

export const PUBLICATION_RIGHTS_STATES = new Set<RightsEvidence["status"]>([
  "SUPPLIER_PROVIDED_APPROVED",
  "BRAND_MEDIA_PORTAL_APPROVED",
  "AUTHORIZED_RESELLER_USE",
  "WRITTEN_PERMISSION_APPROVED",
  "ORIGINAL_XENIOS_RENDER",
]);

const ISO_DATE_OR_UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)?$/;
const PUBLICATION_COMPATIBLE_LIMITATIONS = new Set([
  "current exact packaging only",
  "exact current product packaging only",
]);

function normalizedLimitation(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[.;:,!?]+$/g, "")
    .replace(/\s+/g, " ");
}

function evidenceTime(value: string | null): number | null {
  if (!value || !ISO_DATE_OR_UTC_TIMESTAMP.test(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function evaluationTime(at: Date | string | number): number {
  const parsed = at instanceof Date ? at.getTime() : typeof at === "number" ? at : Date.parse(at);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

export interface RightsEvidenceValidation {
  valid: boolean;
  reasons: string[];
}

export function validateRightsEvidence(
  evidence: RightsEvidence,
  at: Date | string | number = new Date(),
): RightsEvidenceValidation {
  if (!PUBLICATION_RIGHTS_STATES.has(evidence.status)) {
    return { valid: false, reasons: ["rights status is not approved for publication"] };
  }

  const reasons: string[] = [];
  if (!evidence.evidenceReference?.trim()) reasons.push("rights evidence reference is required");
  if (!evidence.grantedBy?.trim()) reasons.push("rights grantor is required");
  const permissionAt = evidenceTime(evidence.permissionDate);
  const now = evaluationTime(at);
  if (permissionAt === null) reasons.push("permission date must be an ISO date or UTC timestamp");
  else if (permissionAt > now) reasons.push("permission date cannot be in the future");

  if (evidence.expiresAt !== null) {
    const expiresAt = evidenceTime(evidence.expiresAt);
    if (expiresAt === null) reasons.push("rights expiration must be an ISO date or UTC timestamp");
    else if (expiresAt <= now) reasons.push("rights evidence is expired");
    else if (permissionAt !== null && expiresAt <= permissionAt) {
      reasons.push("rights expiration must be after the permission date");
    }
  }

  const limitations = evidence.limitations?.trim() ?? "";
  if (
    limitations !== "" &&
    !PUBLICATION_COMPATIBLE_LIMITATIONS.has(normalizedLimitation(limitations))
  ) {
    reasons.push("rights limitations are not explicitly approved for public use");
  }
  return { valid: reasons.length === 0, reasons };
}

export function rightsAllowIngestion(
  evidence: RightsEvidence,
  at: Date | string | number = new Date(),
): boolean {
  return validateRightsEvidence(evidence, at).valid;
}

export function rightsAllowPublication(
  evidence: RightsEvidence,
  at: Date | string | number = new Date(),
): boolean {
  return validateRightsEvidence(evidence, at).valid;
}

export function deriveApprovalState(
  matchState: SourceMatchState,
  rights: RightsEvidence,
  at: Date | string | number = new Date(),
): MediaApprovalState {
  if (rights.status === "DO_NOT_USE") return "DO_NOT_USE";
  if (matchState === "NO_MATCH") return "PENDING_SOURCE";
  if (matchState === "CONFLICT") return "REJECTED";
  if (!rightsAllowIngestion(rights, at)) return "RIGHTS_PENDING";
  return "AWAITING_REVIEW";
}

export function mayLinkPublicAsset(input: {
  approvalStatus: MediaApprovalState;
  rights: RightsEvidence;
  matchState: SourceMatchState;
  exactVariantId: string | null;
  sourceUrl: string | null;
  at?: Date | string | number;
}): boolean {
  return (
    input.approvalStatus === "APPROVED" &&
    rightsAllowPublication(input.rights, input.at) &&
    input.matchState === "EXACT_MATCH" &&
    Boolean(input.exactVariantId?.trim()) &&
    Boolean(input.sourceUrl?.trim())
  );
}
