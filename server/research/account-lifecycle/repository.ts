import { z } from "zod";
import { lifecycleAdminReason, lifecycleDigest, lifecycleEnvelope, lifecycleInstant, lifecycleMicros,
  lifecycleUuid, lifecycleVersion, type AccountLifecycleEnvelope, type LifecycleErrorCode } from "@shared/research/account-lifecycle";

export class LifecycleRequestError extends Error {
  constructor(readonly code: LifecycleErrorCode, readonly status: 400 | 401 | 403 | 409 | 503) { super(code); }
}
export const lifecyclePrepareContext = z.object({ policyRevision: lifecycleDigest, assuranceRef: lifecycleDigest,
  sessionBinding: lifecycleDigest, assuranceNotAfter: lifecycleInstant, prepareNotAfter: lifecycleInstant }).strict()
  .refine(value => lifecycleMicros(value.prepareNotAfter) <= lifecycleMicros(value.assuranceNotAfter));
export const lifecycleCurrentContext = z.object({ assuranceRef: lifecycleDigest, sessionBinding: lifecycleDigest }).strict();
export type PrepareContext = z.infer<typeof lifecyclePrepareContext>;
export type CurrentContext = z.infer<typeof lifecycleCurrentContext>;
export type LifecycleRpc = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> };
export interface LifecycleRepository {
  prepareSelf(actor: string, attempt: string, context: PrepareContext): Promise<AccountLifecycleEnvelope>;
  prepareAdmin(actor: string, target: string, attempt: string, reason: z.infer<typeof lifecycleAdminReason>, context: PrepareContext): Promise<AccountLifecycleEnvelope>;
  confirmSelf(actor: string, operation: string, digest: string, version: number, context: CurrentContext): Promise<AccountLifecycleEnvelope>;
  confirmAdmin(actor: string, operation: string, digest: string, version: number, context: CurrentContext): Promise<AccountLifecycleEnvelope>;
  statusSelf(actor: string, operation: string): Promise<AccountLifecycleEnvelope>;
  statusAdmin(actor: string, operation: string, context: CurrentContext): Promise<AccountLifecycleEnvelope>;
}
const uncertain = () => new LifecycleRequestError("outcome_uncertain", 503);
function invalid<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input); if (!result.success) throw new LifecycleRequestError("invalid_input", 400); return result.data;
}
function rpcFailure(raw: unknown): LifecycleRequestError {
  if (raw && typeof raw === "object") {
    const e = raw as { code?: unknown; message?: unknown };
    if (e.code === "22023" && e.message === "account_lifecycle_invalid") return new LifecycleRequestError("invalid_input", 400);
    if (e.code === "42501" && e.message === "account_lifecycle_forbidden") return new LifecycleRequestError("forbidden", 403);
    if (e.code === "23505" && e.message === "account_lifecycle_attempt_conflict") return new LifecycleRequestError("attempt_conflict", 409);
    if (e.code === "P0001" && e.message === "account_lifecycle_version_conflict") return new LifecycleRequestError("version_conflict", 409);
  }
  // Serialization, deadlock, timeout, missing RPC and response loss can follow
  // a committed transition. Never normalize them to a prewrite refusal/retry.
  return uncertain();
}
export function createLifecycleRepository(client: LifecycleRpc): LifecycleRepository {
  async function call(name: string, args: Record<string, unknown>, operation?: string) {
    let result: { data: unknown; error: unknown };
    try { result = await client.rpc(name, args); } catch { throw uncertain(); }
    if (result.error) throw rpcFailure(result.error);
    const parsed = lifecycleEnvelope.safeParse(result.data);
    if (!parsed.success || operation && parsed.data.operationId !== operation) throw uncertain();
    return parsed.data;
  }
  const actorArgs = (actor: string) => ({ p_actor: invalid(lifecycleUuid, actor) });
  const confirmArgs = (actor: string, operation: string, digest: string, version: number, context: CurrentContext) => ({
    ...actorArgs(actor), p_operation: invalid(lifecycleUuid, operation), p_preview_sha256: invalid(lifecycleDigest, digest),
    p_expected_version: invalid(lifecycleVersion, version), p_context: invalid(lifecycleCurrentContext, context),
  });
  return {
    prepareSelf: (actor, attempt, context) => call("account_lifecycle_prepare_self", { ...actorArgs(actor),
      p_attempt: invalid(lifecycleUuid, attempt), p_context: invalid(lifecyclePrepareContext, context) }),
    prepareAdmin: (actor, target, attempt, reason, context) => call("account_lifecycle_prepare_admin", { ...actorArgs(actor),
      p_target: invalid(lifecycleUuid, target), p_attempt: invalid(lifecycleUuid, attempt), p_reason: invalid(lifecycleAdminReason, reason),
      p_context: invalid(lifecyclePrepareContext, context) }),
    confirmSelf: (actor, operation, digest, version, context) => call("account_lifecycle_confirm_self", confirmArgs(actor, operation, digest, version, context), operation),
    confirmAdmin: (actor, operation, digest, version, context) => call("account_lifecycle_confirm_admin", confirmArgs(actor, operation, digest, version, context), operation),
    statusSelf: (actor, operation) => call("account_lifecycle_status_self", { ...actorArgs(actor), p_operation: invalid(lifecycleUuid, operation) }, operation),
    statusAdmin: (actor, operation, context) => call("account_lifecycle_status_admin", { ...actorArgs(actor),
      p_operation: invalid(lifecycleUuid, operation), p_context: invalid(lifecycleCurrentContext, context) }, operation),
  };
}
