import { describe, expect, it } from "vitest";
import {
  createActivationService,
  createInMemoryLedger,
  createInMemoryMembershipState,
  createInMemoryReceipts,
  portalUnlocked,
  type AdminVerificationInput,
} from "./activation";
import {
  ACTIVATION_AMOUNT_CENTS,
  FoundingActivationError,
  RENEWAL_AMOUNT_CENTS,
  type MemberPaymentSubmission,
  type PaymentMethodSnapshot,
} from "./obligations";
import { createInMemoryObligationsStore } from "./persistence/obligations-store";
import { createInMemoryPeriodsStore } from "./persistence/periods-store";

const NOW = new Date("2026-07-22T00:00:00.000Z");
const PERIOD_END = "2026-08-21T00:00:00.000Z";

const ADMIN = { adminId: "admin-samuel", role: "owner", ip: "203.0.113.10", userAgent: "vitest" };

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

function submissionFields(
  xeniosRef: string,
  overrides: Partial<Omit<MemberPaymentSubmission, "submittedAt">> = {},
): Omit<MemberPaymentSubmission, "submittedAt"> {
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
    ...overrides,
  };
}

function verification(overrides: Partial<AdminVerificationInput> = {}): AdminVerificationInput {
  return {
    amountReceivedCents: ACTIVATION_AMOUNT_CENTS,
    dateReceived: "2026-07-22",
    receivingDestinationRef: "recv-acct-1",
    methodId: "method-zelle",
    externalRef: "EXT-REF-001",
    reconciliationDate: "2026-07-22",
    note: null,
    confirmedReceived: true,
    ...overrides,
  };
}

function makeService() {
  const clock = { current: new Date(NOW) };
  const service = createActivationService({ now: () => new Date(clock.current) });
  return { service, clock };
}

/** The common road to a submitted activation obligation. */
async function submittedActivation(service: ReturnType<typeof createActivationService>) {
  const created = await service.createActivation("member-1", method());
  return service.recordSubmission(created.obligationId, submissionFields(created.humanRef), {
    memberId: "member-1",
  });
}

// ---------------------------------------------------------------------------
// Creation: $50 includes the first 30 days, nothing else is owed
// ---------------------------------------------------------------------------

describe("createActivation", () => {
  it("creates exactly one $50 obligation and no $25 companion", async () => {
    const { service } = makeService();
    await service.createActivation("member-1", method());
    const all = await service.stores.obligations.listByMember("member-1");
    expect(all).toHaveLength(1);
    expect(all[0].type).toBe("activation_50");
    expect(all[0].expectedAmountCents).toBe(5000);
    expect(all.some((o) => o.type === "renewal_25")).toBe(false);
  });

  it("is idempotent: a second call returns the existing open obligation", async () => {
    const { service } = makeService();
    const first = await service.createActivation("member-1", method());
    const second = await service.createActivation("member-1", method());
    expect(second.obligationId).toBe(first.obligationId);
    expect(await service.stores.obligations.listByMember("member-1")).toHaveLength(1);
  });

  it("refuses activation for an already-active membership", async () => {
    const { service } = makeService();
    const submitted = await submittedActivation(service);
    await service.verifyPayment(ADMIN, submitted.obligationId, verification(), "key-1");
    await expect(service.createActivation("member-1", method())).rejects.toMatchObject({
      code: "already_exists",
    });
  });
});

// ---------------------------------------------------------------------------
// Member submission never activates; the portal stays locked
// ---------------------------------------------------------------------------

describe("recordSubmission", () => {
  it("records the report without touching membership, periods, receipts, or the ledger", async () => {
    const { service } = makeService();
    const submitted = await submittedActivation(service);
    expect(submitted.status).toBe("submitted");

    const membership = await service.stores.membership.getState("member-1");
    expect(membership.status).toBe("pending_activation");
    expect(membership.activatedAt).toBeNull();
    expect(portalUnlocked(membership)).toBe(false);
    expect(await service.stores.periods.listByMember("member-1")).toEqual([]);
    expect(await service.stores.ledger.listByMember("member-1")).toEqual([]);
    expect(await service.stores.receipts.findByObligation(submitted.obligationId)).toBeNull();
  });

  it("refuses a report from a member who does not own the obligation", async () => {
    const { service } = makeService();
    const created = await service.createActivation("member-1", method());
    await expect(
      service.recordSubmission(created.obligationId, submissionFields(created.humanRef), {
        memberId: "member-2",
      }),
    ).rejects.toMatchObject({ code: "not_permitted" });
  });

  it("flags a re-used external reference as duplicate, still without activating", async () => {
    const { service } = makeService();
    const a = await service.createActivation("member-1", method());
    await service.recordSubmission(a.obligationId, submissionFields(a.humanRef), { memberId: "member-1" });
    const b = await service.createActivation("member-2", method());
    const flagged = await service.recordSubmission(
      b.obligationId,
      submissionFields(b.humanRef),
      { memberId: "member-2" },
    );
    expect(flagged.status).toBe("duplicate");
    expect((await service.stores.membership.getState("member-2")).status).toBe("pending_activation");
  });
});

