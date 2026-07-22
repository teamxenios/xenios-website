import { describe, expect, it } from "vitest";
import {
  ACTIVATION_AMOUNT_CENTS,
  ACTIVATION_DESCRIPTION,
  EXPECTED_AMOUNT_BY_TYPE,
  FOUNDING_ACTIVATION_FLAG_ENV,
  FoundingActivationError,
  HUMAN_REF_PATTERN,
  MEMBERSHIP_PERIOD_DAYS,
  OBLIGATION_STATUSES,
  OBLIGATION_TRANSITIONS,
  RENEWAL_AMOUNT_CENTS,
  SUBMISSION_DISPLAY_CONTRACT,
  SUBMITTABLE_STATUSES,
  TERMINAL_STATUSES,
  addCalendarDays,
  canTransition,
  createObligation,
  findDuplicateExternalRefs,
  foundingActivationEnabled,
  migrateObligationMethod,
  newHumanRef,
  recordMemberSubmission,
  snapshotCurrentAgreements,
  transitionObligation,
  validateSubmission,
  validateVerification,
  type AdminVerification,
  type MemberPaymentSubmission,
  type ObligationStatus,
  type PaymentMethodSnapshot,
} from "./obligations";
import { AGREEMENT_DEFINITIONS } from "../agreements";

const NOW = new Date("2026-07-22T00:00:00.000Z");

function method(overrides: Partial<PaymentMethodSnapshot> = {}): PaymentMethodSnapshot {
  return {
    methodId: "method-zelle",
    category: "manual_external_payment",
    label: "Zelle",
    instructionsRef: "enc-instr-1",
    productPurchaseEligible: false,
    capturedAt: NOW.toISOString(),
    ...overrides,
  };
}

function submission(
  xeniosRef: string,
  overrides: Partial<MemberPaymentSubmission> = {},
): MemberPaymentSubmission {
  return {
    methodId: "method-zelle",
    amountCents: ACTIVATION_AMOUNT_CENTS,
    sentDate: "2026-07-22",
    sentTime: null,
    senderName: "Test Member",
    senderContact: null,
    senderIdentifierMasked: "ending 1234",
    externalRef: "EXT-REF-001",
    xeniosRef,
    note: null,
    evidenceRef: "media-ref-1",
    accuracyCertified: true,
    submittedAt: NOW.toISOString(),
    ...overrides,
  };
}

const MEMBER_ACTOR = { actorType: "member" as const, actorId: "member-1" };

// ---------------------------------------------------------------------------
// Flag: default false, exact-string opt in
// ---------------------------------------------------------------------------

