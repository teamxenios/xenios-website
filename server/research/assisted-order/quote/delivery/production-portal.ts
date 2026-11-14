import type { Express, Request, RequestHandler } from "express";
import type pg from "pg";
import { registerPrivateQuoteDispatch } from "../../../outbox";
import { EARLY_ACCESS_PRODUCT_POLICY_AGREEMENT } from "../../../policies-data";
import type { RequestIntentDetail, RequestIntentLine } from "../../../../../shared/research/assisted-order/request-intent";
import { sha256AssistedOrderHasher as hash } from "../../defaults";
import type { AssistedOrderViewer } from "../../ports";
import type { AssistedOrderProductionWiring } from "../../production-deps";
import { requestIntentQuoteOwnerReader } from "../../request-intent/quote-owner-reader";
import { requestIntentStaffReader } from "../../request-intent/rpc-repository";
import { AssistedOrderQuoteService } from "../service";
import { bindReviewedXriQuoteLines, type XriApprovedLineBinding } from "../xri-line-bindings";
import { attachApprovedPrivateQuotes } from "./compose.mjs";
import { resendTransport, TEAM } from "./mail.mjs";
import { pgTransactions, type QuoteQuery } from "./pg.mjs";
import {
  isPrivateQuoteProduction, mountProductionQuoteConnection, PRODUCTION_QUOTE_ORIGIN, PRODUCTION_QUOTE_TENANT,
} from "./production";

// Member-only production private quotes. Nothing here is reachable unless the
// production connection gate, a separate desk flag, verified mail
// prerequisites, a configured issuer and a trusted line-clearance reader are
// all present. Guest recipients are never resolved.
export const PRODUCTION_QUOTE_SELLER = "team-xenios";
const SELLER_LABEL = "Team Xenios";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EVIDENCE_ID = /^[-a-zA-Z0-9_.:]{1,180}$/;
const MAX_VALIDITY_MS = 30 * 86400_000;
const MAX_OWNER_PAGES = 50;
const MAX_UNIT_PRICE_CENTS = 10_000_000;

type VerifyAccount = (userId: string) => Promise<{ email: string; confirmedAt: string } | null>;
type MemberRow = Readonly<{ id: string; authUserId: string | null; email: string; status: string }>;
type BindingResolution =
  | Readonly<{ ok: true; binding: Readonly<{ memberId: string }> }>
  | Readonly<{ ok: false }>;

/** Exact current reviewed evidence for one XRI line and seller, or null. */
export type QuoteLineClearanceScope = Readonly<{
  xriId: string; seller: string; lineId: string; productId: string; variantId: string;
  sourceVariantId: string; catalogVersion: string; quantity: number;
}>;
/**
 * The approved price is part of the clearance: staff never supply an amount.
 * The evidence ID should change whenever price authorization changes; the
 * composition also folds the price into the bound evidence identity, so a
 * changed price re-tags the line and suppresses an older quote either way.
 */
export type QuoteLineClearance = QuoteLineClearanceScope & Readonly<{
  approvalEvidenceId: string; unitPriceCents: number; currency: "USD";
}>;
export type QuoteLineClearanceReader = Readonly<{
  cleared(scope: QuoteLineClearanceScope): Promise<QuoteLineClearance | null>;
}>;

/** Server-owned directories. Each is canonical; none takes browser or staff input as authority. */
export type ProductionQuoteDirectories = Readonly<{
  /** `public.research_members` rows whose email equals the normalized address (at most 2 needed). */
  membersByEmail(email: string): Promise<readonly MemberRow[]>;
  /** The canonical member legal-binding directory (M62/M67). */
  bindings: Readonly<{
    customerRefsForHistory(memberId: string): Promise<Readonly<{ refs: readonly string[]; complete: boolean }>>;
    forCustomer(customerRef: string): Promise<BindingResolution>;
  }>;
  /** Absent means no production evidence source: the desk stays closed. */
  clearance: QuoteLineClearanceReader | null;
}>;

/** The stable issue-line identity staff send for one XRI source line. */
export function productionQuoteLineId(xriId: string, productId: string, variantId: string): string {
  return "ln-" + hash.stableHash(["xri-quote-line", xriId, productId, variantId]);
}
export const memberOwnerHash = (authUserId: string) =>
  hash.stableHash(["request-intent-owner", "member", authUserId]);
const normalizeEmail = (value: unknown) => typeof value === "string" ? value.trim().toLowerCase() : "";

