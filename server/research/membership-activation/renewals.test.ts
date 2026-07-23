import { describe, expect, it } from "vitest";
import {
  DEFAULT_RENEWAL_POLICY,
  NO_AUTOMATIC_BILLING_CONTRACT,
  SCHEDULE_CHAIN,
  applyScheduleTransitions,
  createRenewalObligation,
  createRenewalService,
  renewalNoticeSchedule,
  scheduleStatusAt,
} from "./renewals";
import { createActivationService, type AdminVerificationInput } from "./activation";
import { createInMemoryLedger, createInMemoryMembershipState, createInMemoryReceipts } from "./activation";
import {
  ACTIVATION_AMOUNT_CENTS,
  RENEWAL_AMOUNT_CENTS,
  addCalendarDays,
  createObligation,
  recordMemberSubmission,
  type MemberPaymentSubmission,
  type ObligationRecord,
  type PaymentMethodSnapshot,
} from "./obligations";
import { createInMemoryObligationsStore } from "./persistence/obligations-store";
import { createInMemoryPeriodsStore } from "./persistence/periods-store";

const T0 = new Date("2026-07-22T00:00:00.000Z");
const PERIOD_1_END = "2026-08-21T00:00:00.000Z";
const PERIOD_2_END = "2026-09-20T00:00:00.000Z";

const ADMIN = { adminId: "admin-samuel", role: "owner" };

function method(): PaymentMethodSnapshot {
  return {
    methodId: "method-zelle",
    category: "manual_external_payment",
    label: "Zelle",
    instructionsRef: "enc-instr-1",
    productPurchaseEligible: false,
    capturedAt: T0.toISOString(),
  };
}

function submissionFields(
  xeniosRef: string,
  amountCents: number,
  externalRef: string,
): Omit<MemberPaymentSubmission, "submittedAt"> {
  return {
    methodId: "method-zelle",
    amountCents,
    sentDate: "2026-08-21",
    sentTime: null,
    senderName: "Test Member",
    senderContact: null,
    senderIdentifierMasked: "ending 1234",
    externalRef,
    xeniosRef,
    note: null,
    evidenceRef: null,
    accuracyCertified: true,
  };
}

function verification(amountCents: number, overrides: Partial<AdminVerificationInput> = {}): AdminVerificationInput {
  return {
    amountReceivedCents: amountCents,
    dateReceived: "2026-08-21",
    receivingDestinationRef: "recv-acct-1",
    methodId: "method-zelle",
    externalRef: null,
    reconciliationDate: "2026-08-21",
    note: null,
    confirmedReceived: true,
    ...overrides,
  };
}

/** Shared world: one clock, shared stores, both services, one activated member. */
async function activatedWorld() {
  const clock = { current: new Date(T0) };
  const now = () => new Date(clock.current);
  const stores = {
    obligations: createInMemoryObligationsStore(),
    periods: createInMemoryPeriodsStore(),
    membership: createInMemoryMembershipState(),
    ledger: createInMemoryLedger(),
    receipts: createInMemoryReceipts(),
  };
  const activation = createActivationService({ ...stores, now });
  const renewals = createRenewalService({ ...stores, now });

  const created = await activation.createActivation("member-1", method());
  await activation.recordSubmission(
    created.obligationId,
    submissionFields(created.humanRef, ACTIVATION_AMOUNT_CENTS, "EXT-ACT-1"),
    { memberId: "member-1" },
  );
  const activated = await activation.verifyPayment(
    ADMIN,
    created.obligationId,
    verification(ACTIVATION_AMOUNT_CENTS),
    "activate-key",
  );
  return { clock, stores, activation, renewals, activated };
}

async function submitRenewal(
  world: Awaited<ReturnType<typeof activatedWorld>>,
  renewal: ObligationRecord,
  externalRef = "EXT-REN-1",
) {
  return world.activation.recordSubmission(
    renewal.obligationId,
    submissionFields(renewal.humanRef, RENEWAL_AMOUNT_CENTS, externalRef),
    { memberId: "member-1" },
  );
}

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

