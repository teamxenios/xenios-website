import { createHash } from "node:crypto";
import { z } from "zod";
import { getSupabaseAdmin, getSupabaseConnectionIdentity } from "../../supabase";
import { rateLimitHit } from "../rate-limit";
import { lifecycleDigest, lifecycleInstant, lifecycleMicros, lifecycleUuid } from "@shared/research/account-lifecycle";
import { createLifecycleRepository, lifecyclePrepareContext, type LifecycleRepository, type LifecycleRpc } from "./repository";
import { LifecycleUnavailable, type LifecycleDependencies, type LifecycleProvider, type LifecycleProviderEvidence,
  type LifecycleAttemptBinding, type LifecycleReservation } from "./service";

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
function projectOrigin(value: string | undefined): string | null {
  try { const url = new URL(value ?? ""); return url.protocol === "https:" && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash ? url.origin : null; }
  catch { return null; }
}
function canonicalAdmin(project: string) {
  const admin = getSupabaseAdmin();
  if (getSupabaseConnectionIdentity().adminUrl !== project) throw new LifecycleUnavailable("provider_unqualified");
  return admin;
}
/** Actual canonical credential boundary, not another Supabase client. No
 * construction/query occurs until a separately qualified caller invokes RPC. */
export function canonicalLifecycleRepository(project: string): LifecycleRepository {
  const origin = projectOrigin(project); if (!origin || origin !== project) throw new LifecycleUnavailable("policy_unavailable");
  const transport: LifecycleRpc = { rpc: (name, args) => canonicalAdmin(origin).rpc(name, args) };
  return createLifecycleRepository(transport);
}
/** All genuine identity/current-assurance/issuance/policy/native/guard bindings
 * must be supplied by their canonical owners. No env flag or method presence
 * manufactures those guarantees; default construction performs zero effects. */
export function buildAccountLifecycleDependencies(bindings: Readonly<{
  origin?: string; repository?: LifecycleRepository; verifyOrdinary?: LifecycleDependencies["verifyOrdinary"];
  attempts?: LifecycleDependencies["attempts"]; currentAuthority?: LifecycleDependencies["currentAuthority"];
  allow?: LifecycleDependencies["allow"];
}> = {}): LifecycleDependencies {
  const unavailable = async (): Promise<never> => { throw new LifecycleUnavailable("policy_unavailable"); };
  return {
    origin: projectOrigin(bindings.origin),
    verifyOrdinary: bindings.verifyOrdinary ?? (async () => { throw new LifecycleUnavailable("assurance_unavailable"); }),
    repository: bindings.repository ?? { prepareSelf: unavailable, prepareAdmin: unavailable, confirmSelf: unavailable,
      confirmAdmin: unavailable, statusSelf: unavailable, statusAdmin: unavailable },
    allow: bindings.allow ?? ((key, seconds, maximum) => rateLimitHit(key, seconds, maximum, { durableFailurePolicy: "deny" })),
    ...(bindings.attempts ? { attempts: bindings.attempts } : {}),
    ...(bindings.currentAuthority ? { currentAuthority: bindings.currentAuthority } : {}),
  };
}

export const ACCOUNT_LIFECYCLE_ENABLED_ENV = "RESEARCH_ACCOUNT_LIFECYCLE_ENABLED";
export const accountLifecycleReadinessSchema = z.object({
  protocol: z.literal("account-lifecycle/readiness/v1"), sourceRevision: z.string().regex(/^[a-f0-9]{40}$/u),
  projectUrl: z.string().url(), siteOrigin: z.string().url(), notAfter: lifecycleInstant,
  nativeSourceDigest: lifecycleDigest, policyRevision: lifecycleDigest, assuranceRevision: lifecycleDigest,
  issuanceRevision: lifecycleDigest, domainCoverageRevision: lifecycleDigest, guardCoverageRevision: lifecycleDigest,
  providerEvidenceRevision: lifecycleDigest, finiteCleanupRevision: lifecycleDigest,
}).strict();
export type AccountLifecycleReadiness = z.infer<typeof accountLifecycleReadinessSchema>;
export type AccountLifecycleProductionBindings = Readonly<{
  verifyOrdinary: LifecycleDependencies["verifyOrdinary"];
  attempts: NonNullable<LifecycleDependencies["attempts"]>;
  currentAuthority: NonNullable<LifecycleDependencies["currentAuthority"]>;
}>;
/** Root-only release qualification input. Digests attest which actual reviewed
 * contracts must be supplied; neither hashes nor method presence are authority.
 * Native pinned ports recheck every live actor/policy/phase after lock waits.
 * Omission never constructs an issuer/provider, adopts EA assent or activates.
 */
