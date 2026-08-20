// The payment lane's proof. Most of this file is negative: the valuable claims
// are the ones about what CANNOT happen, and each is written so it fails loudly
// if a future edit widens an authority.

import { describe, expect, it, vi } from "vitest";
import {
  assistedOrderPaymentStates,
  isLegalPaymentTransition,
  isSettledPaymentState,
  mayActorReachPaymentState,
  paymentNextActionFor,
} from "../../../../shared/research/assisted-order/payment-contract";
import type { AssistedOrderViewer } from "../ports";
import { InMemoryAssistedOrderPaymentRepository } from "./memory-repository";
import type { AssistedOrderPaymentDependencies } from "./ports";
import {
  AssistedOrderPaymentAuthorizationError,
  AssistedOrderPaymentConflictError,
  AssistedOrderPaymentNotFoundError,
  AssistedOrderPaymentService,
  AssistedOrderPaymentValidationError,
  settlementUniqueKeyFor,
} from "./service";

const REQUEST_ID = "00000000-0000-4000-8000-000000000001";
const REFERENCE = "XRR-20260819-ABCDEF0123";
const OTHER_REQUEST_ID = "00000000-0000-4000-8000-000000000002";
const OTHER_REFERENCE = "XRR-20260819-FEDCBA9876";
const TOTAL_CENTS = 24_800;

const memberViewer: AssistedOrderViewer = Object.freeze({
  actorType: "member",
  memberId: "11111111-1111-4111-8111-111111111111",
  earlyAccessSessionHash: null,
  normalizedEmail: "member@example.com",
  actorLabel: "member@example.com",
  capabilities: new Set(["assisted_orders:submit", "assisted_orders:read_own"]),
});

const otherMemberViewer: AssistedOrderViewer = Object.freeze({
  actorType: "member",
  memberId: "22222222-2222-4222-8222-222222222222",
  earlyAccessSessionHash: null,
  normalizedEmail: "other@example.com",
  actorLabel: "other@example.com",
  capabilities: new Set(["assisted_orders:submit", "assisted_orders:read_own"]),
});

/** An admin with the surface, WITHOUT the verification grant. */
const adminViewer: AssistedOrderViewer = Object.freeze({
  actorType: "admin",
  memberId: null,
  earlyAccessSessionHash: null,
  normalizedEmail: "ops@xeniostechnology.com",
  actorLabel: "ops@xeniostechnology.com",
  capabilities: new Set(["assisted_orders:read_all", "assisted_orders:manage"]),
});

/** An admin who additionally holds the named verification grant. */
const verifierViewer: AssistedOrderViewer = Object.freeze({
  actorType: "admin",
  memberId: null,
  earlyAccessSessionHash: null,
  normalizedEmail: "finance@xeniostechnology.com",
  actorLabel: "finance@xeniostechnology.com",
  capabilities: new Set(["assisted_orders:read_all", "assisted_orders:manage"]),
});

type HarnessOptions = {
  quoteState?: string;
  quoteTotalCents?: number | null;
  acceptanceId?: string | null;
  now?: string;
  instructionsExpiresAt?: string;
  composerReturnsNull?: boolean;
};