// ---------------------------------------------------------------------------
// verifyPayment: the one place activation happens
// ---------------------------------------------------------------------------

describe("verifyPayment", () => {
  it("activates in one pass: verified obligation, ledger, receipt, active membership, 30-day period, first renewal, portal unlock", async () => {
    const { service } = makeService();
    const submitted = await submittedActivation(service);
    const result = await service.verifyPayment(ADMIN, submitted.obligationId, verification(), "key-1");

    // Obligation verified with the admin's record on it.
    expect(result.obligation.status).toBe("verified");
    expect(result.obligation.verification?.confirmedReceived).toBe(true);
    expect(result.obligation.verification?.verifiedAt).toBe(NOW.toISOString());
    expect(result.obligation.receivingAccountRef).toBe("recv-acct-1");

    // Ledger entry.
    const ledger = await service.stores.ledger.listByObligation(submitted.obligationId);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ entryType: "activation_payment", amountCents: 5000 });

    // Receipt, once, label only.
    expect(result.receipt.obligationId).toBe(submitted.obligationId);
    expect(result.receipt.methodLabel).toBe("Zelle");
    expect(result.obligation.receiptRef).toBe(result.receipt.receiptId);

    // Membership active with its activation timestamp; portal unlocked.
    expect(result.membership.status).toBe("active");
    expect(result.membership.activatedAt).toBe(NOW.toISOString());
    expect(portalUnlocked(result.membership)).toBe(true);
    expect(result.portalUnlock).toEqual({ memberId: "member-1", effectiveAt: NOW.toISOString() });

    // The period: starts now, ends +30 CALENDAR days, server-side.
    expect(result.period.sequence).toBe(1);
    expect(result.period.startsAt).toBe(NOW.toISOString());
    expect(result.period.endsAt).toBe(PERIOD_END);
    expect(result.period.fundingObligationId).toBe(submitted.obligationId);

    // The first $25 renewal, due exactly at the period end (30 days AFTER
    // activation, never at activation).
    expect(result.renewalObligation.type).toBe("renewal_25");
    expect(result.renewalObligation.expectedAmountCents).toBe(RENEWAL_AMOUNT_CENTS);
    expect(result.renewalObligation.dueAt).toBe(PERIOD_END);
    expect(result.renewalObligation.status).toBe("upcoming");

    // The audit trail carries the admin identity, old and new state, and
    // hashed request context.
    const verifiedEvent = result.obligation.events.find((e) => e.action === "admin_verified");
    expect(verifiedEvent).toMatchObject({
      actorType: "admin",
      actorId: "admin-samuel",
      actorRole: "owner",
      fromStatus: "submitted",
      toStatus: "verified",
    });
    expect(verifiedEvent?.ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.obligation.events.some((e) => e.action === "portal_unlocked")).toBe(true);
  });

  it("is idempotent: a repeated click with the same key replays ONE membership, ONE period, ONE receipt, ONE renewal", async () => {
    const { service } = makeService();
    const submitted = await submittedActivation(service);
    const first = await service.verifyPayment(ADMIN, submitted.obligationId, verification(), "key-1");
    const replay = await service.verifyPayment(ADMIN, submitted.obligationId, verification(), "key-1");

    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.period.periodId).toBe(first.period.periodId);
    expect(replay.receipt.receiptId).toBe(first.receipt.receiptId);
    expect(replay.renewalObligation.obligationId).toBe(first.renewalObligation.obligationId);

    expect(await service.stores.periods.listByMember("member-1")).toHaveLength(1);
    expect(await service.stores.ledger.listByMember("member-1")).toHaveLength(1);
    const all = await service.stores.obligations.listByMember("member-1");
    expect(all.filter((o) => o.type === "renewal_25")).toHaveLength(1);
  });

  it("refuses a second approval under a DIFFERENT key: activation happens exactly once", async () => {
    const { service } = makeService();
    const submitted = await submittedActivation(service);
    await service.verifyPayment(ADMIN, submitted.obligationId, verification(), "key-1");
    await expect(
      service.verifyPayment(ADMIN, submitted.obligationId, verification(), "key-2"),
    ).rejects.toMatchObject({ code: "already_verified" });
    expect(await service.stores.periods.listByMember("member-1")).toHaveLength(1);
  });

  it("gates on the admin role: a non-verifier role cannot verify", async () => {
    const { service } = makeService();
    const submitted = await submittedActivation(service);
    await expect(
      service.verifyPayment(
        { adminId: "helper-1", role: "support" },
        submitted.obligationId,
        verification(),
        "key-1",
      ),
    ).rejects.toMatchObject({ code: "not_permitted" });
    await expect(
      service.verifyPayment({ adminId: "", role: "owner" }, submitted.obligationId, verification(), "key-1"),
    ).rejects.toMatchObject({ code: "not_permitted" });
    expect((await service.stores.membership.getState("member-1")).status).toBe("pending_activation");
  });

  it("requires every verification field and the explicit confirmation", async () => {
    const { service } = makeService();
    const submitted = await submittedActivation(service);
    await expect(
      service.verifyPayment(
        ADMIN,
        submitted.obligationId,
        verification({ confirmedReceived: false }),
        "key-1",
      ),
    ).rejects.toMatchObject({ code: "validation_failed" });
    await expect(
      service.verifyPayment(
        ADMIN,
        submitted.obligationId,
        verification({ receivingDestinationRef: "" }),
        "key-2",
      ),
    ).rejects.toMatchObject({ code: "validation_failed" });
    expect((await service.stores.membership.getState("member-1")).status).toBe("pending_activation");
  });

  it("refuses a mismatched amount and directs to the mismatch path", async () => {
    const { service } = makeService();
    const submitted = await submittedActivation(service);
    await expect(
      service.verifyPayment(
        ADMIN,
        submitted.obligationId,
        verification({ amountReceivedCents: 4000 }),
        "key-1",
      ),
    ).rejects.toMatchObject({ code: "amount_mismatch" });
    expect((await service.stores.obligations.get(submitted.obligationId))!.status).toBe("submitted");
  });

  it("cannot verify an obligation that was never submitted", async () => {
    const { service } = makeService();
    const created = await service.createActivation("member-1", method());
    await expect(
      service.verifyPayment(ADMIN, created.obligationId, verification(), "key-1"),
    ).rejects.toMatchObject({ code: "illegal_transition" });
  });

  it("routes renewal obligations to the renewal service instead", async () => {
    const { service } = makeService();
    const submitted = await submittedActivation(service);
    const result = await service.verifyPayment(ADMIN, submitted.obligationId, verification(), "key-1");
    await expect(
      service.verifyPayment(ADMIN, result.renewalObligation.obligationId, verification(), "key-2"),
    ).rejects.toMatchObject({ code: "validation_failed" });
  });

  it("uses the server clock for the period, not any admin-entered date", async () => {
    const { service } = makeService();
    const submitted = await submittedActivation(service);
    const result = await service.verifyPayment(
      ADMIN,
      submitted.obligationId,
      verification({ dateReceived: "2020-01-01", reconciliationDate: "2020-01-02" }),
      "key-1",
    );
    expect(result.period.startsAt).toBe(NOW.toISOString());
    expect(result.period.endsAt).toBe(PERIOD_END);
  });
});