type OwnerReader = Readonly<{
  owns(ownerHash: string, requestId: string): Promise<boolean>;
  list(ownerHash: string, afterId?: string | null): Promise<readonly string[]>;
}>;
type StaffReader = Readonly<{ get(requestId: string, actorId: string): Promise<RequestIntentDetail | null> }>;
type ScopedViewer = { tenant?: string; subject?: string; earlyAccessSessionHash?: string | null };

export type ProductionQuoteAuthorityDeps = Readonly<{
  tenant: string;
  issuerId: string;
  adminEmail: string;
  deliveryEnabled: boolean;
  requiredAgreements: readonly Readonly<{ kind: string; version: string }>[];
  agreementGate: Readonly<{ accepted(customerRef: string): Promise<boolean> }>;
  verifyAccount: VerifyAccount;
  owners: OwnerReader;
  staffReader: StaffReader;
  directories: ProductionQuoteDirectories & { clearance: QuoteLineClearanceReader };
  now?: () => number;
}>;

/**
 * Every decision the desk delegates, built from injected canonical readers so
 * each denial can be tested without a database. Any reader error propagates:
 * an unreadable directory is never treated as an answer.
 */
export function createProductionQuoteAuthority(deps: ProductionQuoteAuthorityDeps) {
  const { tenant, issuerId, adminEmail, directories, owners, staffReader, verifyAccount, agreementGate } = deps;
  const now = deps.now ?? Date.now;
  const currentPolicy = deps.requiredAgreements;

  const issuerIsCurrent = async () => {
    const issuer = await verifyAccount(issuerId);
    return !!adminEmail && issuer?.email === adminEmail;
  };

  /** One verified binding of this member, with live standing; anything else is ambiguous. */
  async function standingRef(memberId: string): Promise<string | null> {
    const read = await directories.bindings.customerRefsForHistory(memberId);
    if (read.complete !== true || !Array.isArray(read.refs) || read.refs.length === 0) return null;
    const verified: string[] = [];
    for (const ref of read.refs) {
      const resolution = await directories.bindings.forCustomer(ref);
      // An alias resolves to its primary handle and is refused here; only the
      // primary handle bound to this exact member counts.
      if (resolution.ok === true && resolution.binding.memberId === memberId) verified.push(ref);
    }
    if (verified.length !== 1) return null;
    return await agreementGate.accepted(verified[0]) === true ? verified[0] : null;
  }

  /** The request's stored contact, resolved to exactly one active, confirmed, owning member. */
  async function recipientFor(intent: RequestIntentDetail) {
    const email = normalizeEmail(intent.contact?.email);
    if (!email) return null;
    const rows = await directories.membersByEmail(email);
    if (!Array.isArray(rows) || rows.length !== 1) return null;
    const member = rows[0];
    if (member.status !== "active" || normalizeEmail(member.email) !== email ||
        typeof member.id !== "string" || !UUID.test(member.id) ||
        typeof member.authUserId !== "string" || !UUID.test(member.authUserId)) return null;
    const account = await verifyAccount(member.authUserId);
    if (!account?.confirmedAt || account.email !== email) return null;
    const ownerHash = memberOwnerHash(member.authUserId);
    // A guest request carrying the same address has a session owner hash and fails here.
    if (!await owners.owns(ownerHash, intent.requestId)) return null;
    return { email, ownerHash, memberId: member.id, authUserId: member.authUserId, confirmedAt: account.confirmedAt };
  }

  async function clearedBindings(intent: RequestIntentDetail, seller: string) {
    const lines: { line: RequestIntentLine; lineId: string; approvalEvidenceId: string; unitPriceCents: number }[] = [];
    for (const line of intent.lines) {
      if (line.clinicalReviewRequired !== false || line.sourceRefusal !== null) continue;
      const scope: QuoteLineClearanceScope = Object.freeze({
        xriId: intent.requestId, seller, lineId: productionQuoteLineId(intent.requestId, line.productId, line.variantId),
        productId: line.productId, variantId: line.variantId, sourceVariantId: line.sourceVariantId,
        catalogVersion: line.catalogVersion, quantity: line.quantity,
      });
      const evidence = await directories.clearance.cleared(scope);
      if (!evidence || typeof evidence.approvalEvidenceId !== "string" || !EVIDENCE_ID.test(evidence.approvalEvidenceId) ||
          evidence.currency !== "USD" || !Number.isSafeInteger(evidence.unitPriceCents) ||
          evidence.unitPriceCents <= 0 || evidence.unitPriceCents > MAX_UNIT_PRICE_CENTS) continue;
      const exact = (Object.keys(scope) as (keyof QuoteLineClearanceScope)[]).every(k => evidence[k] === scope[k]);
      if (exact) lines.push({ line, lineId: scope.lineId, unitPriceCents: evidence.unitPriceCents,
        approvalEvidenceId: "ev-" + hash.stableHash([evidence.approvalEvidenceId, evidence.unitPriceCents, evidence.currency]) });
    }
    return lines;
  }

  async function loadScope(xriId: string, seller: string) {
    if (seller !== PRODUCTION_QUOTE_SELLER || typeof xriId !== "string" || !UUID.test(xriId) || !await issuerIsCurrent()) return null;
    const intent = await staffReader.get(xriId, issuerId);
    if (!intent || intent.requestId !== xriId || !Array.isArray(intent.lines) || !Array.isArray(intent.agreements) ||
        !currentPolicy.every(p => intent.agreements.some(a => a.kind === p.kind && a.version === p.version))) return null;
    const recipient = await recipientFor(intent);
    if (!recipient || !await standingRef(recipient.memberId)) return null;
    const cleared = await clearedBindings(intent, seller);
    const targetId = `q-${seller}-${xriId}`;
    return {
      tenant, intent, currentStanding: true, recipient,
      // The cleared price is the line's only price: the engine refuses any
      // amount a staff body restates for a priced line.
      target: { requestId: targetId, sellerId: seller, lines: cleared.map(({ line, lineId, unitPriceCents }) => ({
        lineId, productId: line.productId, variantId: line.variantId, productName: line.productName,
        specification: line.specification, quantity: line.quantity, unitPriceCents, currency: "USD" as const,
      })) },
      binding: { requestId: targetId, publicReference: intent.publicReference,
        actorMemberId: null, earlyAccessSessionHash: recipient.ownerHash, normalizedEmail: null },
      bindings: cleared.map(({ line, lineId, approvalEvidenceId }): XriApprovedLineBinding => ({
        xriRequestId: xriId, xriReference: intent.publicReference, issueRequestId: targetId, issueLineId: lineId,
        sellerId: seller, approvalEvidenceId, clearedForQuotation: true, source: line })),
      contact: { email: recipient.email, requestId: xriId, verified: true, deliveryAllowed: true,
        revision: hash.stableHash([recipient.memberId, recipient.authUserId, recipient.confirmedAt, recipient.email]) },
    };
  }

  async function customerPrincipal(viewer: AssistedOrderViewer) {
    // Members only. The viewer resolver sets the handle only when the durable
    // directory binds it to this authenticated member.
    if (viewer.actorType !== "member" || typeof viewer.memberId !== "string" || typeof viewer.authUserId !== "string" ||
        !UUID.test(viewer.authUserId) || !viewer.capabilities.has("assisted_orders:read_own") ||
        !viewer.earlyAccessCustomerRef) return null;
    if (await standingRef(viewer.memberId) !== viewer.earlyAccessCustomerRef) return null;
    return { ...viewer, tenant, memberId: null, earlyAccessSessionHash: memberOwnerHash(viewer.authUserId) };
  }

  /** Owned XRIs that have a quote target, walking the port's cursor from the last UUID it returned. */
  async function ownedRequests(viewer: ScopedViewer, directoryHits: (ids: readonly string[]) => Promise<readonly string[]>) {
    const ownerHash = viewer.earlyAccessSessionHash;
    if (viewer.tenant !== tenant || typeof ownerHash !== "string") return [];
    const found: { xriId: string; seller: string; sellerLabel: string; requestLineCount: number }[] = [];
    let cursor: string | null = null;
    for (let page = 0; ; page++) {
      if (page >= MAX_OWNER_PAGES) throw Error("Owned request listing exceeded its bound.");
      const ids = await owners.list(ownerHash, cursor);
      if (ids.length) {
        const hits = new Set(await directoryHits(ids));
        for (const xriId of ids) {
          if (!hits.has(xriId)) continue;
          const intent = await staffReader.get(xriId, issuerId);
          if (!intent || intent.requestId !== xriId) continue;
          found.push({ xriId, seller: PRODUCTION_QUOTE_SELLER, sellerLabel: SELLER_LABEL, requestLineCount: intent.lines.length });
        }
      }
      if (ids.length < 100) return found;
      cursor = ids[ids.length - 1];
    }
  }

  function issueInput(body: unknown) {
    if (!body || typeof body !== "object" || Object.getPrototypeOf(body) !== Object.prototype) throw Error("Invalid issue.");
    const input = body as Record<string, unknown>;
    // The recipient, seller, tenant and evidence are never taken from the request.
    if (!Object.keys(input).every(k => ["xriId", "attempt", "expectedVersion", "validUntil", "lines"].includes(k))) throw Error("Invalid issue.");
    const until = typeof input.validUntil === "string" ? Date.parse(input.validUntil) : NaN;
    if (typeof input.xriId !== "string" || !UUID.test(input.xriId) || !Number.isFinite(until) ||
        until <= now() || until > now() + MAX_VALIDITY_MS) throw Error("Invalid issue.");
    // Lines name only the request line. Amounts and pricing bases come from clearance.
    if (!Array.isArray(input.lines) || input.lines.length === 0 || input.lines.length > 200 ||
        !input.lines.every(l => l && typeof l === "object" && Object.getPrototypeOf(l) === Object.prototype &&
          Object.keys(l).length === 1 && typeof (l as Record<string, unknown>).requestLineId === "string")) throw Error("Invalid issue.");
    return { xriId: input.xriId, seller: PRODUCTION_QUOTE_SELLER, attempt: input.attempt,
      expectedVersion: input.expectedVersion, validUntil: input.validUntil,
      lines: input.lines.map(l => ({ requestLineId: (l as { requestLineId: string }).requestLineId })) };
  }

  const authority = {
    async forIssue(_q: unknown, viewer: ScopedViewer, xriId: string, seller: string) {
      if (viewer.tenant !== tenant || viewer.subject !== issuerId) return null;
      const context = await loadScope(xriId, seller);
      return context && { ...context, issueAuthorized: true, notifyAuthorized: true };
    },
    async forCustomer(_q: unknown, viewer: ScopedViewer, xriId: string, seller: string) {
      if (viewer.tenant !== tenant || typeof viewer.earlyAccessSessionHash !== "string") return null;
      const context = await loadScope(xriId, seller);
      return context && context.recipient.ownerHash === viewer.earlyAccessSessionHash
        ? { ...context, customerAuthorized: true } : null;
    },
    async forDispatch(_q: unknown, job: { tenant: string; issuer: string; xriId: string; seller: string }) {
      if (!deps.deliveryEnabled || job.tenant !== tenant || job.issuer !== issuerId) return null;
      const context = await loadScope(job.xriId, job.seller);
      return context && { ...context, dispatchAuthorized: true };
    },
    // No receipt endpoint in this slice: an accepted send is never delivery proof.
    async verifiedDispatchEvidence() { return null; },
  };

  return { issuerIsCurrent, standingRef, recipientFor, loadScope, customerPrincipal, ownedRequests, issueInput, authority };
}

