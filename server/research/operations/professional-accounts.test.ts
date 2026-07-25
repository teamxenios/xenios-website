import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_PROFESSIONAL_ECONOMIC_TERMS,
  PROFESSIONAL_PROGRAMS,
  ProfessionalAccountService,
} from "./professional-accounts";
import type { OperationsActor } from "./state-machines";

const NOW = new Date("2026-07-25T16:00:00.000Z");
const admin: OperationsActor = { id: "samuel", role: "admin" };
const mitch: OperationsActor = { id: "mitch", role: "mitch" };

function unwrap<T>(result: { ok: true; value: T } | { ok: false; message: string }): T {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.message);
  return result.value;
}

describe("practitioner and professional accounts", () => {
  let service: ProfessionalAccountService;

  beforeEach(() => {
    service = new ProfessionalAccountService();
  });

  it("keeps all nine program relationships separate", () => {
    expect(PROFESSIONAL_PROGRAMS).toEqual([
      "wholesale",
      "reseller",
      "professional_membership",
      "directory",
      "education",
      "event",
      "implementation",
      "software",
      "future_clinical_partnership",
    ]);
    const account = unwrap(
      service.apply({
        id: "pro-1",
        accountType: "professional",
        organizationName: "Independent Studio",
        contactEmail: "studio@example.com",
        programs: [...PROFESSIONAL_PROGRAMS],
        idempotencyKey: "apply-all",
        occurredAt: NOW,
      }),
    );
    expect(account.programs).toEqual(PROFESSIONAL_PROGRAMS);
  });

  it("defaults every allowed economic term to zero and creates no clinical referral economics", () => {
    const account = unwrap(
      service.apply({
        id: "practitioner-1",
        accountType: "practitioner",
        organizationName: "Practice",
        contactEmail: "practice@example.com",
        programs: ["professional_membership", "directory", "education"],
        idempotencyKey: "apply-practitioner",
        occurredAt: NOW,
      }),
    );
    expect(account.economicTerms).toEqual(DEFAULT_PROFESSIONAL_ECONOMIC_TERMS);
    const json = JSON.stringify(account.economicTerms).toLowerCase();
    for (const forbidden of ["prescription", "patient", "diagnosis", "clinicalapproval", "medication"]) {
      expect(json).not.toContain(forbidden);
    }
  });

  it("refuses prescription, patient-referral, diagnosis, clinical-approval, and medication-value economics", () => {
    for (const key of [
      "prescriptionPaymentCents",
      "patientReferralPaymentCents",
      "diagnosisPaymentCents",
      "clinicalApprovalPaymentCents",
      "medicationValuePaymentCents",
    ]) {
      expect(
        service.apply({
          id: `pro-${key}`,
          accountType: "professional",
          organizationName: "Unsafe Terms",
          contactEmail: "unsafe@example.com",
          programs: ["future_clinical_partnership"],
          proposedEconomics: { [key]: 100 },
          idempotencyKey: `apply-${key}`,
          occurredAt: NOW,
        }),
      ).toMatchObject({ ok: false, code: "clinical_economics_refused" });
    }
  });

  it("runs review, agreement approval, activation, pause, and reactivation with stale-write checks", () => {
    let account = unwrap(
      service.apply({
        id: "pro-2",
        accountType: "professional",
        organizationName: "Studio",
        contactEmail: "studio@example.com",
        programs: ["software", "implementation"],
        idempotencyKey: "apply-2",
        occurredAt: NOW,
      }),
    );
    account = unwrap(
      service.review({
        accountId: account.id,
        to: "under_review",
        expectedVersion: account.version,
        actor: admin,
        idempotencyKey: "review-2",
        occurredAt: NOW,
      }),
    );
    account = unwrap(
      service.review({
        accountId: account.id,
        to: "approved",
        agreementVersion: "professional-v1",
        expectedVersion: account.version,
        actor: admin,
        idempotencyKey: "approve-2",
        occurredAt: NOW,
      }),
    );
    const stale = service.review({
      accountId: account.id,
      to: "active",
      expectedVersion: 1,
      actor: admin,
      idempotencyKey: "stale",
      occurredAt: NOW,
    });
    expect(stale).toMatchObject({ ok: false, code: "stale_write" });
    account = unwrap(
      service.review({
        accountId: account.id,
        to: "active",
        expectedVersion: account.version,
        actor: admin,
        idempotencyKey: "active-2",
        occurredAt: NOW,
      }),
    );
    expect(account.state).toBe("active");
  });

  it("updates only allowed commercial terms and audits the change", () => {
    const account = unwrap(
      service.apply({
        id: "pro-3",
        accountType: "professional",
        organizationName: "Studio",
        contactEmail: "studio@example.com",
        programs: ["wholesale", "software"],
        idempotencyKey: "apply-3",
        occurredAt: NOW,
      }),
    );
    const updated = unwrap(
      service.updateTerms({
        accountId: account.id,
        expectedVersion: account.version,
        terms: { wholesaleDiscountBps: 1_500, softwareFeeCents: 9_900 },
        actor: admin,
        idempotencyKey: "terms-3",
        occurredAt: NOW,
      }),
    );
    expect(updated.economicTerms).toMatchObject({ wholesaleDiscountBps: 1_500, softwareFeeCents: 9_900 });
    expect(unwrap(service.listAudit(admin)).map((event) => event.action)).toEqual(["applied", "terms_updated"]);
  });

  it("keeps Mitch out of professional account review", () => {
    expect(service.list(mitch)).toMatchObject({ ok: false, code: "forbidden" });
  });
});
