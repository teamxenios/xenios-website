import { z } from "zod";

/** Durable Gen2 referral authority. No in-memory fallback or browser identity input. */
export const REFERRAL_V1_SCHEMA_VERSION = "gen2_referral_v1_20260904";
export const REFERRAL_V1_EXPIRES_IN_DAYS = 30 as const;

export type ReferralV1Availability = "ready" | "revoked" | "expired" | "partner_inactive" | "self_referral";
export type ReferralV1Denial = "invalid_input" | "not_eligible" | "not_found" | "invalid_link" | "self_referral" | "idempotency_conflict" | "capture_claimed" | "capture_missing";
export type ReferralV1Result<T> = { ok: true; value: T } | { ok: false; reason: ReferralV1Denial | "unavailable" };

export interface ReferralV1Link {
  id: string;
  partnerId: string;
  internalCode: string;
  tokenKeyVersion: number;
  /** Internal server-only reconstruction check; never serialize to a public DTO. */
  tokenHashHex: string;
  destinationPath: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  availability: ReferralV1Availability;
  captureCount: number;
  bindingCount: number;
}
export interface ReferralV1Touch {
  touchId: string;
  linkId: string;
  partnerId: string;
  subjectKeyHash: string;
  capturedAt: string;
  expiresAt: string;
}
export interface ReferralV1Binding {
  accountKey: string;
  linkId: string;
  touchId: string;
  partnerId: string;
  boundAt: string;
}
export interface ReferralV1Event {
  id: string;
  eventType: "link_issued" | "link_revoked" | "capture_recorded" | "account_bound";
  partnerId: string;
  linkId: string;
  occurredAt: string;
}
export type ReferralV1AdminTouch = Omit<ReferralV1Touch, "subjectKeyHash"> & { availability: ReferralV1Availability };
export type ReferralV1AdminBinding = ReferralV1Binding & { availability: ReferralV1Availability };
export interface ReferralV1Store {
  authority(): Promise<ReferralV1Result<{ schemaVersion: typeof REFERRAL_V1_SCHEMA_VERSION }>>;
  issue(input: { actorAuthUserId: string; idempotencyKey: string; linkId: string; tokenHashHex: string; tokenKeyVersion: number; destinationPath: string; expiresInDays: 30 }): Promise<ReferralV1Result<{ link: ReferralV1Link; created: boolean }>>;
  revoke(input: { actorAuthUserId: string; idempotencyKey: string; linkId: string }): Promise<ReferralV1Result<{ link: ReferralV1Link; created: boolean }>>;
  listOwn(input: { actorAuthUserId: string }): Promise<ReferralV1Result<{ eligible: boolean; partnerId: string | null; partnerState: string | null; links: ReferralV1Link[] }>>;
  resolve(input: { tokenHashHex: string }): Promise<ReferralV1Result<{ link: ReferralV1Link }>>;
  capture(input: { tokenHashHex: string; subjectKeyHash: string; actorAuthUserId?: string }): Promise<ReferralV1Result<{ touch: ReferralV1Touch; created: boolean; availability: ReferralV1Availability }>>;
  bind(input: { actorAuthUserId: string; touchId: string; subjectKeyHash: string }): Promise<ReferralV1Result<{ binding: ReferralV1Binding | null; created: boolean; availability: ReferralV1Availability | "none" }>>;
  getBinding(input: { actorAuthUserId: string }): Promise<ReferralV1Result<{ binding: ReferralV1Binding | null; created: boolean; availability: ReferralV1Availability | "none" }>>;
  /** The HTTP caller must already have passed the canonical Supabase admin guard. */
  listAdmin(input: { adminAuthUserId: string; partnerId?: string; limit?: number }): Promise<ReferralV1Result<{ links: ReferralV1Link[]; events: ReferralV1Event[]; touches: ReferralV1AdminTouch[]; bindings: ReferralV1AdminBinding[] }>>;
}