// ---------------------------------------------------------------------------
// The non-activating transitions
// ---------------------------------------------------------------------------

describe("review transitions", () => {
  it("reject, request-info, mismatch, duplicate, and cancel never activate anything", async () => {
    const { service } = makeService();

    for (const act of [
      (id: string) => service.reject(ADMIN, id, "does not reconcile"),
      (id: string) => service.requestInfo(ADMIN, id, "need the reference"),
      (id: string) => service.markMismatch(ADMIN, id, "sent 40 not 50"),
      (id: string) => service.markDuplicate(ADMIN, id, "same reference as another report"),
      (id: string) => service.cancel(ADMIN, id, "member withdrew"),
    ]) {
      const memberId = `member-${Math.random().toString(36).slice(2, 10)}`;
      const created = await service.createActivation(memberId, method());
      const submitted = await service.recordSubmission(
        created.obligationId,
        submissionFields(created.humanRef, { externalRef: null }),
        { memberId },
      );
      await act(submitted.obligationId);
      const membership = await service.stores.membership.getState(memberId);
      expect(membership.status).toBe("pending_activation");
      expect(await service.stores.periods.listByMember(memberId)).toEqual([]);
      expect(await service.stores.receipts.findByObligation(submitted.obligationId)).toBeNull();
    }
  });

  it("review transitions carry the admin identity in the trail", async () => {
    const { service } = makeService();
    const submitted = await submittedActivation(service);
    const rejected = await service.reject(ADMIN, submitted.obligationId, "no matching deposit");
    const last = rejected.events[rejected.events.length - 1];
    expect(last).toMatchObject({ actorId: "admin-samuel", actorRole: "owner", toStatus: "rejected" });
  });

  it("migrates an open obligation to a phase B method by configuration", async () => {
    const { service } = makeService();
    const created = await service.createActivation("member-1", method());
    const migrated = await service.migrateMethod(
      ADMIN,
      created.obligationId,
      method({ methodId: "method-card", category: "business_integrated", label: "Card", productPurchaseEligible: true }),
      "phase_b_business_methods",
    );
    expect(migrated.bridgePhase).toBe("phase_b_business_methods");
    expect(migrated.status).toBe("due");
    expect((await service.stores.membership.getState("member-1")).status).toBe("pending_activation");
  });

  it("refuses migration once verified", async () => {
    const { service } = makeService();
    const submitted = await submittedActivation(service);
    await service.verifyPayment(ADMIN, submitted.obligationId, verification(), "key-1");
    await expect(
      service.migrateMethod(ADMIN, submitted.obligationId, method(), "phase_b_business_methods"),
    ).rejects.toMatchObject({ code: "illegal_transition" });
  });
});

