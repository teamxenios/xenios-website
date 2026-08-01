import type { CareRecordId } from "./contracts";

/**
 * The five patient service surfaces that were declared in
 * `CARE_ROUTE_CONTRACTS` with no handler registered anywhere:
 * instructions, supplies, messages, support, and discovery.
 *
 * A declared contract with no route is worse than a missing feature. The
 * caller trusts the contract, receives a 404, and the shared response envelope
 * renders that as a permanent outage rather than as something that was never
 * built. This file gives those five surfaces an honest domain model, and the
 * routes that use it give them a handler.
 *
 * Four rules shape everything here.
 *
 * 1. A read never answers with an empty list when the record that would hold
 *    the data does not exist. `CareServiceStorageState.missingTables` names
 *    what is absent so "you have none" is never confused with "nothing can be
 *    stored".
 * 2. A write is either persisted or it fails loudly with the reason named.
 *    There is no path where a patient is told a message or a support request
 *    was received when nothing holds it.
 * 3. Care transmits nothing. There is no outbound transport anywhere in
 *    `server/care`, so a recorded message is a record of intent and must be
 *    described that way wherever a person can read it.
 * 4. These projections carry no clinical values, no message or request body
 *    text, no address, and no carrier tracking identifier. They describe that a
 *    record exists and what state it is in, nothing more.
 */

/**
 * Whether the records behind a read actually exist.
 *
 * Named distinctly from any other storage-state type in `shared/care` so the
 * two can never be confused for one another if they are ever imported side by
 * side.
 */
export interface CareServiceStorageState {
  available: boolean;
  missingTables: readonly string[];
}

export const CARE_SERVICE_STORAGE_AVAILABLE: CareServiceStorageState = {
  available: true,
  missingTables: [],
};

export function careServiceStorageMissing(
  tables: readonly string[],
): CareServiceStorageState {
  return { available: false, missingTables: [...tables] };
}

/**
 * Care sends nothing. This is a statement about the code, not a policy that
 * could drift: `server/care` contains no mail, SMS, push, or webhook client of
 * any kind. Anything a patient writes is held for a person to read later.
 */
export const CARE_TRANSMISSION_STATE = "not_enabled" as const;

export const CARE_TRANSMISSION_NOTICE =
  "Care does not send anything to you or to anyone else. What you write here is recorded for a person to read, and no notification, email, or text message is sent about it.";

/* -------------------------------------------------------------------------- */
/* Instructions                                                                */
/* -------------------------------------------------------------------------- */

export const CARE_INSTRUCTION_CATEGORIES = [
  "medication_use",
  "appointment_preparation",
  "self_monitoring",
  "safety",
  "administrative",
] as const;

export type CareInstructionCategory =
  (typeof CARE_INSTRUCTION_CATEGORIES)[number];

export const CARE_INSTRUCTION_STORAGE_TABLES = [
  "care_patient_instructions",
] as const;

export interface CareInstructionRecord {
  id: CareRecordId;
  patientId: CareRecordId;
  prescriptionId: CareRecordId | null;
  title: string;
  category: CareInstructionCategory;
  version: string;
  /** Set only when a named clinician published this to the patient. */
  publishedAt: string | null;
  publishedByUserId: string | null;
  acknowledgedAt: string | null;
  bodyRecorded: boolean;
  updatedAt: string;
}

export interface CareInstructionItem {
  id: CareRecordId;
  title: string;
  category: CareInstructionCategory;
  version: string;
  publishedAt: string;
  acknowledgedAt: string | null;
  bodyAvailable: boolean;
}

/**
 * A clinical instruction reaches a patient only after a named clinician
 * published it. An unpublished draft is a work in progress, and reading one as
 * guidance would be reading something nobody stood behind.
 */
export function isCareInstructionPublished(
  record: CareInstructionRecord,
): boolean {
  return Boolean(record.publishedAt) && Boolean(record.publishedByUserId);
}

export function toCareInstructionItem(
  record: CareInstructionRecord,
): CareInstructionItem {
  return {
    id: record.id,
    title: record.title,
    category: record.category,
    version: record.version,
    publishedAt: record.publishedAt as string,
    acknowledgedAt: record.acknowledgedAt,
    bodyAvailable: record.bodyRecorded,
  };
}

/**
 * The publication gate, applied to whatever the repository returned. A query
 * mistake that hands over an unpublished draft cannot disclose it.
 */
export function selectCareInstructionsForPatient(
  records: readonly CareInstructionRecord[],
): readonly CareInstructionItem[] {
  return records.filter(isCareInstructionPublished).map(toCareInstructionItem);
}

export function countCareInstructionsAwaitingPublication(
  records: readonly CareInstructionRecord[],
): number {
  return records.filter((record) => !isCareInstructionPublished(record)).length;
}

/* -------------------------------------------------------------------------- */
/* Supplies                                                                    */
/* -------------------------------------------------------------------------- */