function harness(options: HarnessOptions = {}) {
  const repository = new InMemoryAssistedOrderPaymentRepository();
  const audit = vi.fn(async () => undefined);
  let sequence = 0;
  let nowIso = options.now ?? "2026-08-19T12:00:00.000Z";

  const bindings = {
    [REFERENCE]: {
      requestId: REQUEST_ID,
      publicReference: REFERENCE,
      actorMemberId: memberViewer.memberId,
      earlyAccessSessionHash: null,
      normalizedEmail: "member@example.com",
    },
    [OTHER_REFERENCE]: {
      requestId: OTHER_REQUEST_ID,
      publicReference: OTHER_REFERENCE,
      actorMemberId: otherMemberViewer.memberId,
      earlyAccessSessionHash: null,
      normalizedEmail: "other@example.com",
    },
  } as const;

  const deps: AssistedOrderPaymentDependencies = {
    repository,
    quotes: {
      acceptedQuoteFor: async (requestId) => {
        if (requestId !== REQUEST_ID && requestId !== OTHER_REQUEST_ID) {
          return null;
        }
        const isPrimary = requestId === REQUEST_ID;
        const total =
          options.quoteTotalCents === undefined
            ? TOTAL_CENTS
            : options.quoteTotalCents;
        return {
          quoteId: isPrimary ? "quote-1" : "quote-2",
          requestId,
          requestPublicReference: isPrimary ? REFERENCE : OTHER_REFERENCE,
          version: 3,
          state: options.quoteState ?? "accepted",
          totalCents: total as number,
          currency: "USD" as const,
          acceptanceId:
            options.acceptanceId === undefined
              ? "acceptance-1"
              : options.acceptanceId,
          acceptedAt: "2026-08-19T11:00:00.000Z",
          validUntil: "2026-08-26T11:00:00.000Z",
        };
      },
    },
    requests: {
      byPublicReference: async (reference) =>
        (bindings as Record<string, (typeof bindings)[typeof REFERENCE]>)[
          reference
        ] ?? null,
    },
    verification: {
      // ONLY the finance viewer holds the grant. An admin who merely reached
      // the admin surface resolves to null, which is the whole point.
      verifierFor: async (viewer) =>
        viewer.actorLabel === verifierViewer.actorLabel
          ? { adminId: "admin-finance", label: "finance@xeniostechnology.com" }
          : null,
    },
    instructions: {
      compose: async (input) =>
        options.composerReturnsNull
          ? null
          : {
              methodCode: input.methodCode,
              methodLabel: "Bank transfer",
              body: `Send ${input.amountDueCents} cents quoting ${input.paymentReference}.`,
              expiresAt:
                options.instructionsExpiresAt ?? "2026-08-26T12:00:00.000Z",
            },
    },
    audit: { record: audit },
    clock: { now: () => new Date(nowIso) },
    ids: {
      uuid: () => {
        sequence += 1;
        return `id-${String(sequence).padStart(4, "0")}`;
      },
    },
  };

  return {
    service: new AssistedOrderPaymentService(deps),
    repository,
    audit,
    setNow: (iso: string) => {
      nowIso = iso;
    },
  };
}

/** Drive a payment all the way to `paid`, the happy path every test reuses. */
async function settled(h: ReturnType<typeof harness>) {
  const opened = await h.service.open(adminViewer, REQUEST_ID);
  await h.service.presentInstructions(adminViewer, opened.paymentId, "wire");
  await h.service.submitProof(memberViewer, REFERENCE, {
    paymentId: opened.paymentId,
    customerReference: "WIRE-99",
    note: "sent Tuesday",
    idempotencyKey: "key-1",
  });
  await h.service.beginReview(adminViewer, opened.paymentId);
  const paid = await h.service.markPaid(verifierViewer, {
    paymentId: opened.paymentId,
    verifiedAmountCents: TOTAL_CENTS,
    evidenceRef: "bank-ref-1",
  });
  return { paymentId: opened.paymentId, paid };
}

// ---------------------------------------------------------------------------

describe("assisted-order payment contract", () => {
  it("treats exactly one state as settled", () => {
    const settledStates = assistedOrderPaymentStates.filter((state) =>
      isSettledPaymentState(state),
    );
    expect(settledStates).toEqual(["paid"]);
  });

  it("refuses to call a refunded payment settled", () => {
    expect(isSettledPaymentState("refunded")).toBe(false);
  });

  it("lets a customer reach exactly one state, and it is not paid", () => {
    const reachable = assistedOrderPaymentStates.filter((state) =>
      mayActorReachPaymentState("customer", state),
    );
    expect(reachable).toEqual(["proof_submitted"]);
    expect(mayActorReachPaymentState("customer", "paid")).toBe(false);
    expect(mayActorReachPaymentState("customer", "under_review")).toBe(false);
  });

  it("lets no unattended system process reach paid", () => {
    expect(mayActorReachPaymentState("system", "paid")).toBe(false);
  });

  it("never routes to paid without a recorded decision or a resolved exception", () => {
    const originsThatReachPaid = assistedOrderPaymentStates.filter((from) =>
      isLegalPaymentTransition(from, "paid"),
    );
    expect(originsThatReachPaid.sort()).toEqual(["exception", "under_review"]);
  });

  it("makes refunded terminal", () => {
    for (const state of assistedOrderPaymentStates) {
      expect(isLegalPaymentTransition("refunded", state)).toBe(false);
    }
  });

  it("gives every state a next action", () => {
    for (const state of assistedOrderPaymentStates) {
      expect(typeof paymentNextActionFor(state)).toBe("string");
    }
    expect(paymentNextActionFor("paid")).toBe("none_paid");
    expect(paymentNextActionFor("exception")).toBe("contact_xenios");
  });
});