export function buildAccountLifecycleProduction(env: Readonly<Record<string, string | undefined>> = process.env,
  bindings?: AccountLifecycleProductionBindings, readiness?: AccountLifecycleReadiness): LifecycleDependencies {
  const origin = projectOrigin(env.SITE_URL), project = projectOrigin(env.SUPABASE_URL);
  const disabled = () => buildAccountLifecycleDependencies({ ...(origin ? { origin } : {}) });
  const parsed = accountLifecycleReadinessSchema.safeParse(readiness);
  if (env[ACCOUNT_LIFECYCLE_ENABLED_ENV] !== "true" || !origin || !project || !parsed.success
    || parsed.data.siteOrigin !== origin || parsed.data.projectUrl !== project
    || !bindings || typeof bindings.verifyOrdinary !== "function" || typeof bindings.attempts?.issue !== "function"
    || typeof bindings.attempts?.verify !== "function" || typeof bindings.currentAuthority?.resolve !== "function") return disabled();
  const qualified = Object.freeze(parsed.data);
  const verify = bindings.verifyOrdinary;
  const issue = bindings.attempts.issue.bind(bindings.attempts), verifyAttempt = bindings.attempts.verify.bind(bindings.attempts);
  const resolve = bindings.currentAuthority.resolve.bind(bindings.currentAuthority);
  const current = () => {
    if (lifecycleMicros(qualified.notAfter) <= BigInt(Date.now()) * 1000n) throw new LifecycleUnavailable("policy_unavailable");
  };
  const attempt = (binding: LifecycleAttemptBinding) => {
    current(); const context = lifecyclePrepareContext.safeParse(binding?.context);
    if (!context.success || context.data.policyRevision !== qualified.policyRevision
      || lifecycleMicros(context.data.prepareNotAfter) > lifecycleMicros(qualified.notAfter)
      || lifecycleMicros(context.data.assuranceNotAfter) > lifecycleMicros(qualified.notAfter)) throw new LifecycleUnavailable("policy_unavailable");
    return binding;
  };
  // No canonical SDK/client query occurs at construction. The fixed-project
  // repository is reached only after actual current ordinary Auth verification.
  const repository = canonicalLifecycleRepository(project);
  const guarded: LifecycleRepository = {
    prepareSelf: (actor, attempt, context) => { current(); return repository.prepareSelf(actor, attempt, context); },
    prepareAdmin: (actor, target, attempt, reason, context) => { current(); return repository.prepareAdmin(actor, target, attempt, reason, context); },
    confirmSelf: (actor, operation, digest, version, context) => { current(); return repository.confirmSelf(actor, operation, digest, version, context); },
    confirmAdmin: (actor, operation, digest, version, context) => { current(); return repository.confirmAdmin(actor, operation, digest, version, context); },
    statusSelf: (actor, operation) => { current(); return repository.statusSelf(actor, operation); },
    statusAdmin: (actor, operation, context) => { current(); return repository.statusAdmin(actor, operation, context); },
  };
  return buildAccountLifecycleDependencies({ origin, repository: guarded,
    verifyOrdinary: async token => { current(); const result = await verify(token); current(); return result; },
    attempts: { issue: async input => { current(); const issued = await issue(input); attempt(issued.binding); return issued; },
      verify: async input => { current(); const binding = await verifyAttempt(input); current(); return binding ? attempt(binding) : null; } },
    currentAuthority: { resolve: async input => { current(); const result = await resolve(input); current(); return result; } },
  });
}
type AdminBoundary = { deleteUser(target: string, soft: boolean): Promise<{ data: { user: { id: string } | null }; error: unknown }>;
  getUserById(target: string): Promise<{ data: { user: { id: string } | null }; error: unknown }> };
export type LifecycleProviderAdapter = LifecycleProvider & { reconcile(reservation: LifecycleReservation): Promise<LifecycleProviderEvidence> };
/** Qualification is a REQUIRED trusted composition input, not a request/flag.
 * The first native candidate exposes no execution/evidence bridge, so this
 * adapter is unmounted and must not be used for an actual target yet. */
export function createSupportedLifecycleProvider(qualification?: Readonly<{ projectUrl: string; revision: string; softDelete: boolean }>,
  boundary?: () => AdminBoundary): LifecycleProviderAdapter | null {
  if (!qualification || !projectOrigin(qualification.projectUrl) || !lifecycleDigest.safeParse(qualification.revision).success
    || typeof qualification.softDelete !== "boolean") return null;
  const qualified = Object.freeze({ ...qualification }), issued = new WeakSet<object>();
  const project = projectOrigin(qualified.projectUrl)!;
  const admin = boundary ?? (() => canonicalAdmin(project).auth.admin);
  function valid(value: LifecycleReservation) {
    if (!value || !lifecycleUuid.safeParse(value.operationId).success || !lifecycleUuid.safeParse(value.executionId).success
      || !lifecycleUuid.safeParse(value.targetId).success || value.softDelete !== qualified.softDelete) throw new LifecycleUnavailable("provider_unqualified");
  }
  function evidence(reservation: LifecycleReservation, outcome: LifecycleProviderEvidence["outcome"]) {
    const facts = { protocol: "account-lifecycle/provider-evidence/v1" as const, operationId: reservation.operationId,
      executionId: reservation.executionId, targetId: reservation.targetId, projectBinding: digest(project), softDelete: reservation.softDelete, outcome };
    const receipt = Object.freeze({ ...facts, evidenceDigest: digest(JSON.stringify([qualified.revision, facts])) });
    issued.add(receipt); return receipt;
  }
  return {
    async deleteReserved(reservation) {
      valid(reservation);
      try { const result = await admin().deleteUser(reservation.targetId, reservation.softDelete);
        return evidence(reservation, !result.error && result.data.user?.id === reservation.targetId ? "provider_confirmed" : "uncertain");
      } catch { return evidence(reservation, "uncertain"); }
    },
    async reconcile(reservation) {
      valid(reservation);
      try { const result = await admin().getUserById(reservation.targetId);
        const error = result.error as { code?: unknown; status?: unknown } | null;
        return evidence(reservation, error?.code === "user_not_found" && error.status === 404 && result.data.user === null ? "auth_absent_verified" : "uncertain");
      } catch { return evidence(reservation, "uncertain"); }
    },
    verifyEvidence(reservation, receipt) {
      return issued.has(receipt) && receipt.operationId === reservation.operationId && receipt.executionId === reservation.executionId
        && receipt.targetId === reservation.targetId && receipt.softDelete === reservation.softDelete && receipt.projectBinding === digest(project);
    },
  };
}
