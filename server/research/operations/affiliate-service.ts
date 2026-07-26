import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { roleCan, type OperationsActor } from "./state-machines";

export type AffiliateLifecycle =
  | "invited"
  | "applied"
  | "under_review"
  | "approved"
  | "active"
  | "paused"
  | "rejected"
  | "terminated";

export interface AffiliateLink {
  id: string;
  code: string;
  url: string;
  campaign: string | null;
  createdAt: string;
}

export interface AffiliateAccount {
  id: string;
  email: string;
  displayName: string;
  state: AffiliateLifecycle;
  version: number;
  authUserId: string | null;
  invitationHash: string | null;
  agreementVersion: string | null;
  customCode: string | null;
  links: AffiliateLink[];
  campaigns: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AffiliateMetricSnapshot {
  clicks: number;
  uniqueVisitors: number;
  qualifiedSignups: number;
  orders: number;
  conversionRate: number;
  eligibleRevenueCents: number;
  refundsCents: number;
  chargebacksCents: number;
}

export interface AffiliateDashboard {
  id: string;
  state: AffiliateLifecycle;
  code: string | null;
  links: AffiliateLink[];
  campaigns: string[];
  metrics: AffiliateMetricSnapshot;
  commission: {
    pendingCents: number;
    approvedCents: number;
    payableCents: number;
    paidCents: number;
    reversedCents: number;
  };
  payoutHistory: Array<{ batchId: string; amountCents: number; paidAt: string; reference: string }>;
}

export type AffiliateEventKind =
  | "invited"
  | "applied"
  | "under_review"
  | "approved"
  | "claimed"
  | "active"
  | "paused"
  | "rejected"
  | "terminated"
  | "link_issued"
  | "click"
  | "signup"
  | "order"
  | "refund"
  | "chargeback"
  | "attribution_override";

export interface AffiliateEvent {
  id: string;
  affiliateId: string;
  kind: AffiliateEventKind;
  actorId: string;
  actorRole: OperationsActor["role"] | "public";
  detail: Record<string, string | number | boolean | null>;
  occurredAt: string;
}

export interface AttributionEvent {
  id: string;
  orderId: string;
  affiliateId: string;
  linkId: string;
  campaign: string | null;
  kind: "attributed" | "manual_override";
  actorId: string;
  reason: string | null;
  occurredAt: string;
}

export interface AffiliateFraudFlag {
  id: string;
  affiliateId: string;
  reason: "self_referral" | "click_spike" | "duplicate_device" | "refund_pattern" | "manual";
  severity: "review" | "hold" | "critical";
  status: "open" | "resolved";
  detail: string;
  createdAt: string;
  resolvedAt: string | null;
}

export type AffiliateResult<T> =
  | { ok: true; value: T; idempotent: boolean }
  | {
      ok: false;
      code:
        | "forbidden"
        | "not_found"
        | "stale_write"
        | "invalid_input"
        | "invalid_state"
        | "invalid_invitation"
        | "already_claimed"
        | "login_refused"
        | "agreement_required"
        | "link_secret_missing"
        | "invalid_code"
        | "subject_not_opaque"
        | "attribution_locked"
        | "override_rejected"
        | "idempotency_conflict";
      message: string;
    };

type InternalMetrics = {
  clicks: number;
  visitorDigests: Set<string>;
  signupDigests: Set<string>;
  orders: number;
  eligibleRevenueCents: number;
  refundsCents: number;
  chargebacksCents: number;
};

const clone = <T>(value: T): T => structuredClone(value);
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const stableId = (prefix: string, value: string) => `${prefix}_${sha(value).slice(0, 20)}`;

const TRANSITIONS: Readonly<Record<AffiliateLifecycle, readonly AffiliateLifecycle[]>> = {
  invited: ["applied", "terminated"],
  applied: ["under_review", "rejected", "terminated"],
  under_review: ["approved", "rejected", "terminated"],
  approved: ["active", "rejected", "terminated"],
  active: ["paused", "terminated"],
  paused: ["active", "terminated"],
  rejected: [],
  terminated: [],
};

function opaqueSubject(value: string): boolean {
  if (value.includes("@") || /\s/.test(value)) return false;
  return /^[A-Za-z0-9_-]{16,200}$/.test(value);
}

/**
 * Affiliate identity is internal. Every self-service response is serialized
 * through AffiliateDashboard, which has no name, email, visitor id, signup id,
 * order customer, or other customer PII field.
 */
export class AffiliateService {
  private readonly accounts = new Map<string, AffiliateAccount>();
  private readonly commands = new Map<string, { fingerprint: string; value: unknown }>();
  private readonly events: AffiliateEvent[] = [];
  private readonly attributions: AttributionEvent[] = [];
  private readonly metrics = new Map<string, InternalMetrics>();
  private readonly fraudFlags: AffiliateFraudFlag[] = [];
  private readonly commission = new Map<
    string,
    AffiliateDashboard["commission"] & { payouts: AffiliateDashboard["payoutHistory"] }
  >();

