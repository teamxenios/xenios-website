import {
  commissionScheduleDefinition,
  type CommissionProgramId,
  type CommissionScheduleDefinition,
  type CommissionScheduleSnapshot,
} from "@shared/research/commission-schedules";
import { partnerCanEarn, type PartnerState } from "@shared/research/distribution";
import { createCommissionScheduleSnapshot } from "./hash";

export type CommissionProgramBinding = Readonly<{
  bindingId: string;
  partnerId: string;
  programId: CommissionProgramId;
  scheduleVersion: number;
  /** Hash pinned when the signed/admin-authorized binding is recorded. */
  scheduleHash: string;
  effectiveAt: string;
  terminatedAt: string | null;
  authorityReference: string;
  recordedAt: string;
}>;

export interface CommissionProgramBindingRepository {
  listForPartner(partnerId: string): Promise<readonly CommissionProgramBinding[]>;
}

export interface CommissionPartnerStateSource {
  getPartnerState(partnerId: string): Promise<PartnerState | null>;
}

export type CommissionScheduleDenialCode =
  | "invalid_request"
  | "partner_not_found"
  | "partner_not_active"
  | "program_binding_not_found"
  | "program_binding_ambiguous"
  | "program_binding_not_effective"
  | "schedule_version_not_found"
  | "schedule_hash_mismatch";

export type ResolvedCommissionSchedule = Readonly<{
  binding: CommissionProgramBinding;
  schedule: CommissionScheduleDefinition;
  snapshot: CommissionScheduleSnapshot;
}>;

export type CommissionScheduleResolution =
  | Readonly<{ ok: true; value: ResolvedCommissionSchedule }>
  | Readonly<{ ok: false; code: CommissionScheduleDenialCode }>;

export interface CommissionScheduleAuthority {
  /**
   * Resolves only from canonical server-side identity and time. There is no
   * program, version, rate, hold, or payout input for a browser to forge.
   */
  resolveForPartner(input: Readonly<{
    partnerId: string;
    occurredAt: string;
  }>): Promise<CommissionScheduleResolution>;
}

function validInstant(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function createCommissionScheduleAuthority(deps: Readonly<{
  bindings: CommissionProgramBindingRepository;
  partners: CommissionPartnerStateSource;
}>): CommissionScheduleAuthority {
  const authority: CommissionScheduleAuthority = {
    async resolveForPartner(input): Promise<CommissionScheduleResolution> {
      const occurredAt = validInstant(input.occurredAt);
      if (input.partnerId.trim().length === 0 || occurredAt === null) {
        return { ok: false, code: "invalid_request" };
      }

      const partnerState = await deps.partners.getPartnerState(input.partnerId);
      if (partnerState === null) return { ok: false, code: "partner_not_found" };
      if (!partnerCanEarn(partnerState)) return { ok: false, code: "partner_not_active" };

      const all = await deps.bindings.listForPartner(input.partnerId);
      const effective = all.filter((binding) => {
        const start = validInstant(binding.effectiveAt);
        const end = binding.terminatedAt === null ? null : validInstant(binding.terminatedAt);
        return start !== null && start <= occurredAt && (end === null || occurredAt < end);
      });
      if (effective.length === 0) {
        return {
          ok: false,
          code: all.length === 0 ? "program_binding_not_found" : "program_binding_not_effective",
        };
      }
      if (effective.length !== 1) return { ok: false, code: "program_binding_ambiguous" };

      const binding = effective[0];
      const schedule = commissionScheduleDefinition(binding.programId, binding.scheduleVersion);
      if (schedule === null) return { ok: false, code: "schedule_version_not_found" };
      const bindingStart = validInstant(binding.effectiveAt);
      const scheduleStart = validInstant(`${schedule.effectiveDate}T00:00:00.000Z`);
      if (
        binding.bindingId.trim().length === 0 || binding.authorityReference.trim().length === 0 ||
        validInstant(binding.recordedAt) === null || bindingStart === null || scheduleStart === null ||
        bindingStart < scheduleStart
      ) return { ok: false, code: "program_binding_not_effective" };
      const snapshot = createCommissionScheduleSnapshot(schedule);
      if (snapshot.scheduleHash !== binding.scheduleHash) {
        return { ok: false, code: "schedule_hash_mismatch" };
      }
      return { ok: true, value: Object.freeze({ binding, schedule, snapshot }) };
    },
  };
  return Object.freeze(authority);
}

export function createInMemoryCommissionProgramBindingRepository(
  seed: readonly CommissionProgramBinding[] = [],
): CommissionProgramBindingRepository {
  const bindings = seed.map((binding) => Object.freeze(structuredClone(binding)));
  const repository: CommissionProgramBindingRepository = {
    async listForPartner(partnerId) {
      return bindings.filter((binding) => binding.partnerId === partnerId);
    },
  };
  return Object.freeze(repository);
}