// ---------------------------------------------------------------------------
// Reversal and refund (money moves backward, never silently)
// ---------------------------------------------------------------------------

describe("reversePayment and refundPayment", () => {
  it("a reversal appends a negative ledger entry and suspends the funded membership", async () => {
    const { service } = makeService();
    const submitted = await submittedActivation(service);
    await service.verifyPayment(ADMIN, submitted.obligationId, verification(), "key-1");

    const reversed = await service.reversePayment(ADMIN, submitted.obligationId, "bank reversal");
    expect(reversed.status).toBe("reversed");

    const ledger = await service.stores.ledger.listByObligation(submitted.obligationId);
    expect(ledger.map((e) => e.amountCents)).toEqual([5000, -5000]);
    expect(ledger[1].entryType).toBe("reversal");

    const membership = await service.stores.membership.getState("member-1");
    expect(membership.status).toBe("suspended");
    // History survives: the period row is never deleted.
    expect(await service.stores.periods.listByMember("member-1")).toHaveLength(1);
  });

  it("a refund unwinds the same way with its own entry type", async () => {
    const { service } = makeService();
    const submitted = await submittedActivation(service);
    await service.verifyPayment(ADMIN, submitted.obligationId, verification(), "key-1");
    const refunded = await service.refundPayment(ADMIN, submitted.obligationId, "goodwill refund");
    expect(refunded.status).toBe("refunded");
    const ledger = await service.stores.ledger.listByObligation(submitted.obligationId);
    expect(ledger[1]).toMatchObject({ entryType: "refund", amountCents: -5000 });
  });

  it("cannot reverse an unverified obligation", async () => {
    const { service } = makeService();
    const submitted = await submittedActivation(service);
    await expect(
      service.reversePayment(ADMIN, submitted.obligationId, "nothing to reverse"),
    ).rejects.toMatchObject({ code: "illegal_transition" });
  });
});

// ---------------------------------------------------------------------------
// Wiring smoke: injected stores are honored
// ---------------------------------------------------------------------------

describe("createActivationService wiring", () => {
  it("uses the injected stores rather than creating its own", async () => {
    const obligations = createInMemoryObligationsStore();
    const periods = createInMemoryPeriodsStore();
    const membership = createInMemoryMembershipState();
    const ledger = createInMemoryLedger();
    const receipts = createInMemoryReceipts();
    const service = createActivationService({
      obligations,
      periods,
      membership,
      ledger,
      receipts,
      now: () => new Date(NOW),
    });
    const submitted = await submittedActivation(service);
    await service.verifyPayment(ADMIN, submitted.obligationId, verification(), "key-1");
    expect(await periods.listByMember("member-1")).toHaveLength(1);
    expect((await membership.getState("member-1")).status).toBe("active");
    expect(await ledger.listByMember("member-1")).toHaveLength(1);
    expect(await receipts.findByObligation(submitted.obligationId)).not.toBeNull();
    expect((await obligations.get(submitted.obligationId))!.status).toBe("verified");
  });

  it("throws FoundingActivationError with a stable code for a missing obligation", async () => {
    const { service } = makeService();
    await expect(service.verifyPayment(ADMIN, "no-such-id", verification(), "key-1")).rejects.toBeInstanceOf(
      FoundingActivationError,
    );
  });
});
