import { createHash, createHmac } from "node:crypto";

import {
  assistedOrderDocumentSides,
  assistedOrderDocumentTypes,
  assistedOrderStatuses,
  assistedOrderWorkflowModes,
  type AssistedOrderStatus,
  type AssistedOrderWorkflowMode,
} from "../../../shared/research/assisted-order/contract";
import type {
  AssistedOrderAuditEvent,
  AssistedOrderAuditSink,
  AssistedOrderStatusAuthorityEvidenceKind,
} from "./ports";
import type { SupabaseRpcClient } from "./supabase-repository";

export const ASSISTED_ORDER_AUDIT_ENABLED_ENV_VAR =
  "RESEARCH_ASSISTED_ORDER_AUDIT_ENABLED";
export const ASSISTED_ORDER_AUDIT_SCHEMA_ENV_VAR =
  "RESEARCH_ASSISTED_ORDER_AUDIT_SCHEMA_VERSION";
export const ASSISTED_ORDER_AUDIT_ATTESTATION_ENV_VAR =
  "RESEARCH_ASSISTED_ORDER_AUDIT_ATTESTATION";
export const ASSISTED_ORDER_AUDIT_ACTOR_KEY_ID_ENV_VAR =
  "RESEARCH_ASSISTED_ORDER_AUDIT_ACTOR_KEY_ID";
export const ASSISTED_ORDER_AUDIT_ACTOR_HMAC_KEY_ENV_VAR =
  "RESEARCH_ASSISTED_ORDER_AUDIT_ACTOR_HMAC_KEY_B64URL";

export const ASSISTED_ORDER_AUDIT_SCHEMA_VERSION =
  "research_assisted_order_audit_v1" as const;
export const ASSISTED_ORDER_AUDIT_ATTESTATION =
  "research_assisted_order_audit_v1@sha256:0b58c26c239b7eb5c562e0c3b2db32a2cf71aa0704a520f4f90046a3a8bd2694" as const;
export const ASSISTED_ORDER_AUDIT_AUTHORITY_RPC =
  "research_assisted_order_audit_authority" as const;
export const ASSISTED_ORDER_AUDIT_APPEND_RPC =
  "research_assisted_order_audit_append" as const;

export const assistedOrderAuditEventTypes = Object.freeze([
  "assisted_order.submitted",
  "assisted_order.status_changed",
  "assisted_order.document_upload_authorized",
  "assisted_order.document_upload_completion_authorized",
  "assisted_order.document_download_authorized",
] as const);

export const assistedOrderAuditActorTypes = Object.freeze([
  "member",
  "early_access_session",
  "admin",
  "system",
] as const);

export const assistedOrderStatusAuthorityEvidenceKinds = Object.freeze([
  "agreement_attestation",
  "payment_verification",
  "supplier_assignment",
  "tracking",
  "cancellation_reason_present",
] as const satisfies readonly AssistedOrderStatusAuthorityEvidenceKind[]);

type AssistedOrderAuditEventType =
  (typeof assistedOrderAuditEventTypes)[number];
type AssistedOrderAuditActorType =
  (typeof assistedOrderAuditActorTypes)[number];

type SafeAssistedOrderAuditEvidence =
  | Readonly<{
      lineCount: number;
      workflowModes: readonly AssistedOrderWorkflowMode[];
      requestFingerprint: string;
    }>
  | Readonly<{
      from: AssistedOrderStatus;
      to: AssistedOrderStatus;
      authorityEvidenceKinds: readonly AssistedOrderStatusAuthorityEvidenceKind[];
    }>
  | Readonly<{
      documentId: string;
      documentType: "government_id" | "business_document" | "other";
      side: "front" | "back" | "single";
      mimeType: "image/jpeg" | "image/png" | "application/pdf";
      sizeBytes: number;
    }>
  | Readonly<{
      documentId: string;
      documentType: "government_id" | "business_document" | "other";
      sizeBytes: number;
    }>
  | Readonly<{ documentId: string }>;

