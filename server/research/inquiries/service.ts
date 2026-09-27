import { createHash } from "node:crypto";
import type { LoiInput } from "../../supabase-store";
import {
  RESEARCH_INQUIRY_CONFIRMATIONS,
  RESEARCH_INQUIRY_STATUS,
  type ResearchInquiryAcceptedResponse,
  type ResearchInquiryConfirmationDelivery,
  type ResearchInquiryRequest,
  type ResearchInquiryType,
} from "@shared/research/inquiries";
import {
  PUBLIC_INQUIRY_BUSINESS_NAME,
  PUBLIC_INQUIRY_CLASSIFIER,
  PUBLIC_INQUIRY_ROLE_PREFIX,
  PUBLIC_INQUIRY_SCHEMA,
  isPublicInquiryOperationsRow,
  parsePublicInquiryPayload,
  type PublicInquiryPayload,
} from "./classifier";

const INQUIRY_SOURCE_PATHS: Readonly<Record<ResearchInquiryType, string>> =
  Object.freeze({
    practice: "/practices",
    partner_interest: "/partners",
    strategic: "/partners#strategic",
    supplier: "/suppliers",
    career_interest: "/careers",
  });

export type DurableInquiryRecord = LoiInput &
  Readonly<{
    id: string;
    status: typeof RESEARCH_INQUIRY_STATUS;
  }>;

export type DurableInquiryReceipt = Readonly<{
  id: string;
  createdAt: string;
  replayed: boolean;
}>;

export type ResearchInquiryDependencies = Readonly<{
  persistenceReady(): boolean | Promise<boolean>;
  allowRequest(ip: string): Promise<boolean>;
  verifyHuman(token: string | undefined, ip: string): Promise<boolean>;
  persist(record: DurableInquiryRecord): Promise<DurableInquiryReceipt>;
  notify(record: DurableInquiryRecord): Promise<Readonly<{
    customer: ResearchInquiryConfirmationDelivery;
    operator: ResearchInquiryConfirmationDelivery;
  }>>;
  now?: () => Date;
}>;

function normalizedInline(value: string | undefined): string | null {
  return value === undefined ? null : value.trim().replace(/\s+/gu, " ");
}