describe("createRenewalObligation", () => {
  it("creates a manual $25 obligation, upcoming, due at the given period end", () => {
    const due = addCalendarDays(T0, 30);
    const record = createRenewalObligation({ memberId: "member-1", method: method(), dueAt: due, now: T0 });
    expect(record.type).toBe("renewal_25");
    expect(record.expectedAmountCents).toBe(2500);
    expect(record.status).toBe("upcoming");
    expect(record.dueAt).toBe(due.toISOString());
  });
});

// ---------------------------------------------------------------------------
// The pure schedule
// ---------------------------------------------------------------------------

describe("scheduleStatusAt", () => {
  const due = new Date("2026-08-21T00:00:00.000Z");

  it("walks upcoming -> due -> overdue -> in_grace -> suspended with the default policy", () => {
    expect(scheduleStatusAt(due, new Date("2026-08-01T00:00:00.000Z"))).toBe("upcoming");
    // The window opens 7 days before the due date.
    expect(scheduleStatusAt(due, new Date("2026-08-14T00:00:00.000Z"))).toBe("due");
    expect(scheduleStatusAt(due, due)).toBe("due");
    // Past due: overdue for 3 days.
    expect(scheduleStatusAt(due, new Date("2026-08-22T00:00:00.000Z"))).toBe("overdue");
    expect(scheduleStatusAt(due, new Date("2026-08-23T23:59:59.000Z"))).toBe("overdue");
    // Grace: days 3 through 9 past due.
    expect(scheduleStatusAt(due, new Date("2026-08-24T00:00:00.000Z"))).toBe("in_grace");
    expect(scheduleStatusAt(due, new Date("2026-08-30T23:59:59.000Z"))).toBe("in_grace");
    // Day 10 past due: suspended.
    expect(scheduleStatusAt(due, new Date("2026-08-31T00:00:00.000Z"))).toBe("suspended");
  });

  it("honors an injected policy", () => {
    const policy = { openDaysBeforeDue: 1, overdueToGraceDays: 1, graceDays: 1 };
    expect(scheduleStatusAt(due, new Date("2026-08-19T00:00:00.000Z"), policy)).toBe("upcoming");
    expect(scheduleStatusAt(due, new Date("2026-08-20T12:00:00.000Z"), policy)).toBe("due");
    expect(scheduleStatusAt(due, new Date("2026-08-21T12:00:00.000Z"), policy)).toBe("overdue");
    expect(scheduleStatusAt(due, new Date("2026-08-22T12:00:00.000Z"), policy)).toBe("in_grace");
    expect(scheduleStatusAt(due, new Date("2026-08-23T00:00:00.000Z"), policy)).toBe("suspended");
  });
});

describe("applyScheduleTransitions", () => {
  function renewalDue(due: Date): ObligationRecord {
    return createRenewalObligation({ memberId: "member-1", method: method(), dueAt: due, now: T0 });
  }

  it("advances one legal step at a time, appending a system event per step", () => {
    const due = new Date("2026-08-21T00:00:00.000Z");
    const record = renewalDue(due);
    const advanced = applyScheduleTransitions(record, new Date("2026-08-25T00:00:00.000Z"));
    expect(advanced.status).toBe("in_grace");
    const walked = advanced.events.filter((e) => e.action === "schedule_advanced");
    // upcoming -> due -> overdue -> in_grace: three steps, all system-actor.
    expect(walked.map((e) => `${e.fromStatus}->${e.toStatus}`)).toEqual([
      "upcoming->due",
      "due->overdue",
      "overdue->in_grace",
    ]);
    expect(walked.every((e) => e.actorType === "system")).toBe(true);
  });

  it("reaches suspended when the grace window is exhausted", () => {
    const due = new Date("2026-08-21T00:00:00.000Z");
    const advanced = applyScheduleTransitions(renewalDue(due), new Date("2026-09-05T00:00:00.000Z"));
    expect(advanced.status).toBe("suspended");
  });

  it("never overrides a submitted report or a closed obligation", () => {
    const due = new Date("2026-08-21T00:00:00.000Z");
    const record = renewalDue(due);
    const submitted = recordMemberSubmission(
      record,
      { ...submissionFields(record.humanRef, RENEWAL_AMOUNT_CENTS, "EXT-1"), submittedAt: T0.toISOString() },
      { actorType: "member", actorId: "member-1" },
      T0,
    );
    expect(applyScheduleTransitions(submitted, new Date("2026-09-05T00:00:00.000Z"))).toBe(submitted);
    expect(SCHEDULE_CHAIN).not.toContain("submitted");
  });

  it("does nothing when the clock has not moved past the current stage", () => {
    const due = new Date("2026-08-21T00:00:00.000Z");
    const record = renewalDue(due);
    expect(applyScheduleTransitions(record, new Date("2026-08-01T00:00:00.000Z"))).toBe(record);
  });
});