type SafeAssistedOrderAuditRecord = Readonly<{
  eventId: string;
  eventKey: string;
  eventFingerprint: string;
  eventType: AssistedOrderAuditEventType;
  requestId: string;
  actorType: AssistedOrderAuditActorType;
  actorAlias: string | null;
  evidence: SafeAssistedOrderAuditEvidence;
  occurredAt: string;
}>;

export type AssistedOrderAuditStoreErrorCode =
  | "invalid_event"
  | "conflicting_duplicate"
  | "store_unavailable";

export class AssistedOrderAuditStoreError extends Error {
  public constructor(public readonly code: AssistedOrderAuditStoreErrorCode) {
    super(`assisted_order_audit_${code}`);
    this.name = "AssistedOrderAuditStoreError";
  }
}

const authorityBrand: unique symbol = Symbol(
  "ResolvedAssistedOrderAuditAuthority",
);

/**
 * A production composition can obtain this value only after the exact database
 * authority RPC has answered with the expected schema and attestation. Keeping
 * the brand private prevents a plain callback (for example a JSON logger) from
 * being mistaken for the durable authority at the typed composition seam.
 */
export type ResolvedAssistedOrderAuditAuthority = Readonly<{
  schemaVersion: typeof ASSISTED_ORDER_AUDIT_SCHEMA_VERSION;
  attestation: typeof ASSISTED_ORDER_AUDIT_ATTESTATION;
  sink: AssistedOrderAuditSink;
  [authorityBrand]: true;
}>;

export type AssistedOrderAuditAuthorityResolution =
  | Readonly<{
      available: true;
      authority: ResolvedAssistedOrderAuditAuthority;
      refusalReason: null;
    }>
  | Readonly<{
      available: false;
      authority: null;
      refusalReason:
        | "assisted_order_audit_disabled"
        | "assisted_order_audit_rpc_missing"
        | "assisted_order_audit_schema_config_invalid"
        | "assisted_order_audit_attestation_config_invalid"
        | "assisted_order_audit_actor_key_id_invalid"
        | "assisted_order_audit_actor_key_invalid"
        | "assisted_order_audit_authority_unavailable";
    }>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HEX_64_PATTERN = /^[0-9a-f]{64}$/;
const KEY_ID_PATTERN = /^[a-z0-9](?:[a-z0-9_-]{0,30}[a-z0-9])?$/;
const ISO_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const BASE64URL_32_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

const workflowModes = new Set<string>(assistedOrderWorkflowModes);
const statuses = new Set<string>(assistedOrderStatuses);
const documentTypes = new Set<string>(assistedOrderDocumentTypes);
const documentSides = new Set<string>(assistedOrderDocumentSides);
const authorityEvidenceKinds = new Set<string>(
  assistedOrderStatusAuthorityEvidenceKinds,
);
const actorTypes = new Set<string>(assistedOrderAuditActorTypes);
const eventTypes = new Set<string>(assistedOrderAuditEventTypes);
const mimeTypes = new Set<string>([
  "image/jpeg",
  "image/png",
  "application/pdf",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

function invalidEvent(): never {
  throw new AssistedOrderAuditStoreError("invalid_event");
}

function canonicalUuid(value: unknown): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) invalidEvent();
  return value;
}

function canonicalOccurredAt(value: unknown): string {
  if (
    typeof value !== "string" ||
    !ISO_UTC_PATTERN.test(value) ||
    Number.isNaN(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    invalidEvent();
  }
  return value;
}

function boundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    invalidEvent();
  }
  return value as number;
}

function exactStringArray<T extends string>(
  value: unknown,
  allowed: ReadonlySet<string>,
  minimum: number,
  maximum: number,
): readonly T[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    invalidEvent();
  }
  const result: T[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string" || !allowed.has(entry) || seen.has(entry)) {
      invalidEvent();
    }
    seen.add(entry);
    result.push(entry as T);
  }
  return Object.freeze(result.sort());
}