function normalizedMessage(value: string | undefined): string | null {
  if (value === undefined) return null;
  return value
    .replace(/\r\n?/gu, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

export function normalizeResearchInquiry(
  input: ResearchInquiryRequest,
): ResearchInquiryRequest {
  return {
    inquiryType: input.inquiryType,
    fullName: normalizedInline(input.fullName)!,
    email: input.email.trim().toLowerCase(),
    ...(normalizedInline(input.phone) === null
      ? {}
      : { phone: normalizedInline(input.phone)! }),
    ...(normalizedInline(input.organizationName) === null
      ? {}
      : { organizationName: normalizedInline(input.organizationName)! }),
    ...(normalizedInline(input.organizationKind) === null
      ? {}
      : { organizationKind: normalizedInline(input.organizationKind)! }),
    ...(normalizedInline(input.role) === null
      ? {}
      : { role: normalizedInline(input.role)! }),
    ...(normalizedInline(input.region) === null
      ? {}
      : { region: normalizedInline(input.region)! }),
    ...(input.interest === undefined ? {} : { interest: input.interest }),
    ...(input.documentationAvailable === undefined
      ? {}
      : { documentationAvailable: input.documentationAvailable }),
    ...(normalizedMessage(input.message) === null
      ? {}
      : { message: normalizedMessage(input.message)! }),
    ...(normalizedInline(input.organizationWebsite) === null
      ? {}
      : { organizationWebsite: normalizedInline(input.organizationWebsite)! }),
    ...(input.website === undefined ? {} : { website: input.website }),
    ...(input.turnstileToken === undefined
      ? {}
      : { turnstileToken: input.turnstileToken }),
  };
}

function canonicalContent(input: ResearchInquiryRequest): string {
  return JSON.stringify({
    inquiryType: input.inquiryType,
    fullName: input.fullName,
    email: input.email,
    phone: input.phone ?? null,
    organizationName: input.organizationName ?? null,
    organizationKind: input.organizationKind ?? null,
    role: input.role ?? null,
    region: input.region ?? null,
    interest: input.interest ?? null,
    documentationAvailable: input.documentationAvailable ?? null,
    message: input.message ?? null,
    organizationWebsite: input.organizationWebsite ?? null,
  });
}

export function researchInquiryContentHash(input: ResearchInquiryRequest): string {
  return createHash("sha256").update(canonicalContent(input), "utf8").digest("hex");
}

export function deterministicInquiryId(contentHash: string): string {
  const bytes = createHash("sha256")
    .update(`${PUBLIC_INQUIRY_SCHEMA}:${contentHash}`, "utf8")
    .digest()
    .subarray(0, 16);
  // RFC 9562 UUIDv8: application-defined deterministic payload plus RFC variant.
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function researchInquiryReference(id: string): string {
  const compact = id.replace(/[^a-f0-9]/giu, "").toUpperCase();
  if (compact.length < 8) throw new Error("Inquiry record id is invalid");
  return `INQ-${compact.slice(0, 8)}`;
}

export function buildDurableInquiryRecord(
  request: ResearchInquiryRequest,
  context: Readonly<{ ip: string; recordedAt: string }>,
): DurableInquiryRecord {
  const normalized = normalizeResearchInquiry(request);
  const contentHash = researchInquiryContentHash(normalized);
  const payload: PublicInquiryPayload = {
    schema: PUBLIC_INQUIRY_SCHEMA,
    classifier: PUBLIC_INQUIRY_CLASSIFIER,
    inquiryType: normalized.inquiryType,
    contentHash,
    recordedAt: context.recordedAt,
    updatedAt: context.recordedAt,
    organization: {
      name: normalized.organizationName ?? null,
      kind: normalized.organizationKind ?? null,
      website: normalized.organizationWebsite ?? null,
      region: normalized.region ?? null,
    },
    contactRole: normalized.role ?? null,
    interest: normalized.interest ?? null,
    documentationAvailable: normalized.documentationAvailable ?? null,
    message: normalized.message ?? null,
    // Persistence is deliberately first. The deterministic outbox jobs are
    // requested only after this record exists, so this durable fact describes
    // the handoff state without ever claiming that an email was sent.
    notification: { customer: "outbox_pending", operator: "outbox_pending" },
  };
  const sourcePath = INQUIRY_SOURCE_PATHS[normalized.inquiryType];
  const record: DurableInquiryRecord = {
    id: deterministicInquiryId(contentHash),
    status: RESEARCH_INQUIRY_STATUS,
    name: normalized.fullName,
    email: normalized.email,
    phone: normalized.phone ?? null,
    business_name: PUBLIC_INQUIRY_BUSINESS_NAME,
    role: `${PUBLIC_INQUIRY_ROLE_PREFIX}${normalized.inquiryType}`,
    url_or_handle: normalized.organizationWebsite ?? null,
    client_count: null,
    why_interested: JSON.stringify(payload),
    nonbinding_ack: true,
    source_page: sourcePath,
    landing_page: sourcePath,
    referrer_url: null,
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    utm_content: null,
    utm_term: null,
    ip: context.ip,
  };
  if (!isPublicInquiryOperationsRow(record)) {
    throw new Error("Inquiry classifier invariant failed");
  }
  return record;
}

export function inquiryRecordMatchesContent(
  record: Pick<LoiInput, "why_interested">,
  contentHash: string,
): boolean {
  return parsePublicInquiryPayload(record.why_interested)?.contentHash === contentHash;
}

export function researchInquiryAcceptedResponse(
  input: Readonly<{
    record: DurableInquiryRecord;
    replayed: boolean;
    confirmationDelivery: ResearchInquiryConfirmationDelivery;
  }>,
): ResearchInquiryAcceptedResponse {
  const payload = parsePublicInquiryPayload(input.record.why_interested);
  if (!payload) throw new Error("Inquiry record payload is invalid");
  return {
    ok: true,
    accepted: true,
    replayed: input.replayed,
    reference: researchInquiryReference(input.record.id),
    status: RESEARCH_INQUIRY_STATUS,
    inquiryType: payload.inquiryType,
    confirmation: RESEARCH_INQUIRY_CONFIRMATIONS[payload.inquiryType],
    confirmationDelivery: input.confirmationDelivery,
  };
}
