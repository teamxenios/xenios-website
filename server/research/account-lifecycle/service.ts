import { createHash } from "node:crypto";
import { z } from "zod";
import { lifecycleAdminReason, lifecycleCarrier, lifecycleConfirmBody, lifecycleDigest, lifecycleEnvelope, lifecycleIssueBody,
  lifecycleIssuedReply, lifecyclePrepareBody, lifecycleUuid, type AccountLifecycleEnvelope,
  type LifecycleBlocker } from "@shared/research/account-lifecycle";
import { lifecycleCurrentContext, lifecyclePrepareContext, LifecycleRequestError,
  type CurrentContext, type LifecycleRepository } from "./repository";

export type LifecycleMode = "self" | "admin";
export type LifecycleActor = Readonly<{ actorId: string; sessionBinding: string; ordinary: true; emailConfirmed: true }>;
const actorSchema = z.object({ actorId: lifecycleUuid, sessionBinding: lifecycleDigest, ordinary: z.literal(true), emailConfirmed: z.literal(true) }).strict();
const bindingSchema = z.object({ actorId: lifecycleUuid, targetId: lifecycleUuid, mode: z.enum(["self", "admin"]), attemptId: lifecycleUuid,
  reason: z.enum(["self_requested", "privacy_request", "security_response", "authorized_admin_closure"]), context: lifecyclePrepareContext }).strict();
export type LifecycleAttemptBinding = z.infer<typeof bindingSchema>;
export class LifecycleUnavailable extends Error {
  constructor(readonly blocker: LifecycleBlocker) { super(blocker); }
}
export type LifecycleHttpContext = Readonly<{ ip: string; origin?: string; fetchSite?: string; json: boolean }>;
/** REQUIRED genuine issuance bridge. These signatures are not an installed
 * issuer, recent-auth mechanism, approved policy or native authority proof. */
export interface LifecycleAttemptPort {
  issue(input: Readonly<{ actor: LifecycleActor; mode: LifecycleMode; targetLocator: string; reason: LifecycleAttemptBinding["reason"]; retryKey: string }>):
    Promise<{ carrier: string; binding: LifecycleAttemptBinding }>;
  // Authenticate binding for exact replay even after expiry; only the native
  // writer may admit new work, rechecking actual authority and DB time.
  verify(input: Readonly<{ actor: LifecycleActor; mode: LifecycleMode; carrier: string }>): Promise<LifecycleAttemptBinding | null>;
}
export type LifecycleDependencies = Readonly<{
  origin: string | null;
  verifyOrdinary(token: string): Promise<LifecycleActor | null>;
  allow(key: string, seconds: number, maximum: number): Promise<boolean>;
  repository: LifecycleRepository;
  attempts?: LifecycleAttemptPort;
  currentAuthority?: { resolve(input: Readonly<{ actor: LifecycleActor; mode: LifecycleMode; phase: "confirm" | "status"; operationId: string }>): Promise<CurrentContext> };
}>;
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value); if (!result.success) throw new LifecycleRequestError("invalid_input", 400); return result.data;
}
function assertOrigin(deps: LifecycleDependencies, context: LifecycleHttpContext) {
  if (!deps.origin) throw new LifecycleUnavailable("policy_unavailable");
  if (context.origin !== deps.origin || !context.json || context.fetchSite !== undefined && context.fetchSite !== "same-origin") {
    throw new LifecycleRequestError("forbidden", 403);
  }
}
function bound(binding: LifecycleAttemptBinding, actor: LifecycleActor, mode: LifecycleMode) {
  if (binding.actorId !== actor.actorId || binding.mode !== mode || binding.context.sessionBinding !== actor.sessionBinding
    || mode === "self" && (binding.targetId !== actor.actorId || binding.reason !== "self_requested")
    || mode === "admin" && binding.reason === "self_requested") throw new LifecycleRequestError("forbidden", 403);
}
export function createAccountLifecycleService(deps: LifecycleDependencies) {
  async function actor(token: string | null, context: LifecycleHttpContext) {
    if (!token || token.length > 16384 || /[\r\n]/u.test(token)) throw new LifecycleRequestError("authentication_required", 401);
    const verified = await deps.verifyOrdinary(token);
    if (!verified) throw new LifecycleRequestError("forbidden", 403);
    const parsed = actorSchema.safeParse(verified); if (!parsed.success) throw new LifecycleRequestError("forbidden", 403);
    const digest = createHash("sha256").update(parsed.data.actorId + ":" + context.ip).digest("hex");
    let allowed = false;
    try { allowed = Boolean(context.ip && context.ip !== "unknown") && await deps.allow("account-lifecycle:" + digest, 600, 20); } catch { /* Closed. */ }
    if (!allowed) throw new LifecycleUnavailable("assurance_unavailable");
    return parsed.data;
  }
  async function current(value: LifecycleActor, mode: LifecycleMode, phase: "confirm" | "status", operationId: string) {
    if (!deps.currentAuthority) throw new LifecycleUnavailable(mode === "admin" ? "admin_authority_unavailable" : "assurance_unavailable");
    const context = parse(lifecycleCurrentContext, await deps.currentAuthority.resolve({ actor: value, mode, phase, operationId }));
    if (context.sessionBinding !== value.sessionBinding) throw new LifecycleRequestError("forbidden", 403);
    return context;
  }
  return {
    async issue(mode: LifecycleMode, token: string | null, raw: unknown, context: LifecycleHttpContext, targetLocator?: string, reason?: string) {
      assertOrigin(deps, context); const input = parse(lifecycleIssueBody, raw), verified = await actor(token, context);
      if (!deps.attempts) throw new LifecycleUnavailable(mode === "admin" ? "admin_authority_unavailable" : "assurance_unavailable");
      const target = mode === "self" ? verified.actorId : parse(lifecycleUuid, targetLocator);
      const why = mode === "self" ? "self_requested" as const : parse(lifecycleAdminReason, reason);
      const issued = await deps.attempts.issue({ actor: verified, mode, targetLocator: target, reason: why, retryKey: input.retryKey });
      const binding = parse(bindingSchema, issued.binding); bound(binding, verified, mode);
      if (binding.targetId !== target || binding.reason !== why) throw new LifecycleRequestError("forbidden", 403);
      return lifecycleIssuedReply.parse({ protocol: "account-lifecycle/v1", attemptCarrier: parse(lifecycleCarrier, issued.carrier), expiresAt: binding.context.prepareNotAfter });
    },
    async prepare(mode: LifecycleMode, token: string | null, raw: unknown, context: LifecycleHttpContext): Promise<AccountLifecycleEnvelope> {
      assertOrigin(deps, context); const input = parse(lifecyclePrepareBody, raw), verified = await actor(token, context);
      if (!deps.attempts) throw new LifecycleUnavailable(mode === "admin" ? "admin_authority_unavailable" : "assurance_unavailable");
      const candidate = await deps.attempts.verify({ actor: verified, mode, carrier: input.attemptCarrier });
      if (!candidate) throw new LifecycleRequestError("forbidden", 403);
      const binding = parse(bindingSchema, candidate); bound(binding, verified, mode);
      // Native prepare performs exact saved replay BEFORE optional domain reads.
      // Frozen expiry/context/attempt never renew on retries or lost replies.
      return mode === "self" ? deps.repository.prepareSelf(verified.actorId, binding.attemptId, binding.context)
        : deps.repository.prepareAdmin(verified.actorId, binding.targetId, binding.attemptId,
          parse(lifecycleAdminReason, binding.reason), binding.context);
    },
    async confirm(mode: LifecycleMode, token: string | null, raw: unknown, context: LifecycleHttpContext): Promise<AccountLifecycleEnvelope> {
      assertOrigin(deps, context); const input = parse(lifecycleConfirmBody, raw), verified = await actor(token, context);
      const evidence = await current(verified, mode, "confirm", input.operationId);
      return mode === "self" ? deps.repository.confirmSelf(verified.actorId, input.operationId, input.previewDigest, input.expectedVersion, evidence)
        : deps.repository.confirmAdmin(verified.actorId, input.operationId, input.previewDigest, input.expectedVersion, evidence);
    },
    async status(mode: LifecycleMode, token: string | null, operation: unknown, context: LifecycleHttpContext) {
      const operationId = parse(lifecycleUuid, operation), verified = await actor(token, context);
      return mode === "self" ? deps.repository.statusSelf(verified.actorId, operationId)
        : deps.repository.statusAdmin(verified.actorId, operationId, await current(verified, mode, "status", operationId));
    },
  };
}
export type AccountLifecycleService = ReturnType<typeof createAccountLifecycleService>;

