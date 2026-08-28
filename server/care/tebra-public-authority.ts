import { createHash } from "node:crypto";

import type {
  TebraPortalConfiguration,
  TebraSchedulingConfiguration,
} from "@shared/care/tebra-experience";

export const TEBRA_PUBLIC_AUTHORITY_SCOPES = [
  "scheduling_public_handoff",
  "patient_portal_public_handoff",
] as const;

export type TebraPublicAuthorityScope =
  (typeof TEBRA_PUBLIC_AUTHORITY_SCOPES)[number];

export type ReadyTebraSchedulingConfiguration = Extract<
  TebraSchedulingConfiguration,
  { status: "ready" }
>;
export type ReadyTebraPortalConfiguration = Extract<
  TebraPortalConfiguration,
  { status: "ready" }
>;

interface TebraPublicAuthorityBase {
  schemaVersion: 1;
  source: "durable_release_attestation";
  authorityId: string;
  releaseSha: string;
  environment: "production";
  configurationFingerprint: string;
  stagingResult: "passed";
  stagingVerifiedAt: string;
  decision: "approved";
  approvedByRef: string;
  approvedAt: string;
  validUntil: string;
  revokedAt: null;
}

export interface TebraSchedulingPublicAuthority extends TebraPublicAuthorityBase {
  scope: "scheduling_public_handoff";
  providerSchedulingState: "verified_enabled";
}

export interface TebraPatientPortalPublicAuthority extends TebraPublicAuthorityBase {
  scope: "patient_portal_public_handoff";
  providerPortalState: "verified_active";
  providerStateVerifiedAt: string;
}

export type TebraPublicActivationAuthority =
  | TebraSchedulingPublicAuthority
  | TebraPatientPortalPublicAuthority;

export interface TebraPublicActivationAuthorities {
  scheduling?: unknown;
  portal?: unknown;
}

export interface TebraPublicActivationContext {
  currentReleaseSha?: string | null;
  authorities?: TebraPublicActivationAuthorities;
  now?: Date;
}

/**
 * This port must be backed by durable, access-controlled release evidence.
 * Environment variables are configuration candidates, never this authority.
 */
export interface TebraPublicAuthoritySource {
  load(): Promise<TebraPublicActivationAuthorities>;
}

export type TebraAuthorityDecision = "approved" | "missing" | "invalid";

const BASE_KEYS = [
  "schemaVersion",
  "source",
  "scope",
  "authorityId",
  "releaseSha",
  "environment",
  "configurationFingerprint",
  "stagingResult",
  "stagingVerifiedAt",
  "decision",
  "approvedByRef",
  "approvedAt",
  "validUntil",
  "revokedAt",
] as const;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  return (
    actual.length === expected.length &&
    [...expected].sort().every((key, index) => actual[index] === key)
  );
}

function isOpaqueReference(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value)
  );
}

function parseCanonicalInstant(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) &&
    new Date(milliseconds).toISOString() === value
    ? milliseconds
    : null;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

export function fingerprintTebraAuthorityConfiguration(
  scope: TebraPublicAuthorityScope,
  configuration:
    | ReadyTebraSchedulingConfiguration
    | ReadyTebraPortalConfiguration,
): string {
  const digest = createHash("sha256")
    .update(canonicalJson({ schemaVersion: 1, scope, configuration }), "utf8")
    .digest("hex");
  return `sha256:${digest}`;
}

function authorityRecord(
  value: unknown,
  scope: TebraPublicAuthorityScope,
): Record<string, unknown> | null {
  if (!isPlainRecord(value)) return null;
  const scopeKeys =
    scope === "scheduling_public_handoff"
      ? [...BASE_KEYS, "providerSchedulingState"]
      : [...BASE_KEYS, "providerPortalState", "providerStateVerifiedAt"];
  return hasExactKeys(value, scopeKeys) ? value : null;
}

export function evaluateTebraPublicAuthority(input: {
  authority: unknown;
  scope: TebraPublicAuthorityScope;
  currentReleaseSha: string | null | undefined;
  configuration:
    | ReadyTebraSchedulingConfiguration
    | ReadyTebraPortalConfiguration;
  now: Date;
}): TebraAuthorityDecision {
  if (input.authority === undefined || input.authority === null)
    return "missing";
  if (input.currentReleaseSha === undefined || input.currentReleaseSha === null) {
    return "missing";
  }

  const record = authorityRecord(input.authority, input.scope);
  const now = input.now.getTime();
  if (
    record === null ||
    !Number.isFinite(now) ||
    !/^[0-9a-f]{40}$/u.test(input.currentReleaseSha) ||
    record.schemaVersion !== 1 ||
    record.source !== "durable_release_attestation" ||
    record.scope !== input.scope ||
    record.environment !== "production" ||
    record.stagingResult !== "passed" ||
    record.decision !== "approved" ||
    record.revokedAt !== null ||
    !isOpaqueReference(record.authorityId) ||
    !isOpaqueReference(record.approvedByRef) ||
    record.releaseSha !== input.currentReleaseSha ||
    record.configurationFingerprint !==
      fingerprintTebraAuthorityConfiguration(input.scope, input.configuration)
  ) {
    return "invalid";
  }

  const stagingVerifiedAt = parseCanonicalInstant(record.stagingVerifiedAt);
  const approvedAt = parseCanonicalInstant(record.approvedAt);
  const validUntil = parseCanonicalInstant(record.validUntil);
  if (
    stagingVerifiedAt === null ||
    approvedAt === null ||
    validUntil === null ||
    stagingVerifiedAt > approvedAt ||
    approvedAt > now ||
    validUntil <= now
  ) {
    return "invalid";
  }

  if (input.scope === "scheduling_public_handoff") {
    return record.providerSchedulingState === "verified_enabled"
      ? "approved"
      : "invalid";
  }

  const providerStateVerifiedAt = parseCanonicalInstant(
    record.providerStateVerifiedAt,
  );
  return record.providerPortalState === "verified_active" &&
    providerStateVerifiedAt !== null &&
    providerStateVerifiedAt <= approvedAt
    ? "approved"
    : "invalid";
}