  constructor(
    private readonly linkSecret: string | null,
    private readonly linkBaseUrl: string,
  ) {}

  invite(input: {
    id: string;
    email: string;
    displayName: string;
    actor: OperationsActor;
    idempotencyKey: string;
    occurredAt: Date;
  }): AffiliateResult<{ account: AffiliateAccount; claimToken: string }> {
    const fp = this.fingerprint("invite", input);
    const replay = this.replay<{ account: AffiliateAccount; claimToken: string }>(input.idempotencyKey, fp);
    if (replay) return replay;
    if (!roleCan(input.actor.role, "affiliate:review")) return this.failure("forbidden", "This role cannot invite affiliates.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email) || !input.displayName.trim()) {
      return this.failure("invalid_input", "A display name and valid email are required.");
    }
    if (this.accounts.has(input.id)) return this.failure("idempotency_conflict", "That affiliate id already exists.");
    const claimToken = randomBytes(24).toString("base64url");
    const now = input.occurredAt.toISOString();
    const account: AffiliateAccount = {
      id: input.id,
      email: input.email.trim().toLowerCase(),
      displayName: input.displayName.trim(),
      state: "invited",
      version: 1,
      authUserId: null,
      invitationHash: sha(claimToken),
      agreementVersion: null,
      customCode: null,
      links: [],
      campaigns: [],
      createdAt: now,
      updatedAt: now,
    };
    this.accounts.set(account.id, account);
    this.metrics.set(account.id, {
      clicks: 0,
      visitorDigests: new Set(),
      signupDigests: new Set(),
      orders: 0,
      eligibleRevenueCents: 0,
      refundsCents: 0,
      chargebacksCents: 0,
    });
    this.commission.set(account.id, {
      pendingCents: 0,
      approvedCents: 0,
      payableCents: 0,
      paidCents: 0,
      reversedCents: 0,
      payouts: [],
    });
    this.event(account.id, "invited", input.actor, {}, input.occurredAt, input.idempotencyKey);
    return this.store(input.idempotencyKey, fp, { account, claimToken });
  }

  apply(input: {
    claimToken: string;
    displayName: string;
    agreementVersion: string;
    idempotencyKey: string;
    occurredAt: Date;
  }): AffiliateResult<AffiliateAccount> {
    const fp = this.fingerprint("apply", input);
    const replay = this.replay<AffiliateAccount>(input.idempotencyKey, fp);
    if (replay) return replay;
    const account = Array.from(this.accounts.values()).find(
      (candidate) => candidate.invitationHash === sha(input.claimToken),
    );
    if (!account) return this.failure("invalid_invitation", "Invitation is invalid or expired.");
    if (!input.displayName.trim() || !input.agreementVersion.trim()) {
      return this.failure("invalid_input", "Display name and agreement version are required.");
    }
    if (account.state !== "invited") return this.failure("invalid_state", "This invitation was already applied.");
    account.displayName = input.displayName.trim();
    account.agreementVersion = input.agreementVersion.trim();
    account.state = "applied";
    account.version += 1;
    account.updatedAt = input.occurredAt.toISOString();
    this.event(account.id, "applied", null, { agreementVersion: account.agreementVersion }, input.occurredAt, input.idempotencyKey);
    return this.store(input.idempotencyKey, fp, account);
  }

