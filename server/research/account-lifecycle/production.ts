import { createHash } from "node:crypto";
import { getSupabaseAdmin, getSupabaseConnectionIdentity } from "../../supabase";
import { rateLimitHit } from "../rate-limit";
import { lifecycleDigest, lifecycleUuid } from "@shared/research/account-lifecycle";
import { createLifecycleRepository, type LifecycleRepository, type LifecycleRpc } from "./repository";
import { LifecycleUnavailable, type LifecycleDependencies, type LifecycleProvider, type LifecycleProviderEvidence,
  type LifecycleReservation } from "./service";

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