// ---------------------------------------------------------------------------
// Notice schedule: data for the email wave; reminders, never money movement
// ---------------------------------------------------------------------------

describe("renewalNoticeSchedule", () => {
  it("defines the seven notices at 7d, 3d, due, 1d over, grace, warning, confirmation", () => {
    const schedule = renewalNoticeSchedule();
    expect(schedule.map((n) => n.key)).toEqual([
      "renewal_upcoming_7d",
      "renewal_upcoming_3d",
      "renewal_due_today",
      "renewal_overdue_1d",
      "renewal_grace_started",
      "renewal_suspension_warning",
      "renewal_suspension_confirmed",
    ]);
    expect(schedule.map((n) => n.offsetDaysFromDue)).toEqual([-7, -3, 0, 1, 3, 8, 10]);
    expect(schedule.every((n) => n.audience === "member")).toBe(true);
    expect(schedule.every((n) => n.template.startsWith("fm_renewal_"))).toBe(true);
  });

  it("derives grace and suspension offsets from the policy", () => {
    const schedule = renewalNoticeSchedule({ openDaysBeforeDue: 7, overdueToGraceDays: 2, graceDays: 4 });
    const byKey = new Map(schedule.map((n) => [n.key, n.offsetDaysFromDue]));
    expect(byKey.get("renewal_grace_started")).toBe(2);
    expect(byKey.get("renewal_suspension_confirmed")).toBe(6);
    expect(byKey.get("renewal_suspension_warning")).toBe(4);
  });

  it("is pure data, and the no-automatic-billing contract is explicit", () => {
    for (const notice of renewalNoticeSchedule()) {
      expect(Object.values(notice).every((v) => typeof v === "string" || typeof v === "number")).toBe(true);
    }
    expect(NO_AUTOMATIC_BILLING_CONTRACT).toContain("never charges you automatically");
    expect(NO_AUTOMATIC_BILLING_CONTRACT).toContain("verifies it by hand");
  });
});

// ---------------------------------------------------------------------------
// Verified renewal: exactly one 30-day extension
// ---------------------------------------------------------------------------

