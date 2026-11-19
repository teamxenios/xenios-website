import { randomUUID } from "node:crypto";
import type { Express, Request, Response, RequestHandler } from "express";
import { z } from "zod";
import { REFERRAL_API, safeReferralDestination, parseReferralSelector, normalizeReadableReferralCode, type RecommendationLink, type ReferralLifecycle } from "@shared/research/referral-v1";
import { decodeJwtClaims } from "../member-auth";
import type { ReferralV1Link, ReferralV1Store } from "./referral-v1-store";
import {
  ATTRIBUTION_COOKIE_NAME, REFERRAL_VISITOR_COOKIE,
  referralSecretReady, referralPublicToken, referralDigest, createReferralVisitor,
  readReferralVisitor, sealReferralVisitor, referralSubject, referralCsrf,
  validReferralCsrf, referralCookie, readReferralCapture, sealReferralCapture,
} from "./referral-v1-tokens";

export interface ReferralV1Dependencies {
  enabled: boolean;
  secret: string | null;
  origin: string;
  store: ReferralV1Store;
  /** Uses the existing atomic durable limiter, with no memory fallback. */
  allowed(req: Request, action: "read" | "write" | "capture"): Promise<boolean>;
  lineage(bindings: Readonly<ReferralLifecycle["bindings"]>): Promise<ReferralLifecycle["lineage"]>;
  now?: () => number;
}
const uuid = z.string().uuid();
const codeBody = z.object({ code: z.string().max(512) }).strict();
const aliasBody = z.object({ linkId: uuid, code: z.string().max(128).transform(normalizeReadableReferralCode).refine((v): v is string => v !== null) }).strict();
const reassignAliasBody = aliasBody.extend({ expectedLinkId: uuid,
  reason: z.string().trim().min(3).max(200).refine(v => !/[\u0000-\u001f\u007f]/.test(v)),
}).strict().refine(v => v.expectedLinkId !== v.linkId);
const emptyBody = z.object({}).strict();
const issueBody = z.object({ destinationPath: z.string().max(240).refine((value) => safeReferralDestination(value) !== null) }).strict();
const transferBody = z.object({
  accountAuthUserId: uuid,
  expectedRevisionId: uuid,
  targetLinkId: uuid,
  reasonCode: z.enum(["customer_request", "documented_correction", "compliance_action"]),
  /** Digest of the separately controlled case/reference; never free-text PII. */
  authorizationReferenceHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

function secure(res: Response): Response {
  return res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" });
}
function deny(res: Response, reason: string): void {
  const status = reason === "unavailable" ? 503 : reason === "not_found" || reason === "invalid_link" || reason === "code_unavailable" ? 404
    : reason === "idempotency_conflict" || reason === "capture_claimed" || reason === "stale_binding" ? 409 : reason === "rate_limited" ? 429
    : reason === "invalid_input" ? 400 : 403;
  secure(res).status(status).json({ ok: false, code: reason, message: reason === "unavailable"
    ? "Recommendations are temporarily unavailable. You can still explore Xenios."
    : reason === "invalid_link" ? "This recommendation is not available. You can still explore Xenios."
    : reason === "code_unavailable" ? "This code is not currently available. Ask the person who shared it for an updated link, or continue without a referral."
    : "This action could not be completed. Refresh or contact support if it continues." });
}
function authId(req: Request): string | null {
  const member = (req as Request & { researchMember?: { auth_user_id?: unknown; status?: unknown } }).researchMember;
  return member && member.status !== "closed" && uuid.safeParse(member.auth_user_id).success ? member.auth_user_id as string : null;
}
function canonicalOrigin(input: string): string | null {
  try {
    const parsed = new URL(input);
    if (parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) return null;
    return parsed.protocol === "https:" || parsed.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) ? parsed.origin : null;
  } catch { return null; }
}
function sameOrigin(req: Request, origin: string): boolean {
  return req.get("origin") === origin && (!req.get("sec-fetch-site") || req.get("sec-fetch-site") === "same-origin");
}

export function createReferralV1Service(deps: ReferralV1Dependencies) {
  const now = deps.now ?? Date.now;
  const origin = canonicalOrigin(deps.origin);
  const configured = () => deps.enabled && referralSecretReady(deps.secret) && origin !== null;
  const linkDto = (link: ReferralV1Link): RecommendationLink => {
    const destinationPath = safeReferralDestination(link.destinationPath);
    const token = configured() ? referralPublicToken(deps.secret!, link.id, link.tokenKeyVersion) : null;
    const state = !destinationPath || !token || referralDigest(token) !== link.tokenHashHex ? "unavailable" : link.availability === "self_referral" ? "partner_inactive" : link.availability;
    return { id: link.id, url: state === "ready" ? `${origin}/r/${token}` : null,
      destinationPath: destinationPath ?? "/health", state, createdAt: link.createdAt, expiresAt: link.expiresAt,
      revokedAt: link.revokedAt, opens: link.captureCount, accountsLinked: link.bindingCount };
  };
  async function ready(): Promise<boolean> { return configured() && (await deps.store.authority()).ok; }
  async function selectorHash(value: string): Promise<{ ok: true; hash: string } | { ok: false; reason: "invalid_link" | "code_unavailable" | "unavailable" }> {
    const selector = parseReferralSelector(value, origin ?? undefined);
    if (!selector) return { ok: false, reason: "invalid_link" };
    if (selector.kind === "opaque") return { ok: true, hash: referralDigest(selector.value) };
    if (!deps.store.resolveReadableAlias) return { ok: false, reason: "unavailable" };
    const result = await deps.store.resolveReadableAlias({ code: selector.value });
    if (!result.ok) return { ok: false, reason: result.reason === "unavailable" ? "unavailable" : "code_unavailable" };
    const link = result.value.alias.link, token = referralPublicToken(deps.secret!, link.id, link.tokenKeyVersion);
    return token && result.value.alias.code === selector.value && referralDigest(token) === link.tokenHashHex
      ? { ok: true, hash: link.tokenHashHex } : { ok: false, reason: "unavailable" };
  }
  function memberCapture(req: Request) {
    const actorAuthUserId = authId(req);
    if (!actorAuthUserId || !configured()) return null;
    const visitor = readReferralVisitor(deps.secret!, req.headers.cookie, now());
    const claim = visitor && readReferralCapture(deps.secret!, req.headers.cookie, visitor, now());
    return claim ? { actorAuthUserId, claim } : null;
  }
  // Local preflight only: avoid consuming the durable capture budget during
  // unrelated member hydration. The existing guard supplies canonical identity;
  // the signed cookie remains only a locator, never database authority.
  function canBindMember(req: Request): boolean { return memberCapture(req) !== null; }
  async function bindMemberResult(req: Request): Promise<{ state: "bound" | "sign_in_required" | "not_bound"; conflictPreserved: boolean }> {
    if (!authId(req)) return { state: "sign_in_required", conflictPreserved: false };
    const capture = memberCapture(req);
    if (!capture) return { state: "not_bound", conflictPreserved: false };
    const { actorAuthUserId, claim } = capture;
    // The RPC re-reads link/partner state and touch ownership atomically. A signed
    // cookie is only a locator, never sufficient authority for a verified referrer.
    try {
      const result = await deps.store.bind({ actorAuthUserId, touchId: claim.touchId, subjectKeyHash: claim.subjectKeyHash });
      return {
        state: result.ok && result.value.binding && result.value.availability === "ready" ? "bound" : "not_bound",
        conflictPreserved: result.ok && result.value.conflictPreserved === true,
      };
    } catch { return { state: "not_bound", conflictPreserved: false }; }
  }
  async function bindMember(req: Request): Promise<"bound" | "sign_in_required" | "not_bound"> {
    return (await bindMemberResult(req)).state;
  }
  return { configured, ready, linkDto, selectorHash, canBindMember, bindMember, bindMemberResult, origin, now };
}

export function registerReferralV1Api(app: Express, deps: ReferralV1Dependencies, guards: {
  requireMember: RequestHandler; requireAdmin: RequestHandler;
}): ReturnType<typeof createReferralV1Service> {
  const service = createReferralV1Service(deps);
  function handler(action: "read" | "write" | "capture", run: (req: Request, res: Response) => Promise<void>): RequestHandler {
    return async (req, res) => {
      secure(res);
      try {
        if (!service.configured()) return deny(res, "unavailable");
        if (req.method !== "GET" && (!sameOrigin(req, service.origin!) || !req.is("application/json"))) return deny(res, "forbidden");
        if (!await deps.allowed(req, action)) return deny(res, "rate_limited");
        if (!await service.ready()) return deny(res, "unavailable");
        await run(req, res);
      } catch { deny(res, "unavailable"); }
    };
  }
  app.get(REFERRAL_API.readableAliases, guards.requireMember, handler("read", async (req, res) => {
    if (Object.keys(req.query).length) return deny(res, "invalid_input");
    const actorAuthUserId = authId(req);
    if (!actorAuthUserId || !deps.store.listReadableAliases) return deny(res, "unavailable");
    const result = await deps.store.listReadableAliases({ actorAuthUserId });
    if (!result.ok) return deny(res, result.reason);
    res.json({ ok: true, aliases: result.value.aliases.map(a => ({ code: a.code, assignedAt: a.assignedAt, link: service.linkDto(a.link) })) });
  }));
  app.post(REFERRAL_API.readableAliases, guards.requireMember, handler("write", async (req, res) => {
    const actorAuthUserId = authId(req), input = aliasBody.safeParse(req.body), key = uuid.safeParse(req.get("Idempotency-Key"));
    if (!actorAuthUserId || !input.success || !key.success) return deny(res, "invalid_input");
    if (!deps.store.assignReadableAlias) return deny(res, "unavailable");
    const result = await deps.store.assignReadableAlias({ actorAuthUserId, linkId: input.data.linkId, code: input.data.code!, idempotencyKey: key.data });
    if (!result.ok) return deny(res, result.reason);
    const a = result.value.alias;
    res.json({ ok: true, alias: { code: a.code, assignedAt: a.assignedAt, link: service.linkDto(a.link) }, created: result.value.created });
  }));
  app.post(REFERRAL_API.reassignReadableAlias, guards.requireMember, handler("write", async (req, res) => {
    const visitor = readReferralVisitor(deps.secret!, req.headers.cookie, service.now());
    if (!visitor || !validReferralCsrf(deps.secret!, visitor, req.get("X-Xenios-Referral-CSRF"))) return deny(res, "forbidden");
    if (Object.keys(req.query).length) return deny(res, "invalid_input");
    const actorAuthUserId = authId(req), input = reassignAliasBody.safeParse(req.body), key = uuid.safeParse(req.get("Idempotency-Key"));
    if (!input.success || !key.success || !actorAuthUserId) return deny(res, "invalid_input");
    if (!deps.store.reassignReadableAlias) return deny(res, "unavailable");
    const result = await deps.store.reassignReadableAlias({ actorAuthUserId, ...input.data, code: input.data.code!, idempotencyKey: key.data });
    if (!result.ok) return deny(res, result.reason);
    const a = result.value.alias;
    res.json({ ok: true, alias: { code: a.code, assignedAt: a.assignedAt, link: service.linkDto(a.link) },
      previousLinkId: result.value.previousLinkId, reassignedAt: result.value.reassignedAt, replayed: result.value.replayed });
  }));
  app.get(REFERRAL_API.links, guards.requireMember, handler("read", async (req, res) => {
    const actorAuthUserId = authId(req);
    if (!actorAuthUserId) return deny(res, "not_eligible");
    const result = await deps.store.listOwn({ actorAuthUserId });
    if (!result.ok) return deny(res, result.reason);
    res.json({ ok: true, eligible: result.value.eligible, links: result.value.links.map(service.linkDto) });
  }));
  app.post(REFERRAL_API.links, guards.requireMember, handler("write", async (req, res) => {
    const input = issueBody.safeParse(req.body);
    const key = uuid.safeParse(req.get("Idempotency-Key"));
    const actorAuthUserId = authId(req);
    if (!input.success || !key.success || !actorAuthUserId) return deny(res, "invalid_input");
    const linkId = randomUUID();
    const token = referralPublicToken(deps.secret!, linkId, 1)!;
    const result = await deps.store.issue({ actorAuthUserId, idempotencyKey: key.data, linkId,
      tokenHashHex: referralDigest(token), tokenKeyVersion: 1, destinationPath: input.data.destinationPath, expiresInDays: 30 });
    if (!result.ok) return deny(res, result.reason);
    res.json({ ok: true, link: service.linkDto(result.value.link) });
  }));
  app.post("/api/research/partner/links/:linkId/revoke", guards.requireMember, handler("write", async (req, res) => {
    const id = uuid.safeParse(req.params.linkId);
    const key = uuid.safeParse(req.get("Idempotency-Key"));
    const actorAuthUserId = authId(req);
    if (!emptyBody.safeParse(req.body).success || !id.success || !key.success || !actorAuthUserId) return deny(res, "invalid_input");
    const result = await deps.store.revoke({ actorAuthUserId, linkId: id.data, idempotencyKey: key.data });
    if (!result.ok) return deny(res, result.reason);
    res.json({ ok: true, link: service.linkDto(result.value.link) });
  }));
  app.post(REFERRAL_API.resolve, handler("read", async (req, res) => {
    const input = codeBody.safeParse(req.body);
    if (!input.success) return deny(res, "invalid_link");
    const selected = await service.selectorHash(input.data.code);
    if (!selected.ok) return deny(res, selected.reason);
    const result = await deps.store.resolve({ tokenHashHex: selected.hash });
    if (!result.ok) return deny(res, result.reason);
    const destinationPath = safeReferralDestination(result.value.link.destinationPath);
    if (!destinationPath || result.value.link.availability !== "ready") return deny(res, "invalid_link");
    res.json({ ok: true, valid: true, destinationPath, sharedBy: "an approved Xenios partner" });
  }));
  app.post(REFERRAL_API.bootstrap, handler("capture", async (req, res) => {
    if (!emptyBody.safeParse(req.body).success) return deny(res, "invalid_input");
    const visitor = readReferralVisitor(deps.secret!, req.headers.cookie, service.now()) ?? createReferralVisitor(service.now());
    res.setHeader("Set-Cookie", referralCookie(REFERRAL_VISITOR_COOKIE, sealReferralVisitor(deps.secret!, visitor), visitor.expiresAt, service.now(), service.origin!.startsWith("https:")));
    res.json({ ok: true, csrfToken: referralCsrf(deps.secret!, visitor) });
  }));
  const optionalMember: RequestHandler = (req, res, next) => {
    if (req.headers.authorization) return guards.requireMember(req, res, next);
    next();
  };
  app.post(REFERRAL_API.capture, optionalMember, handler("capture", async (req, res) => {
    const input = codeBody.safeParse(req.body);
    const visitor = readReferralVisitor(deps.secret!, req.headers.cookie, service.now());
    if (!input.success) return deny(res, "invalid_link");
    if (!visitor || !validReferralCsrf(deps.secret!, visitor, req.get("X-Xenios-Referral-CSRF"))) return deny(res, "forbidden");
    const selected = await service.selectorHash(input.data.code);
    if (!selected.ok) return deny(res, selected.reason);
    const tokenHashHex = selected.hash;
    const resolved = await deps.store.resolve({ tokenHashHex });
    if (!resolved.ok) return deny(res, resolved.reason);
    const destinationPath = safeReferralDestination(resolved.value.link.destinationPath);
    if (!destinationPath) return deny(res, "invalid_link");
    const actorAuthUserId = authId(req);
    const result = await deps.store.capture({ tokenHashHex, subjectKeyHash: referralSubject(deps.secret!, visitor), ...(actorAuthUserId ? { actorAuthUserId } : {}) });
    if (!result.ok) return deny(res, result.reason);
    const { touch, availability } = result.value;
    const conflictPreserved = result.value.conflictPreserved === true;
    let accountBinding: "bound" | "sign_in_required" | "not_bound" = actorAuthUserId ? "not_bound" : "sign_in_required";
    let bindingConflictPreserved = false;
    if (availability === "ready") {
      const expiresAt = Math.min(Date.parse(touch.expiresAt), visitor.expiresAt);
      // Exactly the durable winning touch is signed; never the proposed link.
      const claim = sealReferralCapture(deps.secret!, { touchId: touch.touchId, subjectKeyHash: touch.subjectKeyHash, expiresAt });
      res.setHeader("Set-Cookie", referralCookie(ATTRIBUTION_COOKIE_NAME, claim, expiresAt, service.now(), service.origin!.startsWith("https:")));
      if (actorAuthUserId) {
        const binding = await deps.store.bind({ actorAuthUserId, touchId: touch.touchId, subjectKeyHash: touch.subjectKeyHash });
        if (binding.ok && binding.value.binding && binding.value.availability === "ready") accountBinding = "bound";
        bindingConflictPreserved = binding.ok && binding.value.conflictPreserved === true;
      }
    }
    res.json({ ok: true, destinationPath, accountBinding,
      attribution: availability === "ready" ? "recognized" : availability === "self_referral" ? "self_referral" : "retained_ineligible",
      conflictPreserved, bindingConflictPreserved });
  }));
  app.post(REFERRAL_API.bind, guards.requireMember, handler("capture", async (req, res) => {
    if (!emptyBody.safeParse(req.body).success) return deny(res, "invalid_input");
    const visitor = readReferralVisitor(deps.secret!, req.headers.cookie, service.now());
    if (!visitor || !validReferralCsrf(deps.secret!, visitor, req.get("X-Xenios-Referral-CSRF"))) return deny(res, "forbidden");
    const binding = await service.bindMemberResult(req);
    res.json({ ok: true, accountBinding: binding.state, conflictPreserved: binding.conflictPreserved });
  }));
  app.post(REFERRAL_API.adminTransfer, guards.requireAdmin, handler("write", async (req, res) => {
    const input = transferBody.safeParse(req.body);
    const idempotencyKey = uuid.safeParse(req.get("Idempotency-Key"));
    const jwt = req.headers.authorization?.slice(7) ?? "";
    const adminAuthUserId = decodeJwtClaims(jwt)?.sub;
    if (!input.success || !idempotencyKey.success || !uuid.safeParse(adminAuthUserId).success) return deny(res, "invalid_input");
    const result = await deps.store.transferBinding({ adminAuthUserId: adminAuthUserId as string, idempotencyKey: idempotencyKey.data, ...input.data });
    if (!result.ok) return deny(res, result.reason);
    const { authorizationReferenceHash: _privateReference, ...transfer } = result.value.transfer;
    res.json({ ok: true, binding: result.value.binding, transfer, created: result.value.created, policy: "future_only" });
  }));
  app.get(REFERRAL_API.admin, guards.requireAdmin, handler("read", async (req, res) => {
    // The canonical guard already verified this JWT with Supabase. Its signed
    // subject is used only after that guard, never as independent authentication.
    const jwt = req.headers.authorization?.slice(7) ?? "";
    const adminAuthUserId = decodeJwtClaims(jwt)?.sub;
    if (!uuid.safeParse(adminAuthUserId).success) return deny(res, "forbidden");
    const query = z.object({ partnerId: uuid.optional(), limit: z.coerce.number().int().min(1).max(100).optional() }).strict().safeParse(req.query);
    if (!query.success) return deny(res, "invalid_input");
    const result = await deps.store.listAdmin({ adminAuthUserId: adminAuthUserId as string, ...query.data });
    if (!result.ok) return deny(res, result.reason);
    const value = result.value;
    const links = value.links.map((link) => { const { url: _url, ...safe } = service.linkDto(link); return { ...safe, partnerId: link.partnerId }; });
    const bindings = value.bindings.map(({ accountKey, partnerId, linkId, touchId, boundAt, revisionId, effectiveAt, source, availability }) =>
      ({ accountKey, partnerId, linkId, touchId, boundAt, revisionId, effectiveAt, source, availability }));
    const touches = value.touches.map(({ touchId, linkId, partnerId, capturedAt, expiresAt, availability }) => ({ touchId, linkId, partnerId, capturedAt, expiresAt, availability }));
    const events = value.events.map(({ id, eventType, partnerId, linkId, occurredAt }) => ({ id, eventType, partnerId, linkId, occurredAt }));
    const transfers = (value.transfers ?? []).map(({ id, accountKey, previousRevisionId, previousPartnerId, previousLinkId, nextPartnerId, nextLinkId, reasonCode, effectiveAt }) =>
      ({ id, accountKey, previousRevisionId, previousPartnerId, previousLinkId, nextPartnerId, nextLinkId, reasonCode, effectiveAt }));
    res.json({ ok: true, links, bindings, touches, events, transfers, lineage: await deps.lineage(bindings),
      correctionsSupported: false, transfersSupported: true, transferPolicy: "future_only" });
  }));
  return service;
}