  claim(input: {
    claimToken: string;
    authUserId: string;
    idempotencyKey: string;
    occurredAt: Date;
  }): AffiliateResult<AffiliateAccount> {
    const fp = this.fingerprint("claim", input);
    const replay = this.replay<AffiliateAccount>(input.idempotencyKey, fp);
    if (replay) return replay;
    if (!input.authUserId.trim()) return this.failure("invalid_input", "An authenticated user id is required.");
    const account = Array.from(this.accounts.values()).find(
      (candidate) => candidate.invitationHash === sha(input.claimToken),
    );
    if (!account) return this.failure("invalid_invitation", "Invitation is invalid or already claimed.");
    if (account.authUserId) return this.failure("already_claimed", "This affiliate account is already claimed.");
    if (Array.from(this.accounts.values()).some((candidate) => candidate.authUserId === input.authUserId)) {
      return this.failure("already_claimed", "This user already owns an affiliate account.");
    }
    account.authUserId = input.authUserId;
    account.invitationHash = null;
    account.version += 1;
    account.updatedAt = input.occurredAt.toISOString();
    this.event(account.id, "claimed", null, {}, input.occurredAt, input.idempotencyKey);
    return this.store(input.idempotencyKey, fp, account);
  }

  review(input: {
    affiliateId: string;
    to: "under_review" | "approved" | "active" | "paused" | "rejected" | "terminated";
    expectedVersion: number;
    customCode?: string;
    actor: OperationsActor;
    idempotencyKey: string;
    occurredAt: Date;
  }): AffiliateResult<AffiliateAccount> {
    const fp = this.fingerprint("review", input);
    const replay = this.replay<AffiliateAccount>(input.idempotencyKey, fp);
    if (replay) return replay;
    if (!roleCan(input.actor.role, "affiliate:review")) return this.failure("forbidden", "This role cannot review affiliates.");
    const account = this.accounts.get(input.affiliateId);
    if (!account) return this.failure("not_found", "Affiliate not found.");
    if (account.version !== input.expectedVersion) return this.failure("stale_write", "Affiliate record changed; reload it.");
    if (!TRANSITIONS[account.state].includes(input.to)) {
      return this.failure("invalid_state", `Cannot move ${account.state} to ${input.to}.`);
    }
    if (input.to === "active" && (!account.authUserId || !account.agreementVersion)) {
      return this.failure("invalid_state", "Claimed login and an agreement are required before activation.");
    }
    if (input.customCode !== undefined) {
      const custom = input.customCode.trim().toUpperCase();
      if (!/^[A-Z0-9_-]{4,32}$/.test(custom)) return this.failure("invalid_input", "Custom code is invalid.");
      if (Array.from(this.accounts.values()).some((candidate) => candidate.id !== account.id && candidate.customCode === custom)) {
        return this.failure("invalid_input", "Custom code is already in use.");
      }
      account.customCode = custom;
    }
    account.state = input.to;
    account.version += 1;
    account.updatedAt = input.occurredAt.toISOString();
    this.event(account.id, input.to, input.actor, {}, input.occurredAt, input.idempotencyKey);
    return this.store(input.idempotencyKey, fp, account);
  }

  login(authUserId: string): AffiliateResult<AffiliateDashboard> {
    const account = Array.from(this.accounts.values()).find((candidate) => candidate.authUserId === authUserId);
    if (!account) return this.failure("login_refused", "No claimed affiliate account is linked to this login.");
    if (!["approved", "active", "paused"].includes(account.state)) {
      return this.failure("login_refused", "Affiliate account is not available in its current state.");
    }
    return { ok: true, value: this.dashboard(account), idempotent: true };
  }

  issueLink(input: {
    affiliateId: string;
    campaign: string | null;
    actor: OperationsActor;
    idempotencyKey: string;
    occurredAt: Date;
  }): AffiliateResult<AffiliateLink> {
    const fp = this.fingerprint("issue_link", input);
    const replay = this.replay<AffiliateLink>(input.idempotencyKey, fp);
    if (replay) return replay;
    if (input.actor.role !== "affiliate" || input.actor.id !== input.affiliateId) {
      return this.failure("forbidden", "Affiliates may issue only their own links.");
    }
    const account = this.accounts.get(input.affiliateId);
    if (!account) return this.failure("not_found", "Affiliate not found.");
    if (account.state !== "active") return this.failure("invalid_state", "Affiliate must be active to issue links.");
    if (!this.linkSecret) return this.failure("link_secret_missing", "Affiliate link signing is not configured.");
    const nonce = randomBytes(9).toString("base64url");
    const payload = `${account.id}.${nonce}`;
    const signature = createHmac("sha256", this.linkSecret).update(payload).digest("base64url");
    const code = `${payload}.${signature}`;
    const base = this.linkBaseUrl.replace(/\/$/, "");
    const link: AffiliateLink = {
      id: stableId("aff_link", `${account.id}:${input.idempotencyKey}`),
      code,
      url: `${base}/r/${encodeURIComponent(code)}`,
      campaign: input.campaign?.trim() || null,
      createdAt: input.occurredAt.toISOString(),
    };
    account.links.push(link);
    if (link.campaign && !account.campaigns.includes(link.campaign)) account.campaigns.push(link.campaign);
    account.version += 1;
    account.updatedAt = input.occurredAt.toISOString();
    this.event(account.id, "link_issued", input.actor, { linkId: link.id, campaign: link.campaign }, input.occurredAt, input.idempotencyKey);
    return this.store(input.idempotencyKey, fp, link);
  }