/** Future trusted coordinator boundary, intentionally not an HTTP route or
 * service_role RPC setter. The first native candidate publishes NO bridge. */
export interface LifecycleExecutionBridge {
  claim(operationId: string, expectedVersion: number): Promise<LifecycleReservation | null>;
  finish(reservation: LifecycleReservation, evidence: LifecycleProviderEvidence):
    Promise<AccountLifecycleEnvelope>;
}
export type LifecycleReservation = Readonly<{ operationId: string; executionId: string; targetId: string; softDelete: boolean }>;
export type LifecycleProviderEvidence = Readonly<{ protocol: "account-lifecycle/provider-evidence/v1"; operationId: string; executionId: string;
  targetId: string; projectBinding: string; softDelete: boolean; outcome: "provider_confirmed" | "auth_absent_verified" | "uncertain" | "refused"; evidenceDigest: string }>;
export interface LifecycleProvider {
  deleteReserved(reservation: LifecycleReservation): Promise<LifecycleProviderEvidence>;
  verifyEvidence(reservation: LifecycleReservation, evidence: LifecycleProviderEvidence): boolean;
}
export async function executeReservedAuthDeletion(operationId: string, version: number, bridge?: LifecycleExecutionBridge, provider?: LifecycleProvider) {
  parse(lifecycleUuid, operationId); parse(lifecycleVersionForExecution, version);
  if (!bridge || !provider) throw new LifecycleUnavailable("provider_unqualified");
  const reservation = await bridge.claim(operationId, version);
  if (!reservation) return null; // Already claimed/unknown is NEVER a new send.
  if (reservation.operationId !== operationId || !lifecycleUuid.safeParse(reservation.executionId).success
    || !lifecycleUuid.safeParse(reservation.targetId).success || typeof reservation.softDelete !== "boolean") throw new LifecycleRequestError("outcome_uncertain", 503);
  let evidence: LifecycleProviderEvidence;
  try { evidence = await provider.deleteReserved(reservation); }
  catch { throw new LifecycleRequestError("outcome_uncertain", 503); } // Reservation stays consumed; never retry the provider.
  if (!provider.verifyEvidence(reservation, evidence)) throw new LifecycleRequestError("outcome_uncertain", 503);
  // Only a real bridge may re-read/verify provider evidence and advance native
  // state. A returned enum is NOT sufficient native completion authority.
  const result = lifecycleEnvelope.parse(await bridge.finish(reservation, evidence));
  if (result.operationId !== operationId) throw new LifecycleRequestError("outcome_uncertain", 503);
  return result;
}
const lifecycleVersionForExecution = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