function actorAlias(
  actorType: AssistedOrderAuditActorType,
  actorId: unknown,
  keyId: string,
  key: Buffer,
): string | null {
  if (actorType === "system") {
    if (actorId !== null) invalidEvent();
    return null;
  }
  if (
    typeof actorId !== "string" ||
    actorId.length < 1 ||
    actorId.length > 512 ||
    actorId !== actorId.trim() ||
    CONTROL_CHARACTER_PATTERN.test(actorId)
  ) {
    invalidEvent();
  }

  let canonical = actorId;
  if (actorType === "member") {
    canonical = canonicalUuid(actorId);
  } else if (actorType === "early_access_session") {
    if (!HEX_64_PATTERN.test(actorId)) invalidEvent();
  } else {
    canonical = actorId.normalize("NFKC").toLowerCase();
  }

  const digest = createHmac("sha256", key)
    .update(`xenios:assisted-order-audit-actor:v1\u0000${actorType}\u0000`)
    .update(canonical)
    .digest("hex");
  return `aa1:${keyId}:${digest}`;
}

function safeEvidence(
  eventType: AssistedOrderAuditEventType,
  raw: unknown,
): SafeAssistedOrderAuditEvidence {
  if (!isRecord(raw)) invalidEvent();

  switch (eventType) {
    case "assisted_order.submitted": {
      if (!hasExactKeys(raw, ["lineCount", "workflowModes", "requestFingerprint"])) {
        invalidEvent();
      }
      if (
        typeof raw.requestFingerprint !== "string" ||
        !HEX_64_PATTERN.test(raw.requestFingerprint)
      ) {
        invalidEvent();
      }
      return Object.freeze({
        lineCount: boundedInteger(raw.lineCount, 1, 200),
        workflowModes: exactStringArray<AssistedOrderWorkflowMode>(
          raw.workflowModes,
          workflowModes,
          1,
          assistedOrderWorkflowModes.length,
        ),
        requestFingerprint: raw.requestFingerprint,
      });
    }
    case "assisted_order.status_changed": {
      if (!hasExactKeys(raw, ["from", "to", "authorityEvidenceKinds"])) {
        invalidEvent();
      }
      if (
        typeof raw.from !== "string" ||
        !statuses.has(raw.from) ||
        typeof raw.to !== "string" ||
        !statuses.has(raw.to) ||
        raw.from === raw.to
      ) {
        invalidEvent();
      }
      return Object.freeze({
        from: raw.from as AssistedOrderStatus,
        to: raw.to as AssistedOrderStatus,
        authorityEvidenceKinds:
          exactStringArray<AssistedOrderStatusAuthorityEvidenceKind>(
            raw.authorityEvidenceKinds,
            authorityEvidenceKinds,
            0,
            assistedOrderStatusAuthorityEvidenceKinds.length,
          ),
      });
    }
    case "assisted_order.document_upload_authorized": {
      if (
        !hasExactKeys(raw, [
          "documentId",
          "documentType",
          "side",
          "mimeType",
          "sizeBytes",
        ]) ||
        typeof raw.documentType !== "string" ||
        !documentTypes.has(raw.documentType) ||
        typeof raw.side !== "string" ||
        !documentSides.has(raw.side) ||
        typeof raw.mimeType !== "string" ||
        !mimeTypes.has(raw.mimeType)
      ) {
        invalidEvent();
      }
      return Object.freeze({
        documentId: canonicalUuid(raw.documentId),
        documentType: raw.documentType as "government_id" | "business_document" | "other",
        side: raw.side as "front" | "back" | "single",
        mimeType: raw.mimeType as "image/jpeg" | "image/png" | "application/pdf",
        sizeBytes: boundedInteger(raw.sizeBytes, 1, MAX_UPLOAD_BYTES),
      });
    }
    case "assisted_order.document_upload_completion_authorized": {
      if (
        !hasExactKeys(raw, ["documentId", "documentType", "sizeBytes"]) ||
        typeof raw.documentType !== "string" ||
        !documentTypes.has(raw.documentType)
      ) {
        invalidEvent();
      }
      return Object.freeze({
        documentId: canonicalUuid(raw.documentId),
        documentType: raw.documentType as "government_id" | "business_document" | "other",
        sizeBytes: boundedInteger(raw.sizeBytes, 1, MAX_UPLOAD_BYTES),
      });
    }
    case "assisted_order.document_download_authorized": {
      if (!hasExactKeys(raw, ["documentId"])) invalidEvent();
      return Object.freeze({ documentId: canonicalUuid(raw.documentId) });
    }
  }
}

function stableJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) invalidEvent();
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (isRecord(value)) {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`);
    return `{${entries.join(",")}}`;
  }
  return invalidEvent();
}

function safeRecord(
  rawEvent: AssistedOrderAuditEvent,
  keyId: string,
  actorKey: Buffer,
): SafeAssistedOrderAuditRecord {
  const event = rawEvent as unknown;
  if (
    !isRecord(event) ||
    !hasExactKeys(event, [
      "eventId",
      "eventType",
      "requestId",
      "actorType",
      "actorId",
      "evidence",
      "occurredAt",
    ]) ||
    typeof event.eventType !== "string" ||
    !eventTypes.has(event.eventType) ||
    typeof event.actorType !== "string" ||
    !actorTypes.has(event.actorType)
  ) {
    invalidEvent();
  }

  const eventId = canonicalUuid(event.eventId);
  const requestId = canonicalUuid(event.requestId);
  const eventType = event.eventType as AssistedOrderAuditEventType;
  const actorType = event.actorType as AssistedOrderAuditActorType;
  const evidence = safeEvidence(eventType, event.evidence);
  const occurredAt = canonicalOccurredAt(event.occurredAt);
  const alias = actorAlias(actorType, event.actorId, keyId, actorKey);
  const eventKey = `assisted-order-audit:v1:${eventId}`;
  const fingerprintInput = Object.freeze({
    eventKey,
    eventType,
    requestId,
    actorType,
    actorAlias: alias,
    evidence,
    occurredAt,
  });
  const eventFingerprint = createHash("sha256")
    .update(stableJson(fingerprintInput))
    .digest("hex");

  return Object.freeze({
    eventId,
    eventKey,
    eventFingerprint,
    eventType,
    requestId,
    actorType,
    actorAlias: alias,
    evidence,
    occurredAt,
  });
}

function strictAuthorityResponse(value: unknown): void {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "schemaVersion",
      "attestation",
      "eventTypes",
      "actorTypes",
      "evidencePolicy",
      "actorIdentityPolicy",
      "appendOnly",
    ]) ||
    value.schemaVersion !== ASSISTED_ORDER_AUDIT_SCHEMA_VERSION ||
    value.attestation !== ASSISTED_ORDER_AUDIT_ATTESTATION ||
    value.evidencePolicy !== "bounded_allowlist_v1" ||
    value.actorIdentityPolicy !== "hmac_sha256_alias_v1" ||
    value.appendOnly !== true ||
    !Array.isArray(value.eventTypes) ||
    !Array.isArray(value.actorTypes) ||
    stableJson(value.eventTypes) !== stableJson(assistedOrderAuditEventTypes) ||
    stableJson(value.actorTypes) !== stableJson(assistedOrderAuditActorTypes)
  ) {
    throw new AssistedOrderAuditStoreError("store_unavailable");
  }
}

function strictAppendResponse(
  value: unknown,
  expected: SafeAssistedOrderAuditRecord,
): void {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "state",
      "eventId",
      "eventKey",
      "requestId",
      "eventType",
      "eventFingerprint",
      "schemaVersion",
      "attestation",
    ]) ||
    (value.state !== "inserted" && value.state !== "replayed") ||
    value.eventId !== expected.eventId ||
    value.eventKey !== expected.eventKey ||
    value.requestId !== expected.requestId ||
    value.eventType !== expected.eventType ||
    value.eventFingerprint !== expected.eventFingerprint ||
    value.schemaVersion !== ASSISTED_ORDER_AUDIT_SCHEMA_VERSION ||
    value.attestation !== ASSISTED_ORDER_AUDIT_ATTESTATION
  ) {
    throw new AssistedOrderAuditStoreError("store_unavailable");
  }
}

class SupabaseAssistedOrderAuditSink implements AssistedOrderAuditSink {
  public constructor(
    private readonly rpc: SupabaseRpcClient,
    private readonly actorKeyId: string,
    private readonly actorKey: Buffer,
  ) {}

  public async record(event: AssistedOrderAuditEvent): Promise<void> {
    const record = safeRecord(event, this.actorKeyId, this.actorKey);
    const response = await this.rpc.rpc(ASSISTED_ORDER_AUDIT_APPEND_RPC, {
      p_schema_version: ASSISTED_ORDER_AUDIT_SCHEMA_VERSION,
      p_attestation: ASSISTED_ORDER_AUDIT_ATTESTATION,
      p_event: record,
    });
    if (response.error) {
      if (response.error.code === "23505") {
        throw new AssistedOrderAuditStoreError("conflicting_duplicate");
      }
      throw new AssistedOrderAuditStoreError("store_unavailable");
    }
    strictAppendResponse(response.data, record);
  }
}

function decodeActorKey(value: string | undefined): Buffer | null {
  if (!value || !BASE64URL_32_PATTERN.test(value)) return null;
  try {
    const decoded = Buffer.from(value, "base64url");
    return decoded.length === 32 && decoded.toString("base64url") === value
      ? decoded
      : null;
  } catch {
    return null;
  }
}

/**
 * Resolve the exact database authority before mounting the assisted-order
 * bridge. No enabled flag, callback logger, unprobed RPC, malformed key, stale
 * schema, or stale attestation can produce a sink.
 */
export async function resolveAssistedOrderAuditAuthority(input: Readonly<{
  env: NodeJS.ProcessEnv;
  rpc: SupabaseRpcClient | null;
}>): Promise<AssistedOrderAuditAuthorityResolution> {
  if (input.env[ASSISTED_ORDER_AUDIT_ENABLED_ENV_VAR] !== "true") {
    return Object.freeze({
      available: false,
      authority: null,
      refusalReason: "assisted_order_audit_disabled",
    });
  }
  if (!input.rpc) {
    return Object.freeze({
      available: false,
      authority: null,
      refusalReason: "assisted_order_audit_rpc_missing",
    });
  }
  if (
    input.env[ASSISTED_ORDER_AUDIT_SCHEMA_ENV_VAR] !==
    ASSISTED_ORDER_AUDIT_SCHEMA_VERSION
  ) {
    return Object.freeze({
      available: false,
      authority: null,
      refusalReason: "assisted_order_audit_schema_config_invalid",
    });
  }
  if (
    input.env[ASSISTED_ORDER_AUDIT_ATTESTATION_ENV_VAR] !==
    ASSISTED_ORDER_AUDIT_ATTESTATION
  ) {
    return Object.freeze({
      available: false,
      authority: null,
      refusalReason: "assisted_order_audit_attestation_config_invalid",
    });
  }

  const actorKeyId =
    input.env[ASSISTED_ORDER_AUDIT_ACTOR_KEY_ID_ENV_VAR] ?? "";
  if (!KEY_ID_PATTERN.test(actorKeyId)) {
    return Object.freeze({
      available: false,
      authority: null,
      refusalReason: "assisted_order_audit_actor_key_id_invalid",
    });
  }
  const actorKey = decodeActorKey(
    input.env[ASSISTED_ORDER_AUDIT_ACTOR_HMAC_KEY_ENV_VAR],
  );
  if (!actorKey) {
    return Object.freeze({
      available: false,
      authority: null,
      refusalReason: "assisted_order_audit_actor_key_invalid",
    });
  }

  try {
    const response = await input.rpc.rpc(ASSISTED_ORDER_AUDIT_AUTHORITY_RPC);
    if (response.error) {
      throw new AssistedOrderAuditStoreError("store_unavailable");
    }
    strictAuthorityResponse(response.data);
  } catch {
    return Object.freeze({
      available: false,
      authority: null,
      refusalReason: "assisted_order_audit_authority_unavailable",
    });
  }

  const sink = new SupabaseAssistedOrderAuditSink(
    input.rpc,
    actorKeyId,
    actorKey,
  );
  return Object.freeze({
    available: true,
    authority: Object.freeze({
      schemaVersion: ASSISTED_ORDER_AUDIT_SCHEMA_VERSION,
      attestation: ASSISTED_ORDER_AUDIT_ATTESTATION,
      sink,
      [authorityBrand]: true as const,
    }),
    refusalReason: null,
  });
}