describe("opening a payment", () => {
  it("copies the amount from the accepted quote and owes it", async () => {
    const h = harness();
    const view = await h.service.open(adminViewer, REQUEST_ID);
    expect(view.state).toBe("payment_required");
    expect(view.amountDueCents).toBe(TOTAL_CENTS);
    expect(view.quoteVersion).toBe(3);
    expect(view.settled).toBe(false);
    expect(view.nextAction).toBe("await_instructions");
  });

  it("is idempotent: a duplicated admin click opens one payment", async () => {
    const h = harness();
    const first = await h.service.open(adminViewer, REQUEST_ID);
    const second = await h.service.open(adminViewer, REQUEST_ID);
    expect(second.paymentId).toBe(first.paymentId);
    expect(await h.repository.byRequest(REQUEST_ID)).not.toBeNull();
  });

  it("refuses a quote that was never accepted", async () => {
    const h = harness({ quoteState: "issued", acceptanceId: null });
    await expect(h.service.open(adminViewer, REQUEST_ID)).rejects.toMatchObject(
      { code: "QUOTE_NOT_ACCEPTED" },
    );
  });

  it("refuses a request with no quote at all", async () => {
    const h = harness();
    await expect(
      h.service.open(adminViewer, "00000000-0000-4000-8000-00000000dead"),
    ).rejects.toBeInstanceOf(AssistedOrderPaymentNotFoundError);
  });

  it("refuses a non-admin", async () => {
    const h = harness();
    await expect(
      h.service.open(memberViewer, REQUEST_ID),
    ).rejects.toBeInstanceOf(AssistedOrderPaymentAuthorizationError);
  });
});

describe("missing price never becomes zero", () => {
  it("refuses to open a payment for a zero total", async () => {
    const h = harness({ quoteTotalCents: 0 });
    await expect(h.service.open(adminViewer, REQUEST_ID)).rejects.toMatchObject(
      { code: "AMOUNT_NOT_PAYABLE" },
    );
  });

  it("refuses to open a payment for a null total", async () => {
    const h = harness({ quoteTotalCents: null });
    await expect(h.service.open(adminViewer, REQUEST_ID)).rejects.toMatchObject(
      { code: "AMOUNT_NOT_PAYABLE" },
    );
  });

  it("refuses a negative total rather than flipping its sign", async () => {
    const h = harness({ quoteTotalCents: -100 });
    await expect(h.service.open(adminViewer, REQUEST_ID)).rejects.toMatchObject(
      { code: "AMOUNT_NOT_PAYABLE" },
    );
  });

  it("refuses a fractional total rather than rounding it", async () => {
    const h = harness({ quoteTotalCents: 1999.5 });
    await expect(h.service.open(adminViewer, REQUEST_ID)).rejects.toMatchObject(
      { code: "AMOUNT_NOT_PAYABLE" },
    );
  });
});

describe("payment instructions", () => {
  it("composes the body server-side and shows it to the customer", async () => {
    const h = harness();
    const opened = await h.service.open(adminViewer, REQUEST_ID);
    const presented = await h.service.presentInstructions(
      adminViewer,
      opened.paymentId,
      "wire",
    );
    expect(presented.state).toBe("instructions_presented");
    expect(presented.nextAction).toBe("follow_instructions");
    expect(presented.instructions?.paymentReference).toBe(REFERENCE);
    expect(presented.instructions?.body).toContain(String(TOTAL_CENTS));
  });

  it("hides expired instructions from the customer view", async () => {
    const h = harness({ instructionsExpiresAt: "2026-08-19T13:00:00.000Z" });
    const opened = await h.service.open(adminViewer, REQUEST_ID);
    await h.service.presentInstructions(adminViewer, opened.paymentId, "wire");
    h.setNow("2026-08-19T14:00:00.000Z");
    const view = await h.service.forRequest(memberViewer, REFERENCE);
    expect(view?.state).toBe("instructions_presented");
    expect(view?.instructions).toBeNull();
  });

  it("refuses an unconfigured payment method instead of inventing one", async () => {
    const h = harness({ composerReturnsNull: true });
    const opened = await h.service.open(adminViewer, REQUEST_ID);
    await expect(
      h.service.presentInstructions(adminViewer, opened.paymentId, "carrier-pigeon"),
    ).rejects.toMatchObject({ code: "EVIDENCE_REQUIRED" });
  });
});

