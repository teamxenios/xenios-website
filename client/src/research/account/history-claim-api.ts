import { z } from "zod";
import { OrganizationRoleSchema, OrganizationStatusSchema } from "@shared/research/account-identity";
import { isRecoveryAccessToken } from "@/lib/supabaseBrowser";

export const HISTORY_CLAIM_PATH = "/research/account/claim-history";
const uuid = z.string().uuid().refine(value => value !== "00000000-0000-0000-0000-000000000000");
const customerRef = z.string().regex(/^eac_[a-f0-9]{32}$/);
const challenge = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const confirmation = z.object({ claimId: uuid, challengeToken: challenge, expectedSubjectType: z.literal("personal").default("personal") }).strict();
export type HistoryClaimConfirmation = Readonly<z.infer<typeof confirmation>>;
export interface HistoryClaimSession { actorAuthUserId: string; sessionId: string }
export interface HistoryClaimBinding extends HistoryClaimSession { accessToken: string }
export interface PersonalHistoryContext { actorAuthUserId: string; memberId: string; email: string }
export type HistoryClaimFailure = "signed_out" | "denied" | "password_required" | "invalid_claim" | "conflict" | "unavailable" | "stale";
export type HistoryClaimAttempt = { kind: "request"; reference: string; status: "pending" | "uncertain" }
  | { kind: "challenge"; reference: string; claimId: string; deliveryAccepted: boolean }
  | { kind: "confirm"; command: HistoryClaimConfirmation; reference?: string; status: "ready" | "pending" | "uncertain" }
  | { kind: "complete"; replayed: boolean } | { kind: "refused"; reason: HistoryClaimFailure };
export interface HistoryClaimOwner extends HistoryClaimSession { cartScope: string }
export type HistoryClaimLease = Readonly<object>;
export type HistoryClaimRun = Readonly<object>;
export const HISTORY_CLAIM_OPERATION_TTL_MS = 5 * 60_000;
export interface HistoryClaimExpiry { readonly wallDeadline: number; readonly monotonicDeadline: number }
export function captureHistoryClaimExpiry(): HistoryClaimExpiry {
  return Object.freeze({ wallDeadline: Date.now() + HISTORY_CLAIM_OPERATION_TTL_MS, monotonicDeadline: performance.now() + HISTORY_CLAIM_OPERATION_TTL_MS });
}
export function historyClaimExpiryRemaining(expiry: HistoryClaimExpiry): number {
  return Math.max(0, Math.min(expiry.wallDeadline - Date.now(), expiry.monotonicDeadline - performance.now()));
}

/** One inert operation across the existing guard's refresh unmount. This is
 * not Auth state: no bearer, session object, member/context data or IO lives
 * here. Only the canonical outer boundary can enable a verified owner again. */
