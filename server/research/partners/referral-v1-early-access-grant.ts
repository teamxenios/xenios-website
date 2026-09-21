import { createHash } from "node:crypto";
import type { ReferralV1Store } from "./referral-v1-store";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const CUSTOMER_REF = /^eac_[a-f0-9]{32}$/;
const PROGRAM_ID = /^[a-z][a-z0-9_]{2,127}$/;
const SHA256 = /^[a-f0-9]{64}$/;

/** PII-free ownership projection from the canonical account/customer directory. */
export interface ReferralV1EarlyAccessCustomerDirectory {
  findOwnedCustomerByAuthUserId(authUserId: string): Promise<{ customerRef: string } | null>;
}

/**
 * Deliberately narrower than the commission engine. The caller supplies only a
 * server-derived partner and binding instant; this lane consumes identifiers,
 * never a rate, hold, tier, or browser-selected program. This is the exact
 * narrow structural port implemented by CommissionScheduleAuthority.
 */
export interface ReferralV1CommissionScheduleAuthority {
  resolveForPartner(input: Readonly<{ partnerId: string; occurredAt: string }>): Promise<
    | Readonly<{ ok: true; value: { snapshot: { definition: { programId: string; version: number }; scheduleHash: string } } }>
    | Readonly<{ ok: false; code: string }>
  >;
}

export type ReferralV1EarlyAccessGrant = Readonly<{
  schemaVersion: 1;
  customerRef: string;
  partnerId: string;
  referralLinkId: string;
  bindingRevisionId: string;
  bindingEffectiveAt: string;
  commissionProgramId: string;
  commissionScheduleVersion: number;
  commissionScheduleHash: string;
  idempotencyKey: string;
}>;

/** A future canonical writer can implement this without accepting economics. */
export interface ReferralV1EarlyAccessGrantWriter {
  recordIfAbsent(input: ReferralV1EarlyAccessGrant): Promise<"recorded" | "already_recorded" | "refused">;
}

export type ReferralV1EarlyAccessGrantResult =
  | Readonly<{ ok: true; state: "recorded" | "already_recorded"; schedule: { programId: string; version: number; scheduleHash: string } }>
  | Readonly<{ ok: false; reason: "invalid_identity" | "binding_unavailable" | "binding_missing" | "binding_ineligible" | "customer_unmapped" | "schedule_unavailable" | "writer_refused" | "unavailable" }>;

export interface ReferralV1EarlyAccessGrantDependencies {
  bindings: Pick<ReferralV1Store, "getBinding">;
  customers: ReferralV1EarlyAccessCustomerDirectory;
  schedules: ReferralV1CommissionScheduleAuthority;
  writer: ReferralV1EarlyAccessGrantWriter;
}

function idempotencyKey(input: Omit<ReferralV1EarlyAccessGrant, "idempotencyKey">): string {
  const canonical = [
    input.schemaVersion, input.customerRef, input.partnerId, input.referralLinkId,
    input.bindingRevisionId, input.bindingEffectiveAt, input.commissionProgramId,
    input.commissionScheduleVersion, input.commissionScheduleHash,
  ].join("\n");
  return `rvea_${createHash("sha256").update(canonical, "utf8").digest("hex")}`;
}

/**
 * Derive an Early Access referral grant exclusively from server authorities.
 * `canonicalAuthUserId` must come from the verified Auth/member guard. There is
 * intentionally no parameter for a browser partner UUID, customer reference,
 * ownership assertion, program, commission rate, or hold rate.
 */
export async function deriveReferralV1EarlyAccessGrant(
  canonicalAuthUserId: string,
  deps: ReferralV1EarlyAccessGrantDependencies,
): Promise<ReferralV1EarlyAccessGrantResult> {
  if (!UUID.test(canonicalAuthUserId)) return { ok: false, reason: "invalid_identity" };
  try {
    const resolved = await deps.bindings.getBinding({ actorAuthUserId: canonicalAuthUserId });
    if (!resolved.ok) return { ok: false, reason: resolved.reason === "unavailable" ? "binding_unavailable" : "binding_ineligible" };
    const binding = resolved.value.binding;
    if (!binding) return { ok: false, reason: "binding_missing" };
    if (resolved.value.availability !== "ready") return { ok: false, reason: "binding_ineligible" };
    if (binding.accountKey !== `auth:${canonicalAuthUserId}` || !UUID.test(binding.partnerId) || !UUID.test(binding.linkId)
      || !binding.revisionId || !UUID.test(binding.revisionId) || !binding.effectiveAt || !binding.source) {
      return { ok: false, reason: "binding_unavailable" };
    }
    const effectiveAt = Date.parse(binding.effectiveAt);
    if (!Number.isFinite(effectiveAt) || effectiveAt < Date.parse(binding.boundAt)) {
      return { ok: false, reason: "binding_unavailable" };
    }

    const customer = await deps.customers.findOwnedCustomerByAuthUserId(canonicalAuthUserId);
    if (!customer || !CUSTOMER_REF.test(customer.customerRef)) return { ok: false, reason: "customer_unmapped" };
    const scheduleResult = await deps.schedules.resolveForPartner({ partnerId: binding.partnerId, occurredAt: binding.effectiveAt });
    if (!scheduleResult.ok) return { ok: false, reason: "schedule_unavailable" };
    const schedule = {
      programId: scheduleResult.value.snapshot.definition.programId,
      version: scheduleResult.value.snapshot.definition.version,
      scheduleHash: scheduleResult.value.snapshot.scheduleHash,
    };
    if (!PROGRAM_ID.test(schedule.programId) || !Number.isSafeInteger(schedule.version) || schedule.version < 1
      || !SHA256.test(schedule.scheduleHash)) return { ok: false, reason: "schedule_unavailable" };

    const facts = Object.freeze({
      schemaVersion: 1 as const,
      customerRef: customer.customerRef,
      partnerId: binding.partnerId,
      referralLinkId: binding.linkId,
      bindingRevisionId: binding.revisionId,
      bindingEffectiveAt: binding.effectiveAt,
      commissionProgramId: schedule.programId,
      commissionScheduleVersion: schedule.version,
      commissionScheduleHash: schedule.scheduleHash,
    });
    const grant: ReferralV1EarlyAccessGrant = Object.freeze({ ...facts, idempotencyKey: idempotencyKey(facts) });
    const written = await deps.writer.recordIfAbsent(grant);
    if (written === "refused") return { ok: false, reason: "writer_refused" };
    if (written !== "recorded" && written !== "already_recorded") return { ok: false, reason: "unavailable" };
    return { ok: true, state: written, schedule: { ...schedule } };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
