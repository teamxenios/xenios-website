// xenios research: partner links, codes, QR payloads, and attribution capture.
//
// Three invariants drive the shape of this module:
//
//   1. A code is only ever accepted on a verified signature. There is no unsigned
//      fallback, so an absent secret makes issuing and verifying FAIL rather than
//      quietly producing codes anyone could mint.
//   2. One conversion has exactly one winner. The attribution write is
//      insert-if-absent per order id, so a retry or a concurrent race returns the
//      original winner instead of creating a second attribution and a second
//      commission.
//   3. A partner learns THAT a conversion happened, never WHO converted. The
//      visitor is identified by an opaque subject key, and no applicant email,
//      name, or rejection reason is accepted, stored, or returned anywhere here.
//
// Window, model, and tie-break logic is NOT re-implemented: resolveAttribution in
// shared/research/distribution.ts is the single authority.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  resolveAttribution,
  type AttributionChannel,
  type AttributionConfig,
  type AttributionTouch,
  DEFAULT_ATTRIBUTION,
} from "@shared/research/distribution";
import type { PartnerLinkDto } from "@shared/research/commerce-api";

/** The channels a partner can be issued a link for. "manual" is admin-only. */
export type LinkChannel = PartnerLinkDto["channel"];

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Raised when the link secret is absent. Issuing and verifying both fail on this
 * rather than degrading to an unsigned code, because an unsigned code is a code
 * any visitor could forge to redirect another partner's commission.
 */
export class LinkSecretMissingError extends Error {
  readonly code = "LINK_SECRET_MISSING";

  constructor() {
    super("Partner link signing secret is not configured. Links cannot be issued or verified.");
    this.name = "LinkSecretMissingError";
  }
}

/**
 * Raised when a caller passes something that looks like a person rather than an
 * opaque key. Attribution must never become a place applicant identity is stored.
 */
export class SubjectKeyNotOpaqueError extends Error {
  readonly code = "SUBJECT_KEY_NOT_OPAQUE";

  constructor() {
    super("Subject key must be an opaque identifier, never an email address or a name.");
    this.name = "SubjectKeyNotOpaqueError";
  }
}

// ---------------------------------------------------------------------------
// Stored shapes
// ---------------------------------------------------------------------------

export interface StoredLink {
  code: string;
  partnerId: string;
  channel: LinkChannel;
  campaign: string | null;
  issuedAt: string;
}

/**
 * The resolved winner for one order.
 *
 * There is no member id, email, or name here on purpose. The subject key is the
 * only link back to the visitor, and it is not reversible.
 */
export interface AttributionRecord {
  orderId: string;
  partnerId: string;
  channel: AttributionChannel;
  attributedAt: string;
  /** Always set for a manual override, so an overridden result stays auditable. */
  setByAdminId: string | null;
  /** The admin's stated reason for a manual override. Never a rejection reason. */
  overrideReason: string | null;
}

export interface AttributionRepository {
  saveLink(link: StoredLink): void;
  findLinkByCode(code: string): StoredLink | null;
  listLinks(partnerId: string): StoredLink[];

  appendTouch(subjectKey: string, touch: AttributionTouch): void;
  touchesFor(subjectKey: string): AttributionTouch[];

  /**
   * Insert-if-absent, per order id, atomically.
   *
   * MUST return the already-stored record when one exists rather than overwriting
   * it. A real implementation uses a unique constraint on order id and returns the
   * conflicting row, so two concurrent writers cannot produce two winners.
   */
  putAttributionIfAbsent(record: AttributionRecord): AttributionRecord;
  getAttribution(orderId: string): AttributionRecord | null;
  /** Unconditional replace. Reserved for admin override, which outranks the automatic result. */
  replaceAttribution(record: AttributionRecord): void;
}

export interface AttributionServiceDeps {
  repository: AttributionRepository;
  /** Absent means links are not issuable. Never defaulted to a constant. */
  linkSecret: string | null;
  /** Base of the public referral URL, no trailing slash required. */
  linkBaseUrl: string;
  /** Injected so a test can produce a fixed nonce. */
  generateNonce?: () => string;
}