export const CARE_SUPPLY_SHIPMENT_STATUSES = [
  "requested",
  "packed",
  "shipped",
  "delivered",
  "cancelled",
] as const;

export type CareSupplyShipmentStatus =
  (typeof CARE_SUPPLY_SHIPMENT_STATUSES)[number];

export const CARE_SUPPLY_STORAGE_TABLES = ["care_supply_shipments"] as const;

export interface CareSupplyShipmentRecord {
  id: CareRecordId;
  patientId: CareRecordId;
  pharmacyOrderId: CareRecordId | null;
  status: CareSupplyShipmentStatus;
  itemCount: number;
  carrierName: string | null;
  trackingRecorded: boolean;
  shippedAt: string | null;
  deliveredAt: string | null;
  updatedAt: string;
}

export interface CareSupplyShipmentItem {
  id: CareRecordId;
  status: CareSupplyShipmentStatus;
  itemCount: number;
  carrierName: string | null;
  /**
   * Whether a tracking identifier exists on the record. The identifier itself
   * is never projected, and one is never synthesized when it is absent.
   */
  trackingAvailable: boolean;
  shippedAt: string | null;
  deliveredAt: string | null;
  updatedAt: string;
}

/**
 * Shipment state comes from the stored row and nowhere else. A shipment is
 * never reported as shipped or delivered because a timestamp happened to be
 * present, and a missing timestamp is never filled in.
 */
export function toCareSupplyShipmentItem(
  record: CareSupplyShipmentRecord,
): CareSupplyShipmentItem {
  return {
    id: record.id,
    status: record.status,
    itemCount: record.itemCount,
    carrierName: record.carrierName,
    trackingAvailable: record.trackingRecorded,
    shippedAt: record.status === "shipped" || record.status === "delivered"
      ? record.shippedAt
      : null,
    deliveredAt: record.status === "delivered" ? record.deliveredAt : null,
    updatedAt: record.updatedAt,
  };
}

/* -------------------------------------------------------------------------- */
/* Messages                                                                    */
/* -------------------------------------------------------------------------- */

export const CARE_MESSAGE_THREAD_STATUSES = [
  "open",
  "awaiting_patient",
  "awaiting_clinician",
  "closed",
] as const;

export type CareMessageThreadStatus =
  (typeof CARE_MESSAGE_THREAD_STATUSES)[number];

export const CARE_MESSAGE_STORAGE_TABLES = [
  "care_message_threads",
  "care_messages",
] as const;

export interface CareMessageThreadRecord {
  id: CareRecordId;
  patientId: CareRecordId;
  assignedClinicianUserId: string | null;
  subject: string;
  status: CareMessageThreadStatus;
  messageCount: number;
  lastMessageAt: string | null;
  lastMessageFrom: "patient" | "clinician" | null;
  createdAt: string;
  updatedAt: string;
}

export interface CareMessageThreadItem {
  id: CareRecordId;
  subject: string;
  status: CareMessageThreadStatus;
  messageCount: number;
  /**
   * Whether a clinician is assigned to read this thread. The clinician is never
   * named here, because naming a person implies they are on duty for it.
   */
  clinicianAssigned: boolean;
  lastMessageAt: string | null;
  lastMessageFrom: "patient" | "clinician" | null;
  updatedAt: string;
}

export interface CareMessageRecord {
  id: CareRecordId;
  threadId: CareRecordId;
  patientId: CareRecordId;
  authorRole: "patient" | "clinician";
  bodyRecorded: boolean;
  /**
   * Always the not-enabled state. It is stored on the record so a message
   * written today cannot later be mistaken for one that was delivered.
   */
  transmission: typeof CARE_TRANSMISSION_STATE;
  recordedAt: string;
}

export interface CareMessageReceipt {
  id: CareRecordId;
  threadId: CareRecordId;
  recordedAt: string;
  transmission: typeof CARE_TRANSMISSION_STATE;
  notice: string;
}

export function toCareMessageThreadItem(
  record: CareMessageThreadRecord,
): CareMessageThreadItem {
  return {
    id: record.id,
    subject: record.subject,
    status: record.status,
    messageCount: record.messageCount,
    clinicianAssigned: Boolean(record.assignedClinicianUserId),
    lastMessageAt: record.lastMessageAt,
    lastMessageFrom: record.lastMessageFrom,
    updatedAt: record.updatedAt,
  };
}

export function toCareMessageReceipt(
  record: CareMessageRecord,
): CareMessageReceipt {
  return {
    id: record.id,
    threadId: record.threadId,
    recordedAt: record.recordedAt,
    transmission: CARE_TRANSMISSION_STATE,
    notice: CARE_TRANSMISSION_NOTICE,
  };
}

/* -------------------------------------------------------------------------- */
/* Support                                                                     */
/* -------------------------------------------------------------------------- */

export const CARE_SUPPORT_TOPICS = [
  "account",
  "billing",
  "scheduling",
  "technical",
  "other",
] as const;

