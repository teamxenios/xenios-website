import {
  commissionScheduleDefinition,
  type CommissionScheduleDefinition,
  type CommissionScheduleSnapshot,
} from "@shared/research/commission-schedules";
import { partnerCanEarn, type PartnerState } from "@shared/research/distribution";
import { createCommissionScheduleSnapshot } from "./hash";

export type CommissionProgramBinding = Readonly<{
  bindingId: string;
  partnerId: string;
  /** Runtime data is validated before it is narrowed to a catalog program. */
  programId: string;
  scheduleVersion: number;
  /** Hash pinned when the signed/admin-authorized binding is recorded. */
  scheduleHash: string;
  effectiveAt: string;
  terminatedAt: string | null;
  authorityReference: string;
  recordedAt: string;
}>;

export type CommissionProgramBindingLifecycleEvent = Readonly<{
  eventId: string;
  bindingId: string;
  sequence: number;
  kind: "terminated";
  effectiveAt: string;
  authorityReference: string;
  recordedAt: string;
}>;

export interface CommissionProgramBindingRepository {
  listForPartner(partnerId: string): Promise<readonly CommissionProgramBinding[]>;
}

export interface CommissionPartnerStateSource {
  /** Returns the canonical lifecycle state at the money event instant, not current state. */
  getPartnerStateAt(partnerId: string, occurredAt: string): Promise<PartnerState | null>;
}

export type CommissionScheduleDenialCode =
  | "invalid_request"
  | "partner_not_found"
  | "partner_not_active"
  | "program_binding_not_found"
  | "program_binding_ambiguous"
  | "program_binding_invalid"
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

      const partnerState = await deps.partners.getPartnerStateAt(input.partnerId, input.occurredAt);
      if (partnerState === null) return { ok: false, code: "partner_not_found" };
      if (!partnerCanEarn(partnerState)) return { ok: false, code: "partner_not_active" };

      const all = await deps.bindings.listForPartner(input.partnerId);
      const invalidBinding = all.some((binding) => {
        const start = validInstant(binding.effectiveAt);
        const end = binding.terminatedAt === null ? null : validInstant(binding.terminatedAt);
        return binding.bindingId.trim().length === 0 || binding.partnerId !== input.partnerId ||
          !Number.isSafeInteger(binding.scheduleVersion) || binding.scheduleVersion <= 0 ||
          !/^[0-9a-f]{64}$/.test(binding.scheduleHash) || start === null ||
          (binding.terminatedAt !== null && (end === null || end <= start)) ||
          binding.authorityReference.trim().length === 0 || validInstant(binding.recordedAt) === null;
      });
      if (invalidBinding) return { ok: false, code: "program_binding_invalid" };
      const effective = all.filter((binding) => {
        const start = validInstant(binding.effectiveAt)!;
        const end = binding.terminatedAt === null ? null : validInstant(binding.terminatedAt)!;
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
        bindingStart < scheduleStart ||
        (schedule.measurementPeriod.anchor === "contract_effective_at" && bindingStart !== scheduleStart)
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
  lifecycleEvents: readonly CommissionProgramBindingLifecycleEvent[] = [],
): CommissionProgramBindingRepository {
  const eventsByBinding = new Map<string, CommissionProgramBindingLifecycleEvent[]>();
  lifecycleEvents.forEach((event) => {
    const events = eventsByBinding.get(event.bindingId) ?? [];
    events.push(Object.freeze(structuredClone(event)));
    eventsByBinding.set(event.bindingId, events);
  });
  const bindings = seed.map((source) => {
    const binding: {
      -readonly [Key in keyof CommissionProgramBinding]: CommissionProgramBinding[Key]
    } = structuredClone(source);
    const events = [...(eventsByBinding.get(binding.bindingId) ?? [])]
      .sort((left, right) => left.sequence - right.sequence);
    const sequences = new Set<number>();
    for (const event of events) {
      if (
        event.kind !== "terminated" || event.sequence !== 1 ||
        sequences.has(event.sequence) || validInstant(event.effectiveAt) === null ||
        validInstant(event.recordedAt) === null || event.authorityReference.trim().length === 0
      ) throw new Error(`Invalid immutable lifecycle event for binding ${binding.bindingId}.`);
      sequences.add(event.sequence);
    }
    if (events.length > 1) throw new Error(`Binding ${binding.bindingId} has multiple termination events.`);
    if (events.length === 1) binding.terminatedAt = events[0].effectiveAt;
    return Object.freeze(binding);
  });
  const repository: CommissionProgramBindingRepository = {
    async listForPartner(partnerId) {
      return bindings.filter((binding) => binding.partnerId === partnerId);
    },
  };
  return Object.freeze(repository);
}