export interface AttributionService {
  issueLink(partnerId: string, channel: LinkChannel, campaign: string | null, asOf: Date): PartnerLinkDto;
  signCode(partnerId: string, nonce: string): string;
  verifyCode(code: string): { partnerId: string } | null;
  recordTouch(subjectKey: string, partnerId: string, channel: LinkChannel, asOf: Date): void;
  recordConversion(
    subjectKey: string,
    orderId: string,
    convertedAt: Date,
    config?: AttributionConfig,
  ): AttributionRecord | null;
  manualAttribution(
    orderId: string,
    partnerId: string,
    adminId: string,
    reason: string,
    asOf: Date,
  ): AttributionRecord;
  qrPayloadFor(link: PartnerLinkDto): string;
  listLinks(partnerId: string): PartnerLinkDto[];
  /** Turns a raw visitor identifier into the opaque key this module will accept. */
  deriveSubjectKey(rawIdentifier: string): string;
}

// ---------------------------------------------------------------------------
// Code signing
// ---------------------------------------------------------------------------

const CODE_VERSION = "v1";

function b64url(value: string | Buffer): string {
  const buf = typeof value === "string" ? Buffer.from(value, "utf8") : value;
  return buf.toString("base64url");
}

/**
 * The signed payload.
 *
 * Version and both fields are covered by the signature, so a code cannot be
 * downgraded to an older scheme and the partner id cannot be swapped while the
 * nonce is kept.
 */
function signingInput(partnerId: string, nonce: string): string {
  return `${CODE_VERSION}.${b64url(partnerId)}.${b64url(nonce)}`;
}

function sign(secret: string, input: string): string {
  return b64url(createHmac("sha256", secret).update(input, "utf8").digest());
}

