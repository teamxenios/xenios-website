import { z } from "zod";
import { OrganizationRoleSchema, OrganizationStatusSchema } from "@shared/research/account-identity";
import { isRecoveryAccessToken } from "@/lib/supabaseBrowser";

export const HISTORY_CLAIM_PATH = "/research/account/claim-history";
const uuid = z.string().uuid().refine(value => value !== "00000000-0000-0000-0000-000000000000");
const customerRef = z.string().regex(/^eac_[a-f0-9]{32}$/);
const challenge = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const confirmation = z.object({ claimId: uuid, challengeToken: challenge }).strict();
export type HistoryClaimConfirmation = Readonly<z.infer<typeof confirmation>>;
export interface HistoryClaimSession { actorAuthUserId: string; sessionId: string }
export interface HistoryClaimBinding extends HistoryClaimSession { accessToken: string }
export interface PersonalHistoryContext { actorAuthUserId: string; memberId: string; email: string }
export type HistoryClaimFailure = "signed_out" | "denied" | "password_required" | "invalid_claim" | "conflict" | "unavailable" | "stale";
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
      return { actorAuthUserId: binding.actorAuthUserId, memberId: value.data.personal.memberId, email: value.data.auth.email };
    },
    async requestChallenge(reference: string, signal?: AbortSignal) {
      if (!customerRef.safeParse(reference).success) throw new HistoryClaimApiError("invalid_claim");
      const value = requestSchema.safeParse(await request("/api/research/account/claims/request", { customerRef: reference, target: { subjectType: "personal" } }, signal));
      if (!value.success) throw new HistoryClaimApiError("unavailable");
      return { claimId: value.data.claimId, deliveryAccepted: value.data.deliveryAccepted };
    },
    async confirm(input: HistoryClaimConfirmation, expectedReference?: string, signal?: AbortSignal) {
      const command = freezeHistoryConfirmation(input);
      if (!command) throw new HistoryClaimApiError("invalid_claim");
      const value = confirmedSchema.safeParse(await request("/api/research/account/claims/confirm", command, signal));
      if (!value.success || (expectedReference !== undefined && value.data.customerRef !== expectedReference)) throw new HistoryClaimApiError("unavailable");
      return { customerRef: value.data.customerRef, replayed: value.data.replayed };
    },
  };
}