export class HistoryClaimOperationCustodian {
  #owner: string | null = null;
  #record: { owner: string; lease: HistoryClaimLease; run: HistoryClaimRun | null; attempt: HistoryClaimAttempt;
    wallDeadline: number; monotonicDeadline: number } | null = null;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #version = 0;
  #listeners = new Set<() => void>();
  constructor(private readonly wall = () => Date.now(), private readonly monotonic = () => performance.now()) {}
  #key(owner: HistoryClaimOwner) { return owner.actorAuthUserId + ":" + owner.sessionId + ":" + owner.cartScope; }
  #valid() { return this.#record !== null && this.wall() < this.#record.wallDeadline && this.monotonic() < this.#record.monotonicDeadline; }
  #publish() { this.#version++; for (const listener of this.#listeners) { try { listener(); } catch { /* No observer authority. */ } } }
  #drop() { clearTimeout(this.#timer); this.#timer = undefined; this.#record = null; }
  subscribe = (listener: () => void) => { this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; };
  snapshot = () => this.#version;
  observe(owner: HistoryClaimOwner | "checking" | null) {
    const key = owner && owner !== "checking" ? this.#key(owner) : null;
    if (owner === null || (key && this.#record && this.#record.owner !== key) || (this.#record && !this.#valid())) this.#drop();
    this.#owner = key; this.#publish();
  }
  retire() { this.#owner = null; this.#drop(); this.#publish(); }
  admitted(owner: HistoryClaimOwner) { return this.#owner === this.#key(owner); }
  restore(owner: HistoryClaimOwner): HistoryClaimLease | null {
    return this.#valid() && this.#record?.owner === this.#key(owner) ? this.#record.lease : null;
  }
  read(lease: HistoryClaimLease): HistoryClaimAttempt | null { return this.#valid() && this.#record?.lease === lease ? this.#record.attempt : null; }
  #create(owner: HistoryClaimOwner, attempt: HistoryClaimAttempt, run: HistoryClaimRun | null, expiry?: HistoryClaimExpiry) {
    this.#record = { owner: this.#key(owner), lease: Object.freeze({}), run, attempt: Object.freeze(attempt),
      wallDeadline: Math.min(expiry?.wallDeadline ?? Infinity, this.wall() + HISTORY_CLAIM_OPERATION_TTL_MS),
      monotonicDeadline: Math.min(expiry?.monotonicDeadline ?? Infinity, this.monotonic() + HISTORY_CLAIM_OPERATION_TTL_MS) };
    const lease = this.#record.lease;
    const remaining = Math.max(0, Math.min(this.#record.wallDeadline - this.wall(), this.#record.monotonicDeadline - this.monotonic()));
    this.#timer = setTimeout(() => { if (this.#record?.lease !== lease) return; this.#drop(); this.#publish(); }, remaining);
    return lease;
  }
  retain(owner: HistoryClaimOwner, attempt: HistoryClaimAttempt, expiry?: HistoryClaimExpiry): HistoryClaimLease | null {
    if (!this.admitted(owner) || attempt.kind !== "confirm" || attempt.status !== "ready") return null;
    if (expiry && (this.wall() >= expiry.wallDeadline || this.monotonic() >= expiry.monotonicDeadline)) return null;
    if (this.#record && !this.#valid()) { this.#drop(); this.#publish(); return null; }
    if (this.#record) return this.#record.owner === this.#key(owner) ? this.#record.lease : null;
    const command = freezeHistoryConfirmation(attempt.command);
    if (!command) return null;
    const lease = this.#create(owner, { ...attempt, command }, null, expiry); this.#publish(); return lease;
  }
  start(owner: HistoryClaimOwner, attempt: HistoryClaimAttempt, expectedLease?: HistoryClaimLease): { lease: HistoryClaimLease; run: HistoryClaimRun } | null {
    if (!this.admitted(owner) || (attempt.kind !== "request" && attempt.kind !== "confirm")) return null;
    if (expectedLease !== undefined && (!this.#valid() || this.#record?.lease !== expectedLease)) return null;
    if (attempt.status !== "pending") return null;
    if (attempt.kind === "request" && !customerRef.safeParse(attempt.reference).success) return null;
    if (attempt.kind === "confirm") {
      const command = freezeHistoryConfirmation(attempt.command); if (!command) return null;
      attempt = { ...attempt, command };
    }
    if (this.#record && !this.#valid()) { this.#drop(); this.#publish(); return null; }
    const old = this.#record;
    if (old) {
      if (old.owner !== this.#key(owner) || old.run) return null;
      if (attempt.kind !== "confirm") return null;
      const previous = old.attempt;
      if (previous.kind === "confirm") {
        if ((previous.status !== "uncertain" && previous.status !== "ready") || JSON.stringify(previous.command) !== JSON.stringify(attempt.command) || previous.reference !== attempt.reference) return null;
      } else if (previous.kind !== "challenge" || previous.claimId !== attempt.command.claimId || previous.reference !== attempt.reference) return null;
    }
    const run = Object.freeze({});
    if (!old) this.#create(owner, attempt, run);
    else { old.run = run; old.attempt = Object.freeze(attempt); }
    const lease = this.#record!.lease; this.#publish(); return { lease, run };
  }
  settle(run: HistoryClaimRun, attempt: HistoryClaimAttempt) {
    const record = this.#record;
    if (!record || record.run !== run || !this.#valid()) return false;
    if ((attempt.kind === "complete" || attempt.kind === "challenge") && this.#owner !== record.owner) {
      if (record.attempt.kind !== "confirm" && record.attempt.kind !== "request") return false;
      attempt = { ...record.attempt, status: "uncertain" };
    }
    if (attempt.kind === "confirm") {
      if (record.attempt.kind !== "confirm" || JSON.stringify(record.attempt.command) !== JSON.stringify(attempt.command)
        || record.attempt.reference !== attempt.reference) return false;
      attempt = { ...attempt, command: record.attempt.command };
    }
    record.run = null; record.attempt = Object.freeze(attempt); this.#publish(); return true;
  }
}
export class HistoryClaimApiError extends Error {
  constructor(readonly kind: HistoryClaimFailure) { super("The history claim could not be confirmed."); }
}

/** Unverified claims partition local work only; the server authenticates every request. */
export function historyClaimSession(token: unknown): HistoryClaimSession | null {
  if (typeof token !== "string" || token.length > 16_384 || isRecoveryAccessToken(token)) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || !parts.every(part => /^[A-Za-z0-9_-]+$/.test(part))) return null;
  try {
    const middle = parts[1].replaceAll("-", "+").replaceAll("_", "/");
    const claims = JSON.parse(atob(middle.padEnd(Math.ceil(middle.length / 4) * 4, "=")));
    const parsed = z.object({ sub: uuid, session_id: uuid }).safeParse(claims);
    return parsed.success ? { actorAuthUserId: parsed.data.sub.toLowerCase(), sessionId: parsed.data.session_id.toLowerCase() } : null;
  } catch { return null; }
}
export function freezeHistoryConfirmation(value: unknown): HistoryClaimConfirmation | null {
  const parsed = confirmation.safeParse(value);
  return parsed.success ? Object.freeze(parsed.data) : null;
}
export type HistoryClaimLink = { kind: "none" | "invalid" | "foreign" | "unavailable" } | { kind: "ready"; command: HistoryClaimConfirmation };
/** Exact emailed shape; navigation hints/fragments never accompany the credential. */
export function parseHistoryClaimLink(pathname: string, search: string, hash = ""): HistoryClaimLink {
  if (pathname !== HISTORY_CLAIM_PATH) return { kind: "foreign" };
  if (!search && !hash) return { kind: "none" };
  if (search.length > 600 || hash) return { kind: "invalid" };
  const values = new URLSearchParams(search), keys = [...values.keys()];
  if (keys.length !== 2 || values.getAll("claim").length !== 1 || values.getAll("token").length !== 1) return { kind: "invalid" };
  const command = freezeHistoryConfirmation({ claimId: values.get("claim"), challengeToken: values.get("token") });
  return command ? { kind: "ready", command } : { kind: "invalid" };
}

const contextSchema = z.object({
  ok: z.literal(true), auth: z.object({ userId: uuid, email: z.string().email().max(254), emailVerified: z.literal(true) }).strict(),
  personal: z.object({ memberId: uuid, firstName: z.string().max(200), lastName: z.string().max(200), status: z.string().max(80) }).strict().nullable(),
  organizations: z.array(z.object({ id: uuid, slug: z.string().max(200), legalName: z.string().max(200), displayName: z.string().max(200),
    status: OrganizationStatusSchema, roles: z.array(OrganizationRoleSchema).max(4), passwordChangeRequired: z.boolean() }).strict()).max(100),
  security: z.object({ passwordChangeRequired: z.boolean(), mfaAvailable: z.boolean(), passkeyAvailable: z.boolean() }).strict(),
}).strict();
const requestSchema = z.object({ ok: z.literal(true), claimId: uuid, deliveryAccepted: z.boolean() }).strict();
const confirmedSchema = z.object({ ok: z.literal(true), customerRef, linked: z.boolean(), replayed: z.boolean() }).strict()
  .refine(value => value.linked !== value.replayed);
const statusByCode = {
  AUTH_REQUIRED: 401, EMAIL_VERIFICATION_REQUIRED: 403, ACCOUNT_NOT_FOUND: 403, ORGANIZATION_NOT_FOUND: 404,
  ORGANIZATION_ACCESS_DENIED: 403, ORGANIZATION_ROLE_REQUIRED: 403, PASSWORD_CHANGE_REQUIRED: 428,
  CUSTOMER_NOT_FOUND: 404, CUSTOMER_EMAIL_MISMATCH: 403, CLAIM_CHALLENGE_INVALID: 400, CLAIM_ALREADY_BOUND: 409,
  INVITATION_INVALID: 400, ORDER_NOT_FOUND: 404, VALIDATION_ERROR: 400, SERVICE_UNAVAILABLE: 503,
} as const;
const failureSchema = z.object({ ok: z.literal(false), code: z.string(), message: z.string().max(500) }).strict();

/** Existing fixed HTTP contracts. No Auth client/store, roles, persistence or automatic retry. */
export function createHistoryClaimApi(binding: HistoryClaimBinding, isCurrent: () => boolean, transport: typeof fetch = globalThis.fetch) {
  function current(signal?: AbortSignal) {
    if (!isCurrent() || signal?.aborted) throw new HistoryClaimApiError("stale");
    const identity = historyClaimSession(binding.accessToken);
    if (!identity || identity.actorAuthUserId !== binding.actorAuthUserId || identity.sessionId !== binding.sessionId) throw new HistoryClaimApiError("signed_out");
  }
  async function request(path: string, body?: unknown, signal?: AbortSignal): Promise<unknown> {
    current(signal);
    const controller = new AbortController(), abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        (async () => {
          const response = await transport(path, { method: body === undefined ? "GET" : "POST", body: body === undefined ? undefined : JSON.stringify(body),
            credentials: "same-origin", cache: "no-store", redirect: "error", referrerPolicy: "no-referrer", signal: controller.signal,
            headers: { Accept: "application/json", Authorization: "Bearer " + binding.accessToken,
              ...(body === undefined ? {} : { "Content-Type": "application/json" }) } });
          current(signal); const value: unknown = await response.json(); current(signal); return { response, value };
        })(),
        new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { controller.abort(); reject(new HistoryClaimApiError("unavailable")); }, 30_000); }),
      ]);
      if (result.response.status === 200) return result.value;
      const error = failureSchema.safeParse(result.value);
      if (!error.success || !Object.hasOwn(statusByCode, error.data.code)
        || statusByCode[error.data.code as keyof typeof statusByCode] !== result.response.status) throw new HistoryClaimApiError("unavailable");
      const code = error.data.code;
      throw new HistoryClaimApiError(code === "AUTH_REQUIRED" ? "signed_out" : code === "PASSWORD_CHANGE_REQUIRED" ? "password_required"
        : code === "CLAIM_ALREADY_BOUND" ? "conflict" : ["CUSTOMER_NOT_FOUND", "CLAIM_CHALLENGE_INVALID", "VALIDATION_ERROR"].includes(code) ? "invalid_claim"
        : code === "SERVICE_UNAVAILABLE" ? "unavailable" : "denied");
    } catch (error) {
      if (error instanceof HistoryClaimApiError) throw error;
      current(signal); throw new HistoryClaimApiError("unavailable");
    } finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
  }
  return {
    async context(signal?: AbortSignal): Promise<PersonalHistoryContext> {
      const value = contextSchema.safeParse(await request("/api/research/account/context", undefined, signal));
      if (!value.success) throw new HistoryClaimApiError("unavailable");
      if (value.data.auth.userId.toLowerCase() !== binding.actorAuthUserId || !value.data.personal || value.data.personal.status !== "active") throw new HistoryClaimApiError("denied");
      current(signal);
      return { actorAuthUserId: binding.actorAuthUserId, memberId: value.data.personal.memberId, email: value.data.auth.email };
    },
    async requestChallenge(reference: string, signal?: AbortSignal) {
      if (!customerRef.safeParse(reference).success) throw new HistoryClaimApiError("invalid_claim");
      const value = requestSchema.safeParse(await request("/api/research/account/claims/request", { customerRef: reference, target: { subjectType: "personal" } }, signal));
      if (!value.success) throw new HistoryClaimApiError("unavailable");
      current(signal);
      return { claimId: value.data.claimId, deliveryAccepted: value.data.deliveryAccepted };
    },
    async confirm(input: HistoryClaimConfirmation, expectedReference?: string, signal?: AbortSignal) {
      const command = freezeHistoryConfirmation(input);
      if (!command) throw new HistoryClaimApiError("invalid_claim");
      const value = confirmedSchema.safeParse(await request("/api/research/account/claims/confirm", command, signal));
      if (!value.success || (expectedReference !== undefined && value.data.customerRef !== expectedReference)) throw new HistoryClaimApiError("unavailable");
      current(signal);
      return { customerRef: value.data.customerRef, replayed: value.data.replayed };
    },
  };
}