/** Constant-time compare that tolerates a length mismatch without leaking it by timing. */
function signaturesMatch(expected: string, provided: string): boolean {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// Privacy guard
// ---------------------------------------------------------------------------

/**
 * A subject key must not carry identity. An address-shaped or whitespace-bearing
 * value is rejected outright rather than sanitized, so a caller that is about to
 * store an applicant email fails loudly at the boundary.
 */
function assertOpaqueSubjectKey(subjectKey: string): void {
  const value = subjectKey.trim();
  if (value.length === 0) throw new SubjectKeyNotOpaqueError();
  if (value.includes("@")) throw new SubjectKeyNotOpaqueError();
  if (/\s/.test(value)) throw new SubjectKeyNotOpaqueError();
}

// ---------------------------------------------------------------------------
// In-memory repository
// ---------------------------------------------------------------------------

export function createInMemoryAttributionRepository(): AttributionRepository {
  const linksByCode = new Map<string, StoredLink>();
  const linksByPartner = new Map<string, StoredLink[]>();
  const touchesBySubject = new Map<string, AttributionTouch[]>();
  const attributionsByOrder = new Map<string, AttributionRecord>();

  return {
    saveLink(link) {
      linksByCode.set(link.code, link);
      const existing = linksByPartner.get(link.partnerId) ?? [];
      existing.push(link);
      linksByPartner.set(link.partnerId, existing);
    },
    findLinkByCode(code) {
      return linksByCode.get(code) ?? null;
    },
    listLinks(partnerId) {
      return (linksByPartner.get(partnerId) ?? []).slice();
    },
    appendTouch(subjectKey, touch) {
      const existing = touchesBySubject.get(subjectKey) ?? [];
      existing.push(touch);
      touchesBySubject.set(subjectKey, existing);
    },
    touchesFor(subjectKey) {
      return (touchesBySubject.get(subjectKey) ?? []).slice();
    },
    putAttributionIfAbsent(record) {
      const existing = attributionsByOrder.get(record.orderId);
      if (existing) return existing;
      attributionsByOrder.set(record.orderId, record);
      return record;
    },
    getAttribution(orderId) {
      return attributionsByOrder.get(orderId) ?? null;
    },
    replaceAttribution(record) {
      attributionsByOrder.set(record.orderId, record);
    },
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export function createAttributionService(deps: AttributionServiceDeps): AttributionService {
  const nonceFactory = deps.generateNonce ?? (() => randomBytes(12).toString("base64url"));

  function requireSecret(): string {
    if (!deps.linkSecret || deps.linkSecret.length === 0) throw new LinkSecretMissingError();
    return deps.linkSecret;
  }

  function urlFor(code: string): string {
    const base = deps.linkBaseUrl.replace(/\/+$/, "");
    return `${base}/r/${code}`;
  }

  function toDto(link: StoredLink): PartnerLinkDto {
    // Built by explicit construction. A field added to StoredLink later cannot
    // reach a partner response by being spread in here.
    return {
      code: link.code,
      url: urlFor(link.code),
      channel: link.channel,
      campaign: link.campaign,
      qrSvgPath: null,
    };
  }

  function signCode(partnerId: string, nonce: string): string {
    const secret = requireSecret();
    const input = signingInput(partnerId, nonce);
    return `${input}.${sign(secret, input)}`;
  }

  function verifyCode(code: string): { partnerId: string } | null {
    // A missing secret verifies nothing. Returning null rather than throwing keeps
    // an inbound click on an unconfigured deployment a plain miss, not a 500.
    if (!deps.linkSecret || deps.linkSecret.length === 0) return null;

    const parts = code.split(".");
    if (parts.length !== 4) return null;
    const [version, encodedPartner, encodedNonce, providedSignature] = parts;
    if (version !== CODE_VERSION) return null;
    if (!encodedPartner || !encodedNonce || !providedSignature) return null;

    const input = `${version}.${encodedPartner}.${encodedNonce}`;
    if (!signaturesMatch(sign(deps.linkSecret, input), providedSignature)) return null;

    const partnerId = Buffer.from(encodedPartner, "base64url").toString("utf8");
    if (partnerId.length === 0) return null;
    // Reject a payload that does not round-trip, so a re-encoded variant of a valid
    // code cannot smuggle a different partner id past the signature.
    if (b64url(partnerId) !== encodedPartner) return null;
    return { partnerId };
  }

  return {
    signCode,
    verifyCode,

    issueLink(partnerId, channel, campaign, asOf) {
      const link: StoredLink = {
        code: signCode(partnerId, nonceFactory()),
        partnerId,
        channel,
        campaign,
        issuedAt: asOf.toISOString(),
      };
      deps.repository.saveLink(link);
      return toDto(link);
    },

    listLinks(partnerId) {
      return deps.repository.listLinks(partnerId).map(toDto);
    },

    qrPayloadFor(link) {
      // Payload only. Rendering is the caller's concern, and nothing about the
      // visitor is encoded, so a scanned QR reveals only the partner's own code.
      return link.url;
    },

    deriveSubjectKey(rawIdentifier) {
      const secret = requireSecret();
      return createHmac("sha256", secret).update(rawIdentifier, "utf8").digest("base64url");
    },

    recordTouch(subjectKey, partnerId, channel, asOf) {
      assertOpaqueSubjectKey(subjectKey);
      const touch: AttributionTouch = {
        partnerId,
        channel,
        occurredAt: asOf.toISOString(),
      };
      deps.repository.appendTouch(subjectKey, touch);
    },

    recordConversion(subjectKey, orderId, convertedAt, config = DEFAULT_ATTRIBUTION) {
      assertOpaqueSubjectKey(subjectKey);

      // The winner already decided for this order wins again. This runs before the
      // resolve so a replay cannot even recompute, let alone store, a second result.
      const existing = deps.repository.getAttribution(orderId);
      if (existing) return existing;

      const winner = resolveAttribution(
        deps.repository.touchesFor(subjectKey),
        convertedAt.toISOString(),
        config,
      );
      if (!winner) return null;

      // Eligibility to EARN is not checked here. Attribution records what happened;
      // computeCommission is the gate that decides whether it pays.
      const record: AttributionRecord = {
        orderId,
        partnerId: winner.partnerId,
        channel: winner.channel,
        attributedAt: convertedAt.toISOString(),
        setByAdminId: winner.setByAdminId ?? null,
        overrideReason: null,
      };
      // Insert-if-absent is the real guard: a concurrent writer that got here first
      // has its record returned, so one order still yields one attribution.
      return deps.repository.putAttributionIfAbsent(record);
    },

    manualAttribution(orderId, partnerId, adminId, reason, asOf) {
      const record: AttributionRecord = {
        orderId,
        partnerId,
        channel: "manual",
        attributedAt: asOf.toISOString(),
        setByAdminId: adminId,
        overrideReason: reason,
      };
      // Replace, not insert-if-absent: a manual attribution exists precisely to
      // overrule the automatic result, and it always names the acting admin.
      deps.repository.replaceAttribution(record);
      return record;
    },
  };
}
