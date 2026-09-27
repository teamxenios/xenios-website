import type { LoiInput, LoiRow } from "../../supabase-store";
import { isCareManualAccessOperationsRow } from "../../care/manual-access-classifier";
import {
  RESEARCH_INQUIRY_TYPES,
  type ResearchInquiryType,
} from "@shared/research/inquiries";

export const PUBLIC_INQUIRY_SCHEMA = "xenios_public_inquiry_v1";
export const PUBLIC_INQUIRY_CLASSIFIER = "xenios_non_care_public_inquiry";
export const PUBLIC_INQUIRY_BUSINESS_NAME = "Xenios public inquiry";
export const PUBLIC_INQUIRY_ROLE_PREFIX = "xenios_inquiry:";

export type PublicInquiryPayload = Readonly<{
  schema: typeof PUBLIC_INQUIRY_SCHEMA;
  classifier: typeof PUBLIC_INQUIRY_CLASSIFIER;
  inquiryType: ResearchInquiryType;
  contentHash: string;
  recordedAt: string;
  updatedAt: string;
  organization: Readonly<{
    name: string | null;
    kind: string | null;
    website: string | null;
    region: string | null;
  }>;
  contactRole: string | null;
  interest: string | null;
  documentationAvailable: boolean | null;
  message: string | null;
  notification: Readonly<{
    customer: "outbox_pending";
    operator: "outbox_pending";
  }>;
}>;

export function parsePublicInquiryPayload(
  value: string | null | undefined,
): PublicInquiryPayload | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    const record = parsed as Record<string, unknown>;
    if (
      record.schema !== PUBLIC_INQUIRY_SCHEMA ||
      record.classifier !== PUBLIC_INQUIRY_CLASSIFIER ||
      typeof record.inquiryType !== "string" ||
      !RESEARCH_INQUIRY_TYPES.includes(record.inquiryType as ResearchInquiryType) ||
      typeof record.contentHash !== "string" ||
      typeof record.recordedAt !== "string" ||
      typeof record.updatedAt !== "string"
    ) {
      return null;
    }
    return parsed as PublicInquiryPayload;
  } catch {
    return null;
  }
}

/**
 * A public business inquiry is deliberately disjoint from Care. If historical
 * corruption ever gives one row both marker families, Care wins and this
 * projection refuses to create a second operational authority for it.
 */
export function isPublicInquiryOperationsRow(
  row: LoiRow | (LoiInput & { id?: string; status?: string; created_at?: string }),
): boolean {
  if (isCareManualAccessOperationsRow(row as LoiRow)) return false;
  const payload = parsePublicInquiryPayload(row.why_interested);
  return (
    row.business_name === PUBLIC_INQUIRY_BUSINESS_NAME ||
    row.role?.startsWith(PUBLIC_INQUIRY_ROLE_PREFIX) === true ||
    payload !== null
  );
}