  recordClick(input: {
    code: string;
    visitorKey: string;
    idempotencyKey: string;
    occurredAt: Date;
  }): AffiliateResult<{ affiliateId: string; linkId: string }> {
    return this.track(input, "click");
  }

  recordSignup(input: {
    code: string;
    visitorKey: string;
    idempotencyKey: string;
    occurredAt: Date;
  }): AffiliateResult<{ affiliateId: string; linkId: string }> {
    return this.track(input, "signup");
  }

  attributeOrder(input: {
    code: string;
    visitorKey: string;
    orderId: string;
    eligibleRevenueCents: number;
    actor: OperationsActor;
    idempotencyKey: string;
    occurredAt: Date;
  }): AffiliateResult<AttributionEvent> {
    const fp = this.fingerprint("attribute", input);
    const replay = this.replay<AttributionEvent>(input.idempotencyKey, fp);
    if (replay) return replay;
    if (input.actor.role !== "system") return this.failure("override_rejected", "Only the attribution service may select an order winner.");
    if (!opaqueSubject(input.visitorKey)) return this.failure("subject_not_opaque", "Visitor key must be opaque.");
    if (!Number.isInteger(input.eligibleRevenueCents) || input.eligibleRevenueCents < 0) {
      return this.failure("invalid_input", "Eligible revenue must use whole non-negative cents.");
    }
    if (this.attributions.some((event) => event.orderId === input.orderId)) {
      return this.failure("attribution_locked", "This order already has an immutable attribution winner.");
    }
    const verified = this.verifyCode(input.code);
    if (!verified.ok) return verified;
    const account = verified.value.account;
    const link = verified.value.link;
    const event: AttributionEvent = {
      id: stableId("attr", input.orderId),
      orderId: input.orderId,
      affiliateId: account.id,
      linkId: link.id,
      campaign: link.campaign,
      kind: "attributed",
      actorId: input.actor.id,
      reason: null,
      occurredAt: input.occurredAt.toISOString(),
    };
    this.attributions.push(event);
    const metrics = this.metrics.get(account.id)!;
    metrics.orders += 1;
    metrics.eligibleRevenueCents += input.eligibleRevenueCents;
    this.event(account.id, "order", input.actor, { orderId: input.orderId, eligibleRevenueCents: input.eligibleRevenueCents }, input.occurredAt, input.idempotencyKey);
    return this.store(input.idempotencyKey, fp, event);
  }

  overrideAttribution(input: {
    orderId: string;
    affiliateId: string;
    reason: string;
    actor: OperationsActor;
    idempotencyKey: string;
    occurredAt: Date;
  }): AffiliateResult<AttributionEvent> {
    const fp = this.fingerprint("override", input);
    const replay = this.replay<AttributionEvent>(input.idempotencyKey, fp);
    if (replay) return replay;
    if (input.actor.role !== "admin" || !input.reason.trim()) {
      return this.failure("override_rejected", "Only an admin with an audit reason may override attribution.");
    }
    const original = [...this.attributions].reverse().find((event) => event.orderId === input.orderId);
    const account = this.accounts.get(input.affiliateId);
    if (!original || !account) return this.failure("not_found", "Order attribution or affiliate not found.");
    const event: AttributionEvent = {
      id: stableId("attr_override", `${input.orderId}:${input.idempotencyKey}`),
      orderId: input.orderId,
      affiliateId: input.affiliateId,
      linkId: original.linkId,
      campaign: original.campaign,
      kind: "manual_override",
      actorId: input.actor.id,
      reason: input.reason.trim(),
      occurredAt: input.occurredAt.toISOString(),
    };
    this.attributions.push(event);
    this.event(account.id, "attribution_override", input.actor, { orderId: input.orderId, reason: event.reason }, input.occurredAt, input.idempotencyKey);
    return this.store(input.idempotencyKey, fp, event);
  }

