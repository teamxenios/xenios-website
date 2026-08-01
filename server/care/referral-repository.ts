import {
  CARE_CLINICAL_CAPABILITIES_DISABLED,
  type CareClinicalCapabilityFlags,
} from "@shared/care/clinical-actions";
import {
  guardCareReferralPayload,
  projectCareReferral,
  type CareReferral,
  type CareReferralGuardRejection,
} from "@shared/care/referral";
import type { CareReferralCoverage } from "./referral";

/**
 * The referral store, as narrow as the record it holds.
 *
 * `save` takes an UNKNOWN payload on purpose. Every caller, including a future
 * one that has drifted from the type, has to pass the runtime guard before a
 * row is written, and the guard is the only thing that produces a
 * `CareReferral`.
 */
export interface CareReferralRepository {
  loadCoverage(stateCode: string): Promise<CareReferralCoverage | null>;
  listForUser(internalUserId: string): Promise<readonly CareReferral[]>;
  listForOperations(): Promise<readonly CareReferral[]>;
  save(referral: CareReferral): Promise<CareReferral>;
}

export type CareReferralWriteRefusal =
  | CareReferralGuardRejection
  | {
      ok: false;
      code: "capability_disabled";
      field: null;
      category: null;
      message: string;
    };

export type CareReferralWriteResult =
  | { ok: true; referral: CareReferral }
  | CareReferralWriteRefusal;

/**
 * Referral writes bind an internal person to a care workflow, so they run
 * behind the existing `CARE_REAL_PATIENT_DATA_ENABLED` capability rather than
 * behind a new parallel flag. In the shipped state the flag is false and this
 * refuses, which is why the refusal lives at the write chokepoint and not in
 * the interface: hiding the button would not stop a direct request.
 */
export const CARE_REFERRAL_WRITE_CAPABILITY = "real_patient_data" as const;

export function careReferralWriteAllowed(
  flags: CareClinicalCapabilityFlags,
): boolean {
  return flags[CARE_REFERRAL_WRITE_CAPABILITY] === true;
}

const CAPABILITY_REFUSAL = {
  ok: false,
  code: "capability_disabled",
  field: null,
  category: null,
  message:
    "Care referrals are not active yet, so nothing can be recorded here.",
} as const;

/**
 * THE ONLY WAY A REFERRAL IS WRITTEN.
 *
 * It refuses before touching the store, so a refused write cannot leave a
 * partial row behind, and the refusal reason never carries the offending
 * value. Order matters: the capability check is first, so a forbidden payload
 * sent while Care is off is refused without the store ever being consulted.
 */
export function guardedCareReferralRepository(
  inner: CareReferralRepository,
  readFlags: () => CareClinicalCapabilityFlags = () =>
    CARE_CLINICAL_CAPABILITIES_DISABLED,
): CareReferralRepository & {
  saveGuarded(payload: unknown): Promise<CareReferralWriteResult>;
} {
  return {
    loadCoverage: (stateCode) => inner.loadCoverage(stateCode),
    listForUser: async (internalUserId) =>
      projectAll(await inner.listForUser(internalUserId)),
    listForOperations: async () => projectAll(await inner.listForOperations()),
    save: (referral) => inner.save(referral),
    async saveGuarded(payload: unknown): Promise<CareReferralWriteResult> {
      if (!careReferralWriteAllowed(readFlags())) {
        return { ...CAPABILITY_REFUSAL };
      }
      const guarded = guardCareReferralPayload(payload);
      if (!guarded.ok) return guarded;
      return { ok: true, referral: await inner.save(guarded.referral) };
    },
  };
}

/**
 * Reads are projected through the same closed field set, so a stored row that
 * somehow carried a clinical column cannot reach a rendered surface.
 */
function projectAll(rows: readonly CareReferral[]): readonly CareReferral[] {
  const projected: CareReferral[] = [];
  for (const row of rows) {
    const referral = projectCareReferral(row);
    if (referral) projected.push(referral);
  }
  return projected;
}

/**
 * An in memory store for development and tests. There is no Supabase adapter
 * in this change because the referral table does not exist yet and this lane
 * does not own migrations.
 */
export function inMemoryCareReferralRepository(seed: {
  coverage?: Readonly<Record<string, CareReferralCoverage>>;
  referrals?: readonly CareReferral[];
} = {}): CareReferralRepository & { rows: CareReferral[] } {
  const rows: CareReferral[] = [...(seed.referrals ?? [])];
  const coverage = seed.coverage ?? {};
  return {
    rows,
    async loadCoverage(stateCode) {
      return coverage[stateCode.trim().toUpperCase()] ?? null;
    },
    async listForUser(internalUserId) {
      return rows.filter((row) => row.internalUserId === internalUserId);
    },
    async listForOperations() {
      return [...rows];
    },
    async save(referral) {
      const index = rows.findIndex((row) => row.referralId === referral.referralId);
      if (index >= 0) rows[index] = referral;
      else rows.push(referral);
      return referral;
    },
  };
}