describe("verifyRenewal", () => {
  it("extends EXACTLY one period, continuous from the current period end", async () => {
    const world = await activatedWorld();
    const renewal = world.activated.renewalObligation;

    // The member pays on the due date.
    world.clock.current = new Date(PERIOD_1_END);
    await submitRenewal(world, renewal);
    const result = await world.renewals.verifyRenewal(
      ADMIN,
      renewal.obligationId,
      verification(RENEWAL_AMOUNT_CENTS),
      "renew-key-1",
    );

    expect(result.obligation.status).toBe("verified");
    expect(result.period.sequence).toBe(2);
    // Coverage is continuous: the new period starts where period 1 ends.
    expect(result.period.startsAt).toBe(PERIOD_1_END);
    expect(result.period.endsAt).toBe(PERIOD_2_END);
    expect(result.period.fundingObligationId).toBe(renewal.obligationId);

    const periods = await world.stores.periods.listByMember("member-1");
    expect(periods).toHaveLength(2);

    // The chain continues: the NEXT $25, due at the new period end.
    expect(result.nextRenewalObligation.type).toBe("renewal_25");
    expect(result.nextRenewalObligation.dueAt).toBe(PERIOD_2_END);

    // Money artifacts: one renewal ledger entry, one receipt.
    const ledger = await world.stores.ledger.listByObligation(renewal.obligationId);
    expect(ledger).toEqual([
      expect.objectContaining({ entryType: "renewal_payment", amountCents: 2500 }),
    ]);
    expect(result.receipt.amountCents).toBe(2500);
  });

  it("a duplicate approval cannot extend twice: same key replays, different key is refused", async () => {
    const world = await activatedWorld();
    const renewal = world.activated.renewalObligation;
    world.clock.current = new Date(PERIOD_1_END);
    await submitRenewal(world, renewal);

    const first = await world.renewals.verifyRenewal(
      ADMIN,
      renewal.obligationId,
      verification(RENEWAL_AMOUNT_CENTS),
      "renew-key-1",
    );
    const replay = await world.renewals.verifyRenewal(
      ADMIN,
      renewal.obligationId,
      verification(RENEWAL_AMOUNT_CENTS),
      "renew-key-1",
    );
    expect(replay.replayed).toBe(true);
    expect(replay.period.periodId).toBe(first.period.periodId);

    await expect(
      world.renewals.verifyRenewal(ADMIN, renewal.obligationId, verification(RENEWAL_AMOUNT_CENTS), "renew-key-2"),
    ).rejects.toMatchObject({ code: "already_extended" });

    expect(await world.stores.periods.listByMember("member-1")).toHaveLength(2);
    expect(await world.stores.ledger.listByObligation(renewal.obligationId)).toHaveLength(1);
  });

  it("restarts coverage from now when the membership lapsed before paying", async () => {
    const world = await activatedWorld();
    const renewal = world.activated.renewalObligation;

    // Ten days past the period end.
    const late = new Date("2026-08-31T00:00:00.000Z");
    world.clock.current = late;
    await submitRenewal(world, renewal);
    const result = await world.renewals.verifyRenewal(
      ADMIN,
      renewal.obligationId,
      verification(RENEWAL_AMOUNT_CENTS),
      "renew-key-1",
    );
    expect(result.period.startsAt).toBe(late.toISOString());
    expect(result.period.endsAt).toBe(addCalendarDays(late, 30).toISOString());
  });

  it("reactivates a suspended membership and preserves the original activation timestamp", async () => {
    const world = await activatedWorld();
    const renewal = world.activated.renewalObligation;

    // The schedule sweep suspends the lapsed renewal and the membership.
    world.clock.current = new Date("2026-09-05T00:00:00.000Z");
    const swept = await world.renewals.advanceSchedule(renewal.obligationId);
    expect(swept.status).toBe("suspended");
    expect((await world.stores.membership.getState("member-1")).status).toBe("suspended");

    // The member pays; verification restores access.
    await submitRenewal(world, renewal);
    const result = await world.renewals.verifyRenewal(
      ADMIN,
      renewal.obligationId,
      verification(RENEWAL_AMOUNT_CENTS),
      "renew-key-1",
    );
    expect(result.membership.status).toBe("active");
    expect(result.membership.activatedAt).toBe(T0.toISOString());
  });

  it("member submission alone never extends coverage or changes membership", async () => {
    const world = await activatedWorld();
    const renewal = world.activated.renewalObligation;
    world.clock.current = new Date(PERIOD_1_END);
    await submitRenewal(world, renewal);
    expect(await world.stores.periods.listByMember("member-1")).toHaveLength(1);
    expect((await world.stores.membership.getState("member-1")).status).toBe("active");
  });

  it("enforces the $25 amount, the admin gate, and the full-field requirement", async () => {
    const world = await activatedWorld();
    const renewal = world.activated.renewalObligation;
    world.clock.current = new Date(PERIOD_1_END);
    await submitRenewal(world, renewal);

    await expect(
      world.renewals.verifyRenewal(ADMIN, renewal.obligationId, verification(2000), "k1"),
    ).rejects.toMatchObject({ code: "amount_mismatch" });
    await expect(
      world.renewals.verifyRenewal(
        { adminId: "helper-1", role: "support" },
        renewal.obligationId,
        verification(RENEWAL_AMOUNT_CENTS),
        "k2",
      ),
    ).rejects.toMatchObject({ code: "not_permitted" });
    await expect(
      world.renewals.verifyRenewal(
        ADMIN,
        renewal.obligationId,
        verification(RENEWAL_AMOUNT_CENTS, { confirmedReceived: false }),
        "k3",
      ),
    ).rejects.toMatchObject({ code: "validation_failed" });
    expect(await world.stores.periods.listByMember("member-1")).toHaveLength(1);
  });

  it("refuses an activation obligation and refuses to renew before any activation", async () => {
    const world = await activatedWorld();
    // The activation obligation goes to the activation service, not here.
    await expect(
      world.renewals.verifyRenewal(
        ADMIN,
        world.activated.obligation.obligationId,
        verification(ACTIVATION_AMOUNT_CENTS),
        "k1",
      ),
    ).rejects.toMatchObject({ code: "validation_failed" });

    // A renewal with no period behind it cannot verify.
    const orphanStores = {
      obligations: createInMemoryObligationsStore(),
      periods: createInMemoryPeriodsStore(),
    };
    const orphanService = createRenewalService({ ...orphanStores, now: () => new Date(T0) });
    const orphan = createObligation({
      memberId: "member-9",
      type: "renewal_25",
      method: method(),
      now: T0,
    });
    const submitted = recordMemberSubmission(
      orphan,
      { ...submissionFields(orphan.humanRef, RENEWAL_AMOUNT_CENTS, "EXT-9"), submittedAt: T0.toISOString() },
      { actorType: "member", actorId: "member-9" },
      T0,
    );
    await orphanStores.obligations.save(submitted);
    await expect(
      orphanService.verifyRenewal(ADMIN, orphan.obligationId, verification(RENEWAL_AMOUNT_CENTS), "k2"),
    ).rejects.toMatchObject({ code: "illegal_transition" });
  });

  it("advanceSchedule persists the walk and only suspends at the end of grace", async () => {
    const world = await activatedWorld();
    const renewal = world.activated.renewalObligation;

    world.clock.current = new Date("2026-08-22T00:00:00.000Z");
    const overdue = await world.renewals.advanceSchedule(renewal.obligationId);
    expect(overdue.status).toBe("overdue");
    expect((await world.stores.membership.getState("member-1")).status).toBe("active");

    world.clock.current = new Date("2026-08-25T00:00:00.000Z");
    const grace = await world.renewals.advanceSchedule(renewal.obligationId);
    expect(grace.status).toBe("in_grace");
    expect((await world.stores.membership.getState("member-1")).status).toBe("active");

    world.clock.current = new Date("2026-09-01T00:00:00.000Z");
    const suspended = await world.renewals.advanceSchedule(renewal.obligationId);
    expect(suspended.status).toBe("suspended");
    expect((await world.stores.membership.getState("member-1")).status).toBe("suspended");
    // The walk persisted.
    expect((await world.stores.obligations.get(renewal.obligationId))!.status).toBe("suspended");
  });
});

describe("default policy", () => {
  it("names its numbers", () => {
    expect(DEFAULT_RENEWAL_POLICY).toEqual({ openDaysBeforeDue: 7, overdueToGraceDays: 3, graceDays: 7 });
  });
});