/** Structural subset compatible with SupabaseClient; never returns provider errors. */
export interface ReferralV1RpcClient {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}

const uuid = z.string().regex(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
const hex = z.string().regex(/^[a-f0-9]{64}$/);
const timestamp = z.string().datetime({ offset: true });
const availability = z.enum(["ready", "revoked", "expired", "partner_inactive", "self_referral"]);
const destination = z.string().refine((v) =>
  ["/health", "/care", "/care/how-it-works", "/research", "/research/member/catalog"].includes(v) ||
  /^\/research\/member\/products\/[a-z0-9][a-z0-9._-]{0,191}$/.test(v));
const denial = z.object({ ok: z.literal(false), reason: z.enum(["invalid_input", "not_eligible", "not_found", "invalid_link", "self_referral", "idempotency_conflict", "capture_claimed", "capture_missing", "unavailable"]) }).strict();
const authoritySchema = z.object({ schemaVersion: z.literal(REFERRAL_V1_SCHEMA_VERSION) }).strict();
const linkSchema = z.object({
  id: uuid, partnerId: uuid, internalCode: uuid, tokenKeyVersion: z.literal(1), tokenHashHex: hex, destinationPath: destination,
  createdAt: timestamp, expiresAt: timestamp, revokedAt: timestamp.nullable(), availability,
  captureCount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  bindingCount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
}).strict().refine((v) => v.id === v.internalCode && Date.parse(v.expiresAt) > Date.parse(v.createdAt) &&
  Date.parse(v.expiresAt) - Date.parse(v.createdAt) <= 30 * 86400000 && v.bindingCount <= v.captureCount);
const touchSchema = z.object({
  touchId: uuid, linkId: uuid, partnerId: uuid, subjectKeyHash: hex, capturedAt: timestamp, expiresAt: timestamp,
}).strict().refine((v) => Date.parse(v.expiresAt) > Date.parse(v.capturedAt));
const bindingSchema = z.object({
  accountKey: z.string().regex(/^auth:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/),
  linkId: uuid, touchId: uuid, partnerId: uuid, boundAt: timestamp,
}).strict();
const bindingResultSchema = z.object({ binding: bindingSchema.nullable(), created: z.boolean(), availability: z.enum(["ready", "revoked", "expired", "partner_inactive", "self_referral", "none"]) }).strict()
  .refine((v) => v.binding === null ? v.availability === "none" && !v.created : v.availability !== "none" && (!v.created || v.availability === "ready"));
const eventSchema = z.object({ id: uuid, eventType: z.enum(["link_issued", "link_revoked", "capture_recorded", "account_bound"]), partnerId: uuid, linkId: uuid, occurredAt: timestamp }).strict();
const adminTouchSchema = z.object({ touchId: uuid, linkId: uuid, partnerId: uuid, capturedAt: timestamp, expiresAt: timestamp, availability }).strict();
const adminBindingSchema = bindingSchema.extend({ availability }).strict();
const actorSchema = z.object({ actorAuthUserId: uuid }).strict();
const idempotencyKey = z.string().regex(/^[A-Za-z0-9_-]{16,128}$/);

/**
 * Service-key transport only. The caller verifies Auth / canonical admin before
 * invoking this adapter. SQL re-resolves Auth -> member -> Gen2 partner itself.
 * Probes the live authority on every call; no stale positive capability cache.
 * Unknown fields are refused (not stripped), preventing accidental PII/token
 * exposure from a drifted RPC projection. Provider error objects are never logged.
 */
export function createSupabaseReferralV1Store(rpc: ReferralV1RpcClient): ReferralV1Store {
  const unavailable = { ok: false, reason: "unavailable" } as const;
  async function transport<T>(name: string, args: Record<string, unknown> | undefined, schema: z.ZodType<T>): Promise<ReferralV1Result<T>> {
    try {
      const result = await rpc.rpc(name, args);
      if (result.error) return unavailable;
      const parsed = z.union([z.object({ ok: z.literal(true), value: schema }).strict(), denial]).safeParse(result.data);
      return parsed.success ? parsed.data as ReferralV1Result<T> : unavailable;
    } catch { return unavailable; }
  }
  const authority = () => transport("research_referral_v1_authority", undefined, authoritySchema);
  async function execute<T>(operation: string, input: unknown, inputSchema: z.ZodTypeAny, outputSchema: z.ZodType<T>): Promise<ReferralV1Result<T>> {
    const safeInput = inputSchema.safeParse(input);
    if (!safeInput.success) return { ok: false, reason: "invalid_input" };
    const authorized = await authority();
    if (!authorized.ok) return unavailable;
    return transport("research_referral_v1_execute", { p_operation: operation, p_input: safeInput.data }, outputSchema);
  }
  return {
    authority,
    issue: (input) => execute("issue", input, actorSchema.extend({ idempotencyKey, linkId: uuid, tokenHashHex: hex, tokenKeyVersion: z.literal(1), destinationPath: destination, expiresInDays: z.literal(30) }).strict(), z.object({ link: linkSchema, created: z.boolean() }).strict().refine((v) => !v.created || v.link.id === input.linkId && v.link.tokenHashHex === input.tokenHashHex)),
    revoke: (input) => execute("revoke", input, actorSchema.extend({ idempotencyKey, linkId: uuid }).strict(), z.object({ link: linkSchema, created: z.boolean() }).strict().refine((v) => v.link.id === input.linkId && v.link.revokedAt !== null)),
    listOwn: (input) => execute("listOwn", input, actorSchema, z.object({ eligible: z.boolean(), partnerId: uuid.nullable(), partnerState: z.enum(["application", "identity_verification_pending", "tax_status_pending", "payout_status_pending", "agreement_pending", "training_pending", "certification_pending", "active", "quality_review", "suspended", "terminated"]).nullable(), links: z.array(linkSchema).max(100) }).strict().refine((v) =>
      (v.eligible ? v.partnerId !== null && v.partnerState === "active" : true) &&
      (v.partnerId === null ? v.links.length === 0 && v.partnerState === null : v.partnerState !== null && v.links.every((l) => l.partnerId === v.partnerId)))),
    resolve: (input) => execute("resolve", input, z.object({ tokenHashHex: hex }).strict(), z.object({ link: linkSchema }).strict().refine((v) => v.link.availability === "ready" && v.link.tokenHashHex === input.tokenHashHex)),
    capture: (input) => execute("capture", input, z.object({ tokenHashHex: hex, subjectKeyHash: hex, actorAuthUserId: uuid.optional() }).strict(), z.object({ touch: touchSchema, created: z.boolean(), availability }).strict().refine((v) => v.touch.subjectKeyHash === input.subjectKeyHash && (!v.created || v.availability === "ready"))),
    bind: (input) => execute("bind", input, actorSchema.extend({ touchId: uuid, subjectKeyHash: hex }).strict(), bindingResultSchema.refine((v) => v.binding === null || v.binding.accountKey === `auth:${input.actorAuthUserId}`)),
    getBinding: (input) => execute("getBinding", input, actorSchema, bindingResultSchema.refine((v) => v.binding === null || v.binding.accountKey === `auth:${input.actorAuthUserId}`)),
    listAdmin: ({ adminAuthUserId, ...rest }) => execute("listAdmin", { actorAuthUserId: adminAuthUserId, ...rest }, actorSchema.extend({ partnerId: uuid.optional(), limit: z.number().int().min(1).max(100).optional() }).strict(), z.object({ links: z.array(linkSchema).max(100), events: z.array(eventSchema).max(100), touches: z.array(adminTouchSchema).max(100), bindings: z.array(adminBindingSchema).max(100) }).strict()),
  };
}