type Transact = <T>(tenant: string, key: string, work: (q: QuoteQuery) => Promise<T>) => Promise<T>;
/** Which of these owned XRIs have a production quote target, under the restricted role and tenant policy. */
export function quoteDirectoryHits(transact: Transact, tenant: string) {
  return (ids: readonly string[]) => transact(tenant, "directory-listing", async (q) =>
    (await q("SELECT xri_id FROM qd_directory WHERE tenant=$1 AND seller=$2 AND xri_id = ANY($3::text[])",
      [tenant, PRODUCTION_QUOTE_SELLER, [...ids]])).map((row) => String((row as { xri_id: unknown }).xri_id)));
}

/** Exact-email lookup with the same query shape as the access inspection directory. */
export function researchMembersByEmail(db: {
  from(table: "research_members"): { select(columns: string): { eq(column: "email", value: string): { limit(n: number): PromiseLike<{ data: unknown; error: unknown }> } } };
}) {
  return async (email: string): Promise<readonly MemberRow[]> => {
    const { data, error } = await db.from("research_members").select("id,email,auth_user_id,status").eq("email", email).limit(2);
    if (error || !Array.isArray(data)) throw Error("Member directory unavailable.");
    return data.map((row: Record<string, unknown>) => {
      if (typeof row.id !== "string" || typeof row.email !== "string" || typeof row.status !== "string" ||
          (row.auth_user_id !== null && typeof row.auth_user_id !== "string")) throw Error("Member directory unavailable.");
      return Object.freeze({ id: row.id, email: row.email, authUserId: row.auth_user_id as string | null, status: row.status });
    });
  };
}