  recordRevenueAdjustment(input: {
    affiliateId: string;
    kind: "refund" | "chargeback";
    amountCents: number;
    actor: OperationsActor;
    idempotencyKey: string;
    occurredAt: Date;
  }): AffiliateResult<AffiliateMetricSnapshot> {
    const fp = this.fingerprint("revenue_adjustment", input);
    const replay = this.replay<AffiliateMetricSnapshot>(input.idempotencyKey, fp);
    if (replay) return replay;
    if (input.actor.role !== "system") return this.failure("forbidden", "Only provider-backed events may adjust revenue.");
    if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
      return this.failure("invalid_input", "Adjustment must use positive whole cents.");
    }
    const metrics = this.metrics.get(input.affiliateId);
    if (!metrics) return this.failure("not_found", "Affiliate not found.");
    if (input.kind === "refund") metrics.refundsCents += input.amountCents;
    else metrics.chargebacksCents += input.amountCents;
    this.event(input.affiliateId, input.kind, input.actor, { amountCents: input.amountCents }, input.occurredAt, input.idempotencyKey);
    const account = this.accounts.get(input.affiliateId)!;
    const snapshot = this.dashboard(account).metrics;
    return this.store(input.idempotencyKey, fp, snapshot);
  }

  flagFraud(input: {
    affiliateId: string;
    reason: AffiliateFraudFlag["reason"];
    severity: AffiliateFraudFlag["severity"];
    detail: string;
    actor: OperationsActor;
    idempotencyKey: string;
    occurredAt: Date;
  }): AffiliateResult<AffiliateFraudFlag> {
    const fp = this.fingerprint("fraud", input);
    const replay = this.replay<AffiliateFraudFlag>(input.idempotencyKey, fp);
    if (replay) return replay;
    if (!roleCan(input.actor.role, "affiliate:review")) return this.failure("forbidden", "This role cannot create fraud flags.");
    if (!this.accounts.has(input.affiliateId) || !input.detail.trim()) return this.failure("invalid_input", "Affiliate and detail are required.");
    const flag: AffiliateFraudFlag = {
      id: stableId("fraud", `${input.affiliateId}:${input.idempotencyKey}`),
      affiliateId: input.affiliateId,
      reason: input.reason,
      severity: input.severity,
      status: "open",
      detail: input.detail.trim(),
      createdAt: input.occurredAt.toISOString(),
      resolvedAt: null,
    };
    this.fraudFlags.push(flag);
    return this.store(input.idempotencyKey, fp, flag);
  }

  listFraud(actor: OperationsActor): AffiliateResult<AffiliateFraudFlag[]> {
    if (!roleCan(actor.role, "affiliate:review")) return this.failure("forbidden", "This role cannot read fraud flags.");
    return { ok: true, value: clone(this.fraudFlags), idempotent: true };
  }

  listEvents(actor: OperationsActor): AffiliateResult<AffiliateEvent[]> {
    if (!roleCan(actor.role, "audit:read")) return this.failure("forbidden", "This role cannot read affiliate audit.");
    return { ok: true, value: clone(this.events), idempotent: true };
  }

  listAttributions(actor: OperationsActor): AffiliateResult<AttributionEvent[]> {
    if (!roleCan(actor.role, "audit:read")) return this.failure("forbidden", "This role cannot read attribution audit.");
    return { ok: true, value: clone(this.attributions), idempotent: true };
  }