describe("foundingActivationEnabled", () => {
  it("defaults to false when the variable is absent", () => {
    expect(foundingActivationEnabled({} as NodeJS.ProcessEnv)).toBe(false);
  });

  it('is on only for the exact string "true"', () => {
    expect(foundingActivationEnabled({ [FOUNDING_ACTIVATION_FLAG_ENV]: "true" })).toBe(true);
    expect(foundingActivationEnabled({ [FOUNDING_ACTIVATION_FLAG_ENV]: "TRUE" })).toBe(false);
    expect(foundingActivationEnabled({ [FOUNDING_ACTIVATION_FLAG_ENV]: "1" })).toBe(false);
    expect(foundingActivationEnabled({ [FOUNDING_ACTIVATION_FLAG_ENV]: "" })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

describe("obligation vocabulary", () => {
  it("has exactly 15 statuses, all distinct", () => {
    expect(OBLIGATION_STATUSES).toHaveLength(15);
    expect(new Set(OBLIGATION_STATUSES).size).toBe(15);
  });

  it("defines transitions for every status and only to known statuses", () => {
    for (const status of OBLIGATION_STATUSES) {
      const targets = OBLIGATION_TRANSITIONS[status];
      expect(targets).toBeDefined();
      for (const target of targets) expect(OBLIGATION_STATUSES).toContain(target);
    }
  });

  it("terminal statuses go nowhere", () => {
    for (const status of TERMINAL_STATUSES) {
      expect(OBLIGATION_TRANSITIONS[status]).toEqual([]);
    }
  });

  it("verified can only unwind to reversed or refunded, never back to open work", () => {
    expect([...OBLIGATION_TRANSITIONS.verified].sort()).toEqual(["refunded", "reversed"]);
  });

  it("no status can jump straight to verified except through a report or review", () => {
    const canReachVerified = OBLIGATION_STATUSES.filter((s) =>
      OBLIGATION_TRANSITIONS[s as ObligationStatus].includes("verified"),
    );
    expect(canReachVerified.sort()).toEqual(["submitted", "under_review"]);
  });
});

// ---------------------------------------------------------------------------
// Pricing facts
// ---------------------------------------------------------------------------

describe("pricing", () => {
  it("binds $50 to activation and $25 to renewal", () => {
    expect(EXPECTED_AMOUNT_BY_TYPE.activation_50).toBe(5000);
    expect(EXPECTED_AMOUNT_BY_TYPE.renewal_25).toBe(2500);
  });

  it("the activation description says $50 includes the first 30 days and no $25 is due", () => {
    expect(ACTIVATION_DESCRIPTION).toContain("first 30 calendar days");
    expect(ACTIVATION_DESCRIPTION).toContain("No separate $25");
  });

  it("a membership period is 30 calendar days", () => {
    expect(MEMBERSHIP_PERIOD_DAYS).toBe(30);
    expect(addCalendarDays(NOW, 30).toISOString()).toBe("2026-08-21T00:00:00.000Z");
  });
});

// ---------------------------------------------------------------------------
// Human references
// ---------------------------------------------------------------------------

describe("newHumanRef", () => {
  it("matches XRM-XXXXXXXX with the unambiguous alphabet", () => {
    for (let i = 0; i < 50; i++) expect(newHumanRef()).toMatch(HUMAN_REF_PATTERN);
  });

  it("derives from the injected randomness without modulo bias", () => {
    const fixed = (size: number) => Buffer.alloc(size, 0);
    expect(newHumanRef(fixed)).toBe("XRM-AAAAAAAA");
    const maxed = (size: number) => Buffer.alloc(size, 0xff);
    expect(newHumanRef(maxed)).toBe("XRM-99999999");
  });
});

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

describe("createObligation", () => {
  it("creates the $50 activation obligation, due now, and creates NOTHING else", () => {
    const record = createObligation({ memberId: "member-1", type: "activation_50", method: method(), now: NOW });
    expect(record.type).toBe("activation_50");
    expect(record.expectedAmountCents).toBe(5000);
    expect(record.status).toBe("due");
    expect(record.dueAt).toBe(NOW.toISOString());
    expect(record.humanRef).toMatch(HUMAN_REF_PATTERN);
    expect(record.submission).toBeNull();
    expect(record.verification).toBeNull();
    expect(record.receiptRef).toBeNull();
    // The one creation audit event; no companion obligation exists anywhere.
    expect(record.events).toHaveLength(1);
    expect(record.events[0].action).toBe("created");
  });

  it("creates a renewal as upcoming with its due date at the period end", () => {
    const due = addCalendarDays(NOW, 30);
    const record = createObligation({
      memberId: "member-1",
      type: "renewal_25",
      method: method(),
      now: NOW,
      dueAt: due,
    });
    expect(record.status).toBe("upcoming");
    expect(record.expectedAmountCents).toBe(RENEWAL_AMOUNT_CENTS);
    expect(record.dueAt).toBe(due.toISOString());
  });

  it("snapshots the current agreement versions onto the obligation", () => {
    const record = createObligation({ memberId: "member-1", type: "activation_50", method: method(), now: NOW });
    expect(record.agreements.agreements.map((a) => a.key)).toEqual(
      AGREEMENT_DEFINITIONS.map((d) => d.key),
    );
    expect(record.agreements.agreements[0].version).toBe(AGREEMENT_DEFINITIONS[0].version);
    expect(record.agreements.capturedAt).toBe(NOW.toISOString());
  });

  it("refuses a bridge method that claims product-purchase eligibility", () => {
    expect(() =>
      createObligation({
        memberId: "member-1",
        type: "activation_50",
        method: method({ productPurchaseEligible: true }),
        now: NOW,
      }),
    ).toThrowError(FoundingActivationError);
  });

  it("carries the method snapshot with a label and opaque ref only", () => {
    const record = createObligation({ memberId: "member-1", type: "activation_50", method: method(), now: NOW });
    expect(record.method.label).toBe("Zelle");
    expect(record.method.instructionsRef).toBe("enc-instr-1");
    expect(Object.keys(record.method).sort()).toEqual([
      "capturedAt",
      "category",
      "instructionsRef",
      "label",
      "methodId",
      "productPurchaseEligible",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

describe("transitionObligation", () => {
  it("moves along a legal edge and appends an audit event with old and new state", () => {
    const record = createObligation({ memberId: "member-1", type: "activation_50", method: method(), now: NOW });
    const submitted = recordMemberSubmission(record, submission(record.humanRef), MEMBER_ACTOR, NOW);
    const reviewed = transitionObligation(
      submitted,
      "under_review",
      { actorType: "admin", actorId: "admin-1", actorRole: "owner" },
      NOW,
      "review_started",
    );
    expect(reviewed.status).toBe("under_review");
    const last = reviewed.events[reviewed.events.length - 1];
    expect(last.fromStatus).toBe("submitted");
    expect(last.toStatus).toBe("under_review");
    expect(last.actorId).toBe("admin-1");
  });

  it("refuses an illegal edge", () => {
    const record = createObligation({ memberId: "member-1", type: "activation_50", method: method(), now: NOW });
    expect(canTransition("due", "verified")).toBe(false);
    expect(() =>
      transitionObligation(record, "verified", { actorType: "system", actorId: null }, NOW, "x"),
    ).toThrowError(/cannot move from due to verified/);
  });

  it("hashes IP and user agent in the trail, never storing them raw", () => {
    const record = createObligation({ memberId: "member-1", type: "activation_50", method: method(), now: NOW });
    const next = transitionObligation(
      record,
      "submitted",
      { actorType: "member", actorId: "member-1", ip: "203.0.113.10", userAgent: "vitest" },
      NOW,
      "member_submitted",
    );
    const last = next.events[next.events.length - 1];
    expect(last.ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(last.ipHash).not.toContain("203");
    expect(last.userAgentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(last.userAgentHash).not.toContain("vitest");
  });
});

// ---------------------------------------------------------------------------
// Member submission (a report, never an activation)
// ---------------------------------------------------------------------------

describe("recordMemberSubmission", () => {
  it("records the report and moves to submitted, touching nothing else", () => {
    const record = createObligation({ memberId: "member-1", type: "activation_50", method: method(), now: NOW });
    const next = recordMemberSubmission(record, submission(record.humanRef), MEMBER_ACTOR, NOW);
    expect(next.status).toBe("submitted");
    expect(next.submission?.senderName).toBe("Test Member");
    expect(next.submission?.xeniosRef).toBe(record.humanRef);
    // Nothing verification-shaped happened.
    expect(next.verification).toBeNull();
    expect(next.receiptRef).toBeNull();
  });

  it("carries the display contract: submitting does not activate", () => {
    expect(SUBMISSION_DISPLAY_CONTRACT).toContain("does not activate");
    expect(SUBMISSION_DISPLAY_CONTRACT).toContain("verifies every payment by hand");
  });

  it("requires the accuracy certification to be exactly true", () => {
    const record = createObligation({ memberId: "member-1", type: "activation_50", method: method(), now: NOW });
    expect(() =>
      recordMemberSubmission(
        record,
        submission(record.humanRef, { accuracyCertified: false }),
        MEMBER_ACTOR,
        NOW,
      ),
    ).toThrowError(/incomplete/);
  });

  it("rejects an incomplete report with named field errors", () => {
    const errors = validateSubmission(
      submission("XRM-AAAAAAAA", { amountCents: 0, senderName: " ", accuracyCertified: false }),
    );
    expect(errors).toContain("amountCents must be a positive integer");
    expect(errors).toContain("senderName is required");
    expect(errors).toContain("accuracyCertified must be exactly true");
  });

  it("refuses a report while the obligation is under review or closed", () => {
    const record = createObligation({ memberId: "member-1", type: "activation_50", method: method(), now: NOW });
    const submitted = recordMemberSubmission(record, submission(record.humanRef), MEMBER_ACTOR, NOW);
    expect(SUBMITTABLE_STATUSES).not.toContain("submitted");
    expect(() =>
      recordMemberSubmission(submitted, submission(record.humanRef), MEMBER_ACTOR, NOW),
    ).toThrowError(/cannot be submitted/);
  });

  it("allows a resubmission after info was requested", () => {
    const record = createObligation({ memberId: "member-1", type: "activation_50", method: method(), now: NOW });
    const submitted = recordMemberSubmission(record, submission(record.humanRef), MEMBER_ACTOR, NOW);
    const asked = transitionObligation(
      submitted,
      "info_requested",
      { actorType: "admin", actorId: "admin-1" },
      NOW,
      "info_requested",
    );
    const again = recordMemberSubmission(
      asked,
      submission(record.humanRef, { note: "resent with the reference this time" }),
      MEMBER_ACTOR,
      NOW,
    );
    expect(again.status).toBe("submitted");
    expect(again.submission?.note).toBe("resent with the reference this time");
  });
});

// ---------------------------------------------------------------------------
// Duplicate external reference detection
// ---------------------------------------------------------------------------

describe("findDuplicateExternalRefs", () => {
  function submittedRecord(memberId: string, externalRef: string | null) {
    const record = createObligation({ memberId, type: "activation_50", method: method(), now: NOW });
    return recordMemberSubmission(
      record,
      submission(record.humanRef, { externalRef }),
      { actorType: "member", actorId: memberId },
      NOW,
    );
  }

  it("flags a re-used reference on the same method, case and whitespace insensitive", () => {
    const first = submittedRecord("member-1", "EXT-REF-9");
    const second = submittedRecord("member-2", "  ext-ref-9 ");
    const hits = findDuplicateExternalRefs([first, second], second);
    expect(hits.map((h) => h.obligationId)).toEqual([first.obligationId]);
  });

  it("never flags an absent reference or the obligation itself", () => {
    const noRef = submittedRecord("member-1", null);
    expect(findDuplicateExternalRefs([noRef], noRef)).toEqual([]);
    const withRef = submittedRecord("member-2", "EXT-REF-10");
    expect(findDuplicateExternalRefs([withRef], withRef)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Method migration (phase B is configuration, not a rewrite)
// ---------------------------------------------------------------------------

describe("migrateObligationMethod", () => {
  it("swaps the snapshot and phase without moving the status, and records it", () => {
    const record = createObligation({ memberId: "member-1", type: "activation_50", method: method(), now: NOW });
    const businessMethod = method({
      methodId: "method-business-1",
      category: "business_integrated",
      label: "Card",
      productPurchaseEligible: true,
    });
    const migrated = migrateObligationMethod(
      record,
      businessMethod,
      "phase_b_business_methods",
      { actorType: "admin", actorId: "admin-1", actorRole: "owner" },
      NOW,
    );
    expect(migrated.status).toBe(record.status);
    expect(migrated.method.methodId).toBe("method-business-1");
    expect(migrated.bridgePhase).toBe("phase_b_business_methods");
    expect(migrated.events[migrated.events.length - 1].action).toBe("method_migrated");
  });

  it("refuses to migrate a verified or terminal obligation", () => {
    const record = createObligation({ memberId: "member-1", type: "activation_50", method: method(), now: NOW });
    const cancelled = transitionObligation(
      record,
      "cancelled",
      { actorType: "admin", actorId: "admin-1" },
      NOW,
      "cancelled",
    );
    expect(() =>
      migrateObligationMethod(cancelled, method(), "phase_b_business_methods", { actorType: "admin", actorId: "admin-1" }, NOW),
    ).toThrowError(/open, unverified/);
  });

  it("still refuses a bridge method claiming product eligibility on migration", () => {
    const record = createObligation({ memberId: "member-1", type: "activation_50", method: method(), now: NOW });
    expect(() =>
      migrateObligationMethod(
        record,
        method({ productPurchaseEligible: true }),
        "phase_a_manual_bridge",
        { actorType: "admin", actorId: "admin-1" },
        NOW,
      ),
    ).toThrowError(FoundingActivationError);
  });
});

// ---------------------------------------------------------------------------
// Verification validation
// ---------------------------------------------------------------------------

describe("validateVerification", () => {
  const complete: AdminVerification = {
    amountReceivedCents: 5000,
    dateReceived: "2026-07-22",
    receivingDestinationRef: "recv-acct-1",
    methodId: "method-zelle",
    externalRef: "EXT-REF-001",
    reconciliationDate: "2026-07-22",
    note: null,
    confirmedReceived: true,
    verifiedAt: NOW.toISOString(),
  };

  it("passes a complete verification", () => {
    expect(validateVerification(complete)).toEqual([]);
  });

  it("requires the explicit confirmation to be exactly true", () => {
    expect(validateVerification({ ...complete, confirmedReceived: false })).toContain(
      "confirmedReceived must be exactly true",
    );
  });

  it("requires every field", () => {
    const errors = validateVerification({
      ...complete,
      amountReceivedCents: 0,
      dateReceived: "",
      receivingDestinationRef: "",
      methodId: "",
      reconciliationDate: "",
    });
    expect(errors).toHaveLength(5);
  });
});