describe("a customer claim is not a payment", () => {
  it("files a claim and stays unsettled", async () => {
    const h = harness();
    const opened = await h.service.open(adminViewer, REQUEST_ID);
    await h.service.presentInstructions(adminViewer, opened.paymentId, "wire");
    const receipt = await h.service.submitProof(memberViewer, REFERENCE, {
      paymentId: opened.paymentId,
      customerReference: "WIRE-99",
      note: "sent Tuesday",
      idempotencyKey: "key-1",
    });
    expect(receipt.state).toBe("proof_submitted");
    expect(receipt.nextAction).toBe("await_review");

    const view = await h.service.forRequest(memberViewer, REFERENCE);
    expect(view?.settled).toBe(false);
    expect(view?.settledAt).toBeNull();
    expect(isSettledPaymentState(view!.state)).toBe(false);
  });

  it("ignores a browser asserting paid: the field does not exist", async () => {
    const h = harness();
    const opened = await h.service.open(adminViewer, REQUEST_ID);
    await h.service.presentInstructions(adminViewer, opened.paymentId, "wire");
    // A hostile client posts everything it wishes were true.
    const hostile = {
      paymentId: opened.paymentId,
      customerReference: "WIRE-99",
      note: "sent",
      idempotencyKey: "key-1",
      paid: true,
      state: "paid",
      settled: true,
      amountDueCents: 1,
      verifiedAmountCents: TOTAL_CENTS,
    };
    const receipt = await h.service.submitProof(
      memberViewer,
      REFERENCE,
      hostile as never,
    );
    expect(receipt.state).toBe("proof_submitted");

    const view = await h.service.forRequest(memberViewer, REFERENCE);
    expect(view?.state).toBe("proof_submitted");
    expect(view?.settled).toBe(false);
    // The browser's amount did not become the amount owed.
    expect(view?.amountDueCents).toBe(TOTAL_CENTS);
  });

  it("de-duplicates a double-tapped submit into one claim", async () => {
    const h = harness();
    const opened = await h.service.open(adminViewer, REQUEST_ID);
    await h.service.presentInstructions(adminViewer, opened.paymentId, "wire");
    const input = {
      paymentId: opened.paymentId,
      customerReference: "WIRE-99",
      note: "sent Tuesday",
      idempotencyKey: "key-1",
    };
    const first = await h.service.submitProof(memberViewer, REFERENCE, input);
    const second = await h.service.submitProof(memberViewer, REFERENCE, input);
    expect(second.replayed).toBe(true);
    expect(second.proofId).toBe(first.proofId);

    const record = await h.service.adminRecord(adminViewer, opened.paymentId);
    expect(record.proofs).toHaveLength(1);
  });

  it("refuses a reused idempotency key carrying different content", async () => {
    const h = harness();
    const opened = await h.service.open(adminViewer, REQUEST_ID);
    await h.service.presentInstructions(adminViewer, opened.paymentId, "wire");
    await h.service.submitProof(memberViewer, REFERENCE, {
      paymentId: opened.paymentId,
      customerReference: "WIRE-99",
      note: "sent Tuesday",
      idempotencyKey: "key-1",
    });
    await expect(
      h.service.submitProof(memberViewer, REFERENCE, {
        paymentId: opened.paymentId,
        customerReference: "WIRE-100",
        note: "actually Wednesday",
        idempotencyKey: "key-1",
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("refuses a claim before instructions exist", async () => {
    const h = harness();
    const opened = await h.service.open(adminViewer, REQUEST_ID);
    await expect(
      h.service.submitProof(memberViewer, REFERENCE, {
        paymentId: opened.paymentId,
        customerReference: "WIRE-99",
        note: "",
        idempotencyKey: "key-1",
      }),
    ).rejects.toMatchObject({ code: "ILLEGAL_TRANSITION" });
  });
});

describe("cross-customer access is blocked", () => {
  it("refuses another customer's payment as not-found, not forbidden", async () => {
    const h = harness();
    const opened = await h.service.open(adminViewer, REQUEST_ID);
    await h.service.presentInstructions(adminViewer, opened.paymentId, "wire");
    // The attacker proves ownership of their OWN request, then names the
    // victim's payment id.
    await h.service.open(adminViewer, OTHER_REQUEST_ID);
    await expect(
      h.service.submitProof(otherMemberViewer, OTHER_REFERENCE, {
        paymentId: opened.paymentId,
        customerReference: "WIRE-1",
        note: "",
        idempotencyKey: "key-x",
      }),
    ).rejects.toBeInstanceOf(AssistedOrderPaymentNotFoundError);
  });

  it("refuses to read a payment through someone else's reference", async () => {
    const h = harness();
    await h.service.open(adminViewer, REQUEST_ID);
    await expect(
      h.service.forRequest(otherMemberViewer, REFERENCE),
    ).rejects.toBeInstanceOf(AssistedOrderPaymentNotFoundError);
  });

  it("refuses an early-access session that does not match the request", async () => {
    const h = harness();
    await h.service.open(adminViewer, REQUEST_ID);
    const stranger: AssistedOrderViewer = Object.freeze({
      actorType: "early_access_session",
      memberId: null,
      earlyAccessSessionHash: "not-the-one",
      normalizedEmail: null,
      capabilities: new Set(["assisted_orders:read_own"]),
    });
    await expect(
      h.service.forRequest(stranger, REFERENCE),
    ).rejects.toBeInstanceOf(AssistedOrderPaymentNotFoundError);
  });
});

describe("only real authority turns money real", () => {
  it("refuses an admin without the verification grant", async () => {
    const h = harness();
    const opened = await h.service.open(adminViewer, REQUEST_ID);
    await h.service.presentInstructions(adminViewer, opened.paymentId, "wire");
    await h.service.beginReview(adminViewer, opened.paymentId);
    await expect(
      h.service.markPaid(adminViewer, {
        paymentId: opened.paymentId,
        verifiedAmountCents: TOTAL_CENTS,
        evidenceRef: "bank-ref-1",
      }),
    ).rejects.toMatchObject({ code: "VERIFICATION_GRANT_REQUIRED" });
  });

  it("refuses a customer outright", async () => {
    const h = harness();
    const opened = await h.service.open(adminViewer, REQUEST_ID);
    await expect(
      h.service.markPaid(memberViewer, {
        paymentId: opened.paymentId,
        verifiedAmountCents: TOTAL_CENTS,
        evidenceRef: "bank-ref-1",
      }),
    ).rejects.toBeInstanceOf(AssistedOrderPaymentAuthorizationError);
  });

  it("records the named verifier when a grant holder settles", async () => {
    const h = harness();
    const { paymentId, paid } = await settled(h);
    expect(paid.state).toBe("paid");
    expect(paid.settled).toBe(true);
    expect(paid.settledAt).toBe("2026-08-19T12:00:00.000Z");

    const record = await h.service.adminRecord(adminViewer, paymentId);
    expect(record.settlement?.verifiedByLabel).toBe(
      "finance@xeniostechnology.com",
    );
    expect(record.settlement?.verifiedByKind).toBe("admin");
    expect(record.settlement?.evidenceRef).toBe("bank-ref-1");
  });

  it("refuses a settlement with no evidence reference", async () => {
    const h = harness();
    const opened = await h.service.open(adminViewer, REQUEST_ID);
    await h.service.presentInstructions(adminViewer, opened.paymentId, "wire");
    await h.service.beginReview(adminViewer, opened.paymentId);
    await expect(
      h.service.markPaid(verifierViewer, {
        paymentId: opened.paymentId,
        verifiedAmountCents: TOTAL_CENTS,
        evidenceRef: "   ",
      }),
    ).rejects.toBeInstanceOf(AssistedOrderPaymentValidationError);
  });

  it("refuses to settle straight from a customer claim without a review", async () => {
    const h = harness();
    const opened = await h.service.open(adminViewer, REQUEST_ID);
    await h.service.presentInstructions(adminViewer, opened.paymentId, "wire");
    await h.service.submitProof(memberViewer, REFERENCE, {
      paymentId: opened.paymentId,
      customerReference: "WIRE-99",
      note: "",
      idempotencyKey: "key-1",
    });
    // proof_submitted -> paid is not an edge in the table.
    await expect(
      h.service.markPaid(verifierViewer, {
        paymentId: opened.paymentId,
        verifiedAmountCents: TOTAL_CENTS,
        evidenceRef: "bank-ref-1",
      }),
    ).rejects.toMatchObject({ code: "ILLEGAL_TRANSITION" });
  });

  it("accepts a real processor fact carrying the provider event id", async () => {
    const h = harness();
    const opened = await h.service.open(adminViewer, REQUEST_ID);
    await h.service.presentInstructions(adminViewer, opened.paymentId, "wire");
    await h.service.beginReview(adminViewer, opened.paymentId);
    const paid = await h.service.recordProcessorSettlement({
      paymentId: opened.paymentId,
      providerId: "stripe",
      providerEventId: "evt_123",
      verifiedAmountCents: TOTAL_CENTS,
      currency: "USD",
    });
    expect(paid.state).toBe("paid");
    const record = await h.service.adminRecord(adminViewer, opened.paymentId);
    expect(record.settlement?.verifiedByKind).toBe("processor");
    expect(record.settlement?.evidenceRef).toBe("evt_123");
  });

  it("refuses a processor fact with a blank provider event id", async () => {
    const h = harness();
    const opened = await h.service.open(adminViewer, REQUEST_ID);
    await h.service.presentInstructions(adminViewer, opened.paymentId, "wire");
    await h.service.beginReview(adminViewer, opened.paymentId);
    await expect(
      h.service.recordProcessorSettlement({
        paymentId: opened.paymentId,
        providerId: "stripe",
        providerEventId: "  ",
        verifiedAmountCents: TOTAL_CENTS,
        currency: "USD",
      }),
    ).rejects.toBeInstanceOf(AssistedOrderPaymentValidationError);
  });
});

describe("duplicate verification is idempotent", () => {
  it("returns the incumbent settlement on a second mark-paid", async () => {
    const h = harness();
    const { paymentId } = await settled(h);
    const record = await h.service.adminRecord(adminViewer, paymentId);
    const firstSettlementId = record.settlement?.settlementId;

    const replay = await h.service.markPaid(verifierViewer, {
      paymentId,
      verifiedAmountCents: TOTAL_CENTS,
      evidenceRef: "bank-ref-1",
    });
    expect(replay.state).toBe("paid");

    const after = await h.service.adminRecord(adminViewer, paymentId);
    expect(after.settlement?.settlementId).toBe(firstSettlementId);
    // One arrival at paid in the history, not two.
    expect(after.history.filter((event) => event.to === "paid")).toHaveLength(1);
  });

  it("derives the settlement key from the payment id, so replays collide", async () => {
    const h = harness();
    const { paymentId } = await settled(h);
    const record = await h.service.adminRecord(adminViewer, paymentId);
    expect(record.settlement?.settlementUniqueKey).toBe(
      settlementUniqueKeyFor(paymentId),
    );
  });

  it("refuses a second processor event claiming the same payment", async () => {
    const h = harness();
    const opened = await h.service.open(adminViewer, REQUEST_ID);
    await h.service.presentInstructions(adminViewer, opened.paymentId, "wire");
    await h.service.beginReview(adminViewer, opened.paymentId);
    await h.service.recordProcessorSettlement({
      paymentId: opened.paymentId,
      providerId: "stripe",
      providerEventId: "evt_123",
      verifiedAmountCents: TOTAL_CENTS,
      currency: "USD",
    });
    await expect(
      h.service.recordProcessorSettlement({
        paymentId: opened.paymentId,
        providerId: "stripe",
        providerEventId: "evt_456",
        verifiedAmountCents: TOTAL_CENTS,
        currency: "USD",
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("replays an identical processor event without settling twice", async () => {
    const h = harness();
    const opened = await h.service.open(adminViewer, REQUEST_ID);
    await h.service.presentInstructions(adminViewer, opened.paymentId, "wire");
    await h.service.beginReview(adminViewer, opened.paymentId);
    const fact = {
      paymentId: opened.paymentId,
      providerId: "stripe",
      providerEventId: "evt_123",
      verifiedAmountCents: TOTAL_CENTS,
      currency: "USD" as const,
    };
    await h.service.recordProcessorSettlement(fact);
    await h.service.recordProcessorSettlement(fact);
    const record = await h.service.adminRecord(adminViewer, opened.paymentId);
    expect(record.history.filter((event) => event.to === "paid")).toHaveLength(1);
  });
});

describe("an amount that disagrees becomes an exception, never a partial payment", () => {
  it("parks an underpayment and does not settle", async () => {
    const h = harness();
    const opened = await h.service.open(adminViewer, REQUEST_ID);
    await h.service.presentInstructions(adminViewer, opened.paymentId, "wire");
    await h.service.beginReview(adminViewer, opened.paymentId);
    await expect(
      h.service.markPaid(verifierViewer, {
        paymentId: opened.paymentId,
        verifiedAmountCents: TOTAL_CENTS - 100,
        evidenceRef: "bank-ref-short",
      }),
    ).rejects.toMatchObject({ code: "AMOUNT_MISMATCH" });

    const record = await h.service.adminRecord(adminViewer, opened.paymentId);
    expect(record.state).toBe("exception");
    expect(record.settlement).toBeNull();
    expect(record.exceptionReason).toContain(String(TOTAL_CENTS));
    expect(isSettledPaymentState(record.state)).toBe(false);
  });

  it("parks an overpayment too", async () => {
    const h = harness();
    const opened = await h.service.open(adminViewer, REQUEST_ID);
    await h.service.presentInstructions(adminViewer, opened.paymentId, "wire");
    await h.service.beginReview(adminViewer, opened.paymentId);
    await expect(
      h.service.markPaid(verifierViewer, {
        paymentId: opened.paymentId,
        verifiedAmountCents: TOTAL_CENTS + 1,
        evidenceRef: "bank-ref-over",
      }),
    ).rejects.toMatchObject({ code: "AMOUNT_MISMATCH" });
    const record = await h.service.adminRecord(adminViewer, opened.paymentId);
    expect(record.state).toBe("exception");
  });

  it("lets a grant holder settle the exception once the amount agrees", async () => {
    const h = harness();
    const opened = await h.service.open(adminViewer, REQUEST_ID);
    await h.service.presentInstructions(adminViewer, opened.paymentId, "wire");
    await h.service.beginReview(adminViewer, opened.paymentId);
    await expect(
      h.service.markPaid(verifierViewer, {
        paymentId: opened.paymentId,
        verifiedAmountCents: TOTAL_CENTS - 100,
        evidenceRef: "bank-ref-short",
      }),
    ).rejects.toMatchObject({ code: "AMOUNT_MISMATCH" });

    const resolved = await h.service.markPaid(verifierViewer, {
      paymentId: opened.paymentId,
      verifiedAmountCents: TOTAL_CENTS,
      evidenceRef: "bank-ref-topup",
    });
    expect(resolved.state).toBe("paid");
    expect(resolved.settled).toBe(true);
  });
});

describe("rejection and retry", () => {
  it("returns a rejected payment to a payable state, never to paid", async () => {
    const h = harness();
    const opened = await h.service.open(adminViewer, REQUEST_ID);
    await h.service.presentInstructions(adminViewer, opened.paymentId, "wire");
    await h.service.submitProof(memberViewer, REFERENCE, {
      paymentId: opened.paymentId,
      customerReference: "WIRE-99",
      note: "",
      idempotencyKey: "key-1",
    });
    await h.service.beginReview(adminViewer, opened.paymentId);
    const rejected = await h.service.reject(
      adminViewer,
      opened.paymentId,
      "no matching credit on the statement",
    );
    expect(rejected.state).toBe("rejected");
    expect(rejected.nextAction).toBe("retry_payment");

    const record = await h.service.adminRecord(adminViewer, opened.paymentId);
    expect(record.proofs[0].reviewOutcome).toBe("rejected");

    // The only way forward is new instructions.
    await expect(
      h.service.markPaid(verifierViewer, {
        paymentId: opened.paymentId,
        verifiedAmountCents: TOTAL_CENTS,
        evidenceRef: "bank-ref-1",
      }),
    ).rejects.toMatchObject({ code: "ILLEGAL_TRANSITION" });

    const represented = await h.service.presentInstructions(
      adminViewer,
      opened.paymentId,
      "wire",
    );
    expect(represented.state).toBe("instructions_presented");
  });

  it("keeps the internal rejection reason out of the customer view", async () => {
    const h = harness();
    const opened = await h.service.open(adminViewer, REQUEST_ID);
    await h.service.presentInstructions(adminViewer, opened.paymentId, "wire");
    await h.service.beginReview(adminViewer, opened.paymentId);
    await h.service.reject(adminViewer, opened.paymentId, "suspected fraud ring");
    const view = await h.service.forRequest(memberViewer, REFERENCE);
    expect(JSON.stringify(view)).not.toContain("fraud");
  });
});

describe("refunds", () => {
  it("refunds a settled payment and stops calling it settled", async () => {
    const h = harness();
    const { paymentId } = await settled(h);
    const refunded = await h.service.refund(verifierViewer, paymentId, {
      refundedAmountCents: TOTAL_CENTS,
      reason: "customer cancelled before dispatch",
      evidenceRef: "refund-ref-1",
    });
    expect(refunded.state).toBe("refunded");
    expect(refunded.settled).toBe(false);
    expect(refunded.nextAction).toBe("none_refunded");
  });

  it("refuses to refund a payment that never settled", async () => {
    const h = harness();
    const opened = await h.service.open(adminViewer, REQUEST_ID);
    await expect(
      h.service.refund(verifierViewer, opened.paymentId, {
        refundedAmountCents: TOTAL_CENTS,
        reason: "nope",
        evidenceRef: "refund-ref-1",
      }),
    ).rejects.toMatchObject({ code: "NOT_SETTLED" });
  });

  it("refuses to refund more than arrived", async () => {
    const h = harness();
    const { paymentId } = await settled(h);
    await expect(
      h.service.refund(verifierViewer, paymentId, {
        refundedAmountCents: TOTAL_CENTS + 1,
        reason: "typo",
        evidenceRef: "refund-ref-1",
      }),
    ).rejects.toBeInstanceOf(AssistedOrderPaymentValidationError);
  });

  it("refuses an admin without the verification grant", async () => {
    const h = harness();
    const { paymentId } = await settled(h);
    await expect(
      h.service.refund(adminViewer, paymentId, {
        refundedAmountCents: TOTAL_CENTS,
        reason: "customer cancelled",
        evidenceRef: "refund-ref-1",
      }),
    ).rejects.toMatchObject({ code: "VERIFICATION_GRANT_REQUIRED" });
  });

  it("refuses a second mark-paid after a refund instead of reporting success", async () => {
    const h = harness();
    const { paymentId } = await settled(h);
    await h.service.refund(verifierViewer, paymentId, {
      refundedAmountCents: TOTAL_CENTS,
      reason: "customer cancelled",
      evidenceRef: "refund-ref-1",
    });
    // Without this refusal an operator would read a success and believe the
    // money was back on the books.
    await expect(
      h.service.markPaid(verifierViewer, {
        paymentId,
        verifiedAmountCents: TOTAL_CENTS,
        evidenceRef: "bank-ref-1",
      }),
    ).rejects.toMatchObject({ code: "ILLEGAL_TRANSITION" });
  });

  it("refuses a late provider event after a refund", async () => {
    const h = harness();
    const opened = await h.service.open(adminViewer, REQUEST_ID);
    await h.service.presentInstructions(adminViewer, opened.paymentId, "wire");
    await h.service.beginReview(adminViewer, opened.paymentId);
    await h.service.recordProcessorSettlement({
      paymentId: opened.paymentId,
      providerId: "stripe",
      providerEventId: "evt_123",
      verifiedAmountCents: TOTAL_CENTS,
      currency: "USD",
    });
    await h.service.refund(verifierViewer, opened.paymentId, {
      refundedAmountCents: TOTAL_CENTS,
      reason: "customer cancelled",
      evidenceRef: "refund-ref-1",
    });
    await expect(
      h.service.recordProcessorSettlement({
        paymentId: opened.paymentId,
        providerId: "stripe",
        providerEventId: "evt_123",
        verifiedAmountCents: TOTAL_CENTS,
        currency: "USD",
      }),
    ).rejects.toMatchObject({ code: "ILLEGAL_TRANSITION" });
  });

  it("is idempotent", async () => {
    const h = harness();
    const { paymentId } = await settled(h);
    const input = {
      refundedAmountCents: TOTAL_CENTS,
      reason: "customer cancelled",
      evidenceRef: "refund-ref-1",
    };
    await h.service.refund(verifierViewer, paymentId, input);
    const replay = await h.service.refund(verifierViewer, paymentId, input);
    expect(replay.state).toBe("refunded");
    const record = await h.service.adminRecord(adminViewer, paymentId);
    expect(record.history.filter((e) => e.to === "refunded")).toHaveLength(1);
  });
});

describe("the audit trail names who did what", () => {
  it("records the settlement with the verifier and the evidence", async () => {
    const h = harness();
    await settled(h);
    const settlementEvents = h.audit.mock.calls
      .map(([event]) => event as Record<string, unknown>)
      .filter((event) => event.type === "assisted_order_payment_settled");
    expect(settlementEvents).toHaveLength(1);
    expect(settlementEvents[0]).toMatchObject({
      verifiedByLabel: "finance@xeniostechnology.com",
      verifiedByKind: "admin",
      evidenceRef: "bank-ref-1",
      amountDueCents: TOTAL_CENTS,
    });
  });

  it("keeps every transition, with actor and timestamp", async () => {
    const h = harness();
    const { paymentId } = await settled(h);
    const record = await h.service.adminRecord(adminViewer, paymentId);
    expect(record.history.map((e) => e.to)).toEqual([
      "payment_required",
      "instructions_presented",
      "proof_submitted",
      "under_review",
      "paid",
    ]);
    expect(record.history.map((e) => e.actorKind)).toEqual([
      "admin",
      "admin",
      "customer",
      "admin",
      "admin",
    ]);
    for (const event of record.history) {
      expect(event.actorLabel).not.toBe("");
      expect(event.at).toBe("2026-08-19T12:00:00.000Z");
    }
  });
});