  private track(
    input: { code: string; visitorKey: string; idempotencyKey: string; occurredAt: Date },
    kind: "click" | "signup",
  ): AffiliateResult<{ affiliateId: string; linkId: string }> {
    const fp = this.fingerprint(kind, input);
    const replay = this.replay<{ affiliateId: string; linkId: string }>(input.idempotencyKey, fp);
    if (replay) return replay;
    if (!opaqueSubject(input.visitorKey)) return this.failure("subject_not_opaque", "Visitor key must be opaque.");
    const verified = this.verifyCode(input.code);
    if (!verified.ok) return verified;
    const account = verified.value.account;
    const link = verified.value.link;
    const metrics = this.metrics.get(account.id)!;
    const visitorDigest = sha(input.visitorKey);
    if (kind === "click") {
      metrics.clicks += 1;
      metrics.visitorDigests.add(visitorDigest);
    } else {
      metrics.signupDigests.add(visitorDigest);
    }
    this.event(account.id, kind, null, { linkId: link.id, campaign: link.campaign }, input.occurredAt, input.idempotencyKey);
    return this.store(input.idempotencyKey, fp, { affiliateId: account.id, linkId: link.id });
  }

  private verifyCode(code: string): AffiliateResult<{ account: AffiliateAccount; link: AffiliateLink }> {
    if (!this.linkSecret) return this.failure("link_secret_missing", "Affiliate link signing is not configured.");
    const parts = code.split(".");
    if (parts.length !== 3) return this.failure("invalid_code", "Affiliate code is invalid.");
    const [affiliateId, nonce, signature] = parts;
    const expected = createHmac("sha256", this.linkSecret).update(`${affiliateId}.${nonce}`).digest();
    let provided: Buffer;
    try {
      provided = Buffer.from(signature, "base64url");
    } catch {
      return this.failure("invalid_code", "Affiliate code is invalid.");
    }
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      return this.failure("invalid_code", "Affiliate code is invalid.");
    }
    const account = this.accounts.get(affiliateId);
    const link = account?.links.find((candidate) => candidate.code === code);
    if (!account || !link || account.state !== "active") return this.failure("invalid_code", "Affiliate code is inactive.");
    return { ok: true, value: { account, link }, idempotent: true };
  }

  private dashboard(account: AffiliateAccount): AffiliateDashboard {
    const metrics = this.metrics.get(account.id)!;
    const commission = this.commission.get(account.id)!;
    return {
      id: account.id,
      state: account.state,
      code: account.customCode,
      links: clone(account.links),
      campaigns: clone(account.campaigns),
      metrics: {
        clicks: metrics.clicks,
        uniqueVisitors: metrics.visitorDigests.size,
        qualifiedSignups: metrics.signupDigests.size,
        orders: metrics.orders,
        conversionRate: metrics.visitorDigests.size ? metrics.orders / metrics.visitorDigests.size : 0,
        eligibleRevenueCents: metrics.eligibleRevenueCents,
        refundsCents: metrics.refundsCents,
        chargebacksCents: metrics.chargebacksCents,
      },
      commission: {
        pendingCents: commission.pendingCents,
        approvedCents: commission.approvedCents,
        payableCents: commission.payableCents,
        paidCents: commission.paidCents,
        reversedCents: commission.reversedCents,
      },
      payoutHistory: clone(commission.payouts),
    };
  }

  private event(
    affiliateId: string,
    kind: AffiliateEventKind,
    actor: OperationsActor | null,
    detail: AffiliateEvent["detail"],
    occurredAt: Date,
    key: string,
  ): void {
    this.events.push({
      id: stableId("aff_evt", `${affiliateId}:${key}`),
      affiliateId,
      kind,
      actorId: actor?.id ?? "public",
      actorRole: actor?.role ?? "public",
      detail: clone(detail),
      occurredAt: occurredAt.toISOString(),
    });
  }

  private fingerprint(action: string, input: unknown): string {
    return sha(JSON.stringify({ action, input }));
  }

  private replay<T>(key: string, fp: string): AffiliateResult<T> | null {
    const prior = this.commands.get(key);
    if (!prior) return null;
    if (prior.fingerprint !== fp) return this.failure("idempotency_conflict", "That key belongs to another affiliate command.");
    return { ok: true, value: clone(prior.value as T), idempotent: true };
  }

  private store<T>(key: string, fp: string, value: T): AffiliateResult<T> {
    this.commands.set(key, { fingerprint: fp, value: clone(value) });
    return { ok: true, value: clone(value), idempotent: false };
  }

  private failure(
    code: Extract<AffiliateResult<never>, { ok: false }>["code"],
    message: string,
  ): AffiliateResult<never> {
    return { ok: false, code, message };
  }
}