/**
 * Production portal and issuer. Mounts nothing unless the production
 * connection is enabled AND `EA_PRIVATE_QUOTE_DESK_ENABLED === "true"` AND
 * mail delivery is approved and ready AND every canonical reader is present.
 * Returns true only when the desk was attached.
 */
export function mountProductionPrivateQuotePortal(
  app: Express, wiring: AssistedOrderProductionWiring,
  viewers: { customer(req: Request): Promise<AssistedOrderViewer> },
  requireAdmin: RequestHandler, verifyAccount: VerifyAccount,
  directories: ProductionQuoteDirectories,
  connect?: (config: pg.PoolConfig) => pg.Pool,
): boolean {
  const { env, supabaseRpc, agreementGate, requiredAgreements } = wiring;
  const pool = mountProductionQuoteConnection(app, env, requireAdmin, connect);
  if (!pool || !isPrivateQuoteProduction(env) || env.EA_PRIVATE_QUOTE_DESK_ENABLED !== "true") return false;
  const clearance = directories.clearance;
  if (!supabaseRpc || !agreementGate || !clearance || typeof clearance.cleared !== "function" ||
      !requiredAgreements?.some(({ kind, version }) =>
        kind === EARLY_ACCESS_PRODUCT_POLICY_AGREEMENT.kind && version === EARLY_ACCESS_PRODUCT_POLICY_AGREEMENT.version)) return false;
  const issuerId = env.EA_QUOTE_ISSUER_ID?.trim() ?? "";
  const adminEmail = env.ADMIN_EMAIL?.trim().toLowerCase() ?? "";
  const tag = env.EA_QUOTE_TAG_KEY ?? "";
  if (!UUID.test(issuerId) || !adminEmail || !/^[a-f0-9]{64}$/.test(tag)) return false;
  const transport = resendTransport({
    enabled: env.EA_PRIVATE_QUOTE_DELIVERY_APPROVED === "true", apiKey: env.RESEND_API_KEY,
    verifiedSender: TEAM, verifiedReplyTo: TEAM, portalVerified: true, portalOrigin: PRODUCTION_QUOTE_ORIGIN,
  });
  // No production paused mode: the desk is closed unless verified mail is ready.
  if (!transport.ready()) return false;

  const tenant = PRODUCTION_QUOTE_TENANT;
  const built = createProductionQuoteAuthority({
    tenant, issuerId, adminEmail, deliveryEnabled: true, requiredAgreements, agreementGate, verifyAccount,
    owners: requestIntentQuoteOwnerReader(supabaseRpc), staffReader: requestIntentStaffReader(supabaseRpc),
    directories: { ...directories, clearance },
  });
  // The customer listing intersects owned XRIs with the quote directory under
  // the same restricted role and tenant policy as every other quote read.
  const directoryHits = quoteDirectoryHits(pgTransactions(pool, { runtimeRole: "production" }), tenant);

  attachApprovedPrivateQuotes({
    enabled: true, router: app, pool, runtimeRole: "production", assumeStagingRuntimeRole: false,
    stageDispatchPaused: false, deferStagingNotice: false, transport, tagKey: Buffer.from(tag, "hex"),
    Engine: AssistedOrderQuoteService, bind: bindReviewedXriQuoteLines,
    async customerPrincipal(req: Request) { return built.customerPrincipal(await viewers.customer(req)); },
    staffGuard: requireAdmin,
    async ownedRequests(viewer: ScopedViewer) {
      return built.ownedRequests(viewer, directoryHits);
    },
    async staffPrincipal(req: Request & { adminEmail?: string }) {
      if (req.adminEmail?.trim().toLowerCase() !== adminEmail || !await built.issuerIsCurrent()) return null;
      return { tenant, subject: issuerId, actorLabel: issuerId, capabilities: new Set(["assisted_orders:manage"]) };
    },
    async csrfChecked(req: Request) {
      return req.get("origin") === PRODUCTION_QUOTE_ORIGIN && !!req.is("application/json") &&
        (!req.get("sec-fetch-site") || req.get("sec-fetch-site") === "same-origin");
    },
    async issueInput(req: Request) { return built.issueInput(req.body); },
    authority: built.authority,
    registerPrivateQuoteDispatch,
  });
  return true;
}
