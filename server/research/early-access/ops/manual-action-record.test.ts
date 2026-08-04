import { describe, expect, it } from "vitest";
import {
  decideSupplierDispatch,
  EARLY_ACCESS_FULFILLMENT_TARGET_COPY,
  isApprovedFulfillmentCopy,
  MANUAL_ACTION_KINDS,
  recordManualAction,
  type SupplierDispatchAttempt,
} from "./manual-action-record";

const AT = "2026-08-04T15:00:00.000Z";

function input(overrides: Record<string, unknown> = {}) {
  return {
    kind: "payment_verification" as const,
    subjectId: "ord_ea_0001",
    actor: "Samuel Boadu",
    at: AT,
    channel: "portal" as const,
    externalReference: "zelle-8891",
    priorStatus: "payment_under_review",
    newStatus: "payment_verified",
    note: "Confirmed against the bank statement line for 2026-08-04.",
    ...overrides,
  };
}

describe("the manual action record", () => {
  it("records all eight required facts and an audit event", () => {
    const result = recordManualAction(input() as never);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const record = result.value;
    // The eight the brief names, each present and non-empty.
    expect(record.actor).toBe("Samuel Boadu");
    expect(record.at).toBe(AT);
    expect(record.channel).toBe("portal");
    expect(record.externalReference).toBe("zelle-8891");
    expect(record.priorStatus).toBe("payment_under_review");
    expect(record.newStatus).toBe("payment_verified");
    expect(record.note.length).toBeGreaterThan(0);
    expect(record.audit).toEqual({
      type: "early_access.manual.payment_verification",
      subjectId: "ord_ea_0001",
      actor: "Samuel Boadu",
      at: AT,
      from: "payment_under_review",
      to: "payment_verified",
      channel: "portal",
      externalReference: "zelle-8891",
    });
  });

  it("supports every manual step Samuel performs by hand", () => {
    for (const kind of MANUAL_ACTION_KINDS) {
      const result = recordManualAction(input({ kind }) as never);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.audit.type).toBe(`early_access.manual.${kind}`);
    }
  });

  it.each(["the system", "system", "automation", "bot", "admin", "operator", " "])(
    "refuses %j as the actor, because a human is accountable",
    (actor) => {
      const result = recordManualAction(input({ actor }) as never);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("ACTOR_NOT_NAMED");
    },
  );

  it("requires a note, so a later reader can tell what was done", () => {
    const result = recordManualAction(input({ note: "" }) as never);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("NOTE_INVALID");
  });

  it("allows an explicit null external reference but not a malformed one", () => {
    expect(recordManualAction(input({ externalReference: null }) as never).ok).toBe(true);
    const bad = recordManualAction(input({ externalReference: "   " }) as never);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.code).toBe("EXTERNAL_REFERENCE_INVALID");
  });

  it.each([
    ["an unknown kind", { kind: "telepathy" }, "KIND_INVALID"],
    ["an unknown channel", { channel: "carrier_pigeon" }, "CHANNEL_INVALID"],
    ["a missing prior status", { priorStatus: "" }, "STATUS_INVALID"],
    ["a bad instant", { at: "whenever" }, "INSTANT_INVALID"],
    ["an empty subject", { subjectId: "" }, "SUBJECT_INVALID"],
  ])("refuses %s", (_label, overrides, code) => {
    const result = recordManualAction(input(overrides) as never);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(code);
  });
});

describe("supplier dispatch never duplicates a supplier order", () => {
  const attempt = (
    outcome: "sent" | "failed",
    releaseId = "rel_1",
    at = AT,
  ): SupplierDispatchAttempt => ({
    attemptId: `att_${outcome}_${at}`,
    releaseId,
    channel: "email",
    recipient: "supplier@example.invalid",
    at,
    outcome,
    externalReference: null,
  });

  it("creates and sends on the first dispatch", () => {
    const decision = decideSupplierDispatch("rel_1", []);
    expect(decision.decision).toBe("create_and_send");
    expect(decision.releaseId).toBe("rel_1");
  });

  it("RESENDS the same order after a failed send, never creates a second", () => {
    const decision = decideSupplierDispatch("rel_1", [attempt("failed")]);
    expect(decision.decision).toBe("resend_existing");
    expect(decision.releaseId).toBe("rel_1");
    if (decision.decision === "resend_existing") {
      expect(decision.attemptNumber).toBe(2);
      expect(decision.reason).toBe("prior_attempt_failed");
    }
  });

  it("still resends the same order after many failures", () => {
    const decision = decideSupplierDispatch("rel_1", [
      attempt("failed", "rel_1", "2026-08-04T15:00:00.000Z"),
      attempt("failed", "rel_1", "2026-08-04T15:05:00.000Z"),
      attempt("failed", "rel_1", "2026-08-04T15:10:00.000Z"),
    ]);
    expect(decision.decision).toBe("resend_existing");
    expect(decision.releaseId).toBe("rel_1");
  });

  it("refuses to silently resend an order the supplier already received", () => {
    // A supplier seeing the same order twice may ship it twice, so this needs a
    // deliberate operator decision rather than an idempotent-looking retry.
    const decision = decideSupplierDispatch("rel_1", [
      attempt("failed", "rel_1", "2026-08-04T15:00:00.000Z"),
      attempt("sent", "rel_1", "2026-08-04T15:05:00.000Z"),
    ]);
    expect(decision.decision).toBe("already_sent");
    if (decision.decision === "already_sent") {
      expect(decision.sentAt).toBe("2026-08-04T15:05:00.000Z");
      expect(decision.reason).toBe("supplier_order_already_delivered");
    }
  });

  it("does not let another order's attempts affect this one", () => {
    const decision = decideSupplierDispatch("rel_1", [
      attempt("sent", "rel_2"),
      attempt("failed", "rel_3"),
    ]);
    expect(decision.decision).toBe("create_and_send");
  });
});

describe("customer-facing fulfilment copy", () => {
  it("is the approved string, character for character", () => {
    expect(EARLY_ACCESS_FULFILLMENT_TARGET_COPY).toBe(
      "Current fulfillment target: within 72 hours after payment verification and product availability confirmation. Tracking will be provided when the shipment is released.",
    );
  });

  it("reads as a target and never as a promised date", () => {
    expect(EARLY_ACCESS_FULFILLMENT_TARGET_COPY).toContain("target");
    expect(EARLY_ACCESS_FULFILLMENT_TARGET_COPY).not.toMatch(
      /guarantee|guaranteed|will arrive|delivered by|deliver by/i,
    );
  });

  it.each([
    "Current fulfillment target: within 72 hours. Tracking will be provided.",
    `${EARLY_ACCESS_FULFILLMENT_TARGET_COPY} Estimated delivery 2026-08-07.`,
    `${EARLY_ACCESS_FULFILLMENT_TARGET_COPY} (71:59:58 remaining)`,
    "Ships within 72 hours",
  ])("refuses a paraphrase, a countdown, or an appended ETA: %j", (candidate) => {
    expect(isApprovedFulfillmentCopy(candidate)).toBe(false);
  });

  it("accepts only the exact approved string", () => {
    expect(isApprovedFulfillmentCopy(EARLY_ACCESS_FULFILLMENT_TARGET_COPY)).toBe(true);
  });
});