export type CareSupportTopic = (typeof CARE_SUPPORT_TOPICS)[number];

export const CARE_SUPPORT_REQUEST_STATUSES = [
  "received",
  "in_progress",
  "resolved",
  "closed",
] as const;

export type CareSupportRequestStatus =
  (typeof CARE_SUPPORT_REQUEST_STATUSES)[number];

export const CARE_SUPPORT_STORAGE_TABLES = ["care_support_requests"] as const;

/**
 * Support is not a clinical channel, and saying so is part of the surface
 * rather than a note somewhere else. A clinical question routed to support
 * would sit unread by anyone qualified to answer it.
 */
export const CARE_SUPPORT_SCOPE_NOTICE =
  "Support handles account, billing, scheduling, and technical questions. It is not a clinical channel, nobody clinical reads it, and it must not be used for a medical question or an urgent problem.";

export interface CareSupportRequestRecord {
  id: CareRecordId;
  patientId: CareRecordId;
  topic: CareSupportTopic;
  status: CareSupportRequestStatus;
  bodyRecorded: boolean;
  /** Set only when a named person took the request. Never inferred. */
  assignedToUserId: string | null;
  recordedAt: string;
  resolvedAt: string | null;
  updatedAt: string;
}

export interface CareSupportRequestItem {
  id: CareRecordId;
  topic: CareSupportTopic;
  status: CareSupportRequestStatus;
  /**
   * Whether a named person has taken this request. False means nobody has, and
   * that is reported rather than softened into "we are looking into it".
   */
  assigned: boolean;
  recordedAt: string;
  resolvedAt: string | null;
  updatedAt: string;
}

export interface CareSupportRequestReceipt {
  id: CareRecordId;
  status: CareSupportRequestStatus;
  recordedAt: string;
  assigned: boolean;
  transmission: typeof CARE_TRANSMISSION_STATE;
  notice: string;
}

export function toCareSupportRequestItem(
  record: CareSupportRequestRecord,
): CareSupportRequestItem {
  return {
    id: record.id,
    topic: record.topic,
    status: record.status,
    assigned: Boolean(record.assignedToUserId),
    recordedAt: record.recordedAt,
    resolvedAt: record.status === "resolved" ? record.resolvedAt : null,
    updatedAt: record.updatedAt,
  };
}

export function toCareSupportRequestReceipt(
  record: CareSupportRequestRecord,
): CareSupportRequestReceipt {
  return {
    id: record.id,
    status: record.status,
    recordedAt: record.recordedAt,
    assigned: Boolean(record.assignedToUserId),
    transmission: CARE_TRANSMISSION_STATE,
    notice: CARE_TRANSMISSION_NOTICE,
  };
}

/* -------------------------------------------------------------------------- */
/* Discovery                                                                   */
/* -------------------------------------------------------------------------- */

export const CARE_DISCOVERY_STORAGE_TABLES = ["care_discovery_events"] as const;

/**
 * The Research-to-Care discovery surface.
 *
 * `ResearchToCareDiscovery` in `contracts.ts` carries a `subjectId` and a
 * `consentedAt`, so the record it describes is subject-scoped and consent
 * bearing. Two things do not exist for it: a table to hold a discovery event,
 * and any way to resolve a Research subject into a principal. `CarePrincipal`
 * resolution answers with Care roles, and a Research subject who has not become
 * a patient holds none of them, so guarding this read with `care:read_self`
 * would deny exactly the person it is for.
 *
 * So this read is deliberately public and deliberately carries no subject data
 * at all. It reports the same capability state `/api/care/status` already makes
 * public, states the one intent the contract permits, and names what is missing
 * before a discovery event could be recorded. It never accepts, reflects, or
 * stores a subject identifier. Recording a discovery event stays unbuilt rather
 * than guessing at a cross-rail identity model.
 */
export interface CareDiscoveryAvailability {
  intent: "learn_about_care";
  sourceRail: "research";
  destinationRail: "care";
  /** True only when a discovery event could actually be recorded. */
  recordingAvailable: boolean;
  /** True only when a Research subject could be resolved to a principal. */
  subjectResolutionAvailable: boolean;
  storage: CareServiceStorageState;
  reason: string;
}

export const CARE_DISCOVERY_UNAVAILABLE_REASON =
  "Care can be read about here, and nothing about a visit to this page is recorded. Recording an interest in Care is not built: there is no store for it, and no way to connect a Research account to a Care record.";

export function careDiscoveryAvailability(): CareDiscoveryAvailability {
  return {
    intent: "learn_about_care",
    sourceRail: "research",
    destinationRail: "care",
    recordingAvailable: false,
    subjectResolutionAvailable: false,
    storage: careServiceStorageMissing(CARE_DISCOVERY_STORAGE_TABLES),
    reason: CARE_DISCOVERY_UNAVAILABLE_REASON,
  };
}
