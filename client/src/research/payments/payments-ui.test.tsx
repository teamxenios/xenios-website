// @vitest-environment jsdom
//
// What these tests are for: the panels are the surfaces where an overstated
// word or an over-eager button becomes a real mistake. So the assertions are
// mostly about what is NOT shown — a claim never reading as a payment, an
// operator never being offered an action the server would refuse, and internal
// text never reaching a customer.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assistedOrderPaymentStates,
  paymentNextActionFor,
  type AssistedOrderPaymentAdminView,
  type AssistedOrderPaymentState,
  type AssistedOrderPaymentView,
} from "@shared/research/assisted-order/payment-contract";
import { AssistedPaymentStatus } from "./AssistedPaymentStatus";
import { AssistedRequestConversionPanel } from "./AssistedRequestConversionPanel";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(node: React.ReactNode) {
  act(() => root.render(node));
}

function text(testId: string): string {
  return (
    container.querySelector(`[data-testid="${testId}"]`)?.textContent ?? ""
  );
}

function button(testId: string): HTMLButtonElement | null {
  return container.querySelector(`[data-testid="${testId}"]`);
}

const AMOUNT_CENTS = 24_800;

function customerView(
  state: AssistedOrderPaymentState,
  overrides: Partial<AssistedOrderPaymentView> = {},
): AssistedOrderPaymentView {
  return Object.freeze({
    paymentId: "pay-1",
    requestPublicReference: "XRR-20260819-ABCDEF0123",
    state,
    nextAction: paymentNextActionFor(state),
    amountDueCents: AMOUNT_CENTS,
    currency: "USD" as const,
    quoteId: "quote-1",
    quoteVersion: 3,
    instructions: null,
    settled: state === "paid",
    openedAt: "2026-08-19T11:30:00.000Z",
    updatedAt: "2026-08-19T12:00:00.000Z",
    settledAt: state === "paid" ? "2026-08-19T12:00:00.000Z" : null,
    ...overrides,
  });
}

function adminView(
  state: AssistedOrderPaymentState,
  overrides: Partial<AssistedOrderPaymentAdminView> = {},
): AssistedOrderPaymentAdminView {
  return Object.freeze({
    paymentId: "pay-1",
    requestId: "req-1",
    requestPublicReference: "XRR-20260819-ABCDEF0123",
    state,
    amountDueCents: AMOUNT_CENTS,
    currency: "USD" as const,
    quoteId: "quote-1",
    quoteVersion: 3,
    acceptanceId: "acceptance-1",
    instructions: null,
    proofs: [],
    settlement: null,
    exceptionReason: null,
    history: [],
    openedAt: "2026-08-19T11:30:00.000Z",
    updatedAt: "2026-08-19T12:00:00.000Z",
    settledAt: null,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------

describe("the customer payment panel", () => {
  it("shows the amount from the server, formatted", () => {
    render(<AssistedPaymentStatus payment={customerView("instructions_presented")} />);
    expect(text("assisted-payment-amount")).toBe("$248.00");
  });

  it("shows an honest empty state when no payment exists", () => {
    render(<AssistedPaymentStatus payment={null} />);
    expect(container.textContent).toContain("No payment yet");
    expect(container.textContent).not.toContain("$0.00");
  });

  it("never renders $0.00 for any state", () => {
    for (const state of assistedOrderPaymentStates) {
      render(<AssistedPaymentStatus payment={customerView(state)} />);
      expect(container.textContent).not.toContain("$0.00");
    }
  });

  it("never calls an unverified claim a payment", () => {
    render(<AssistedPaymentStatus payment={customerView("proof_submitted")} />);
    const body = container.textContent ?? "";
    expect(body).toContain("Payment details received");
    expect(body).not.toContain("Payment confirmed");
    expect(body).not.toMatch(/\bPaid\b/);
  });

  it("renders the server's next action rather than re-deriving one", () => {
    // A view whose state and nextAction disagree renders the nextAction — the
    // server's word wins, and the mismatch is visible instead of hidden.
    render(
      <AssistedPaymentStatus
        payment={customerView("under_review", { nextAction: "contact_xenios" })}
      />,
    );
    expect(text("assisted-payment-next-action")).toContain(
      "needs a person",
    );
  });

  it("offers the claim button only when the customer can actually pay", () => {
    const onSubmitProof = vi.fn();
    for (const state of assistedOrderPaymentStates) {
      render(
        <AssistedPaymentStatus
          payment={customerView(state)}
          onSubmitProof={onSubmitProof}
        />,
      );
      const offered = Boolean(
        Array.from(container.querySelectorAll("button")).find((element) =>
          element.textContent?.includes("I have sent this payment"),
        ),
      );
      expect(offered).toBe(
        state === "instructions_presented" || state === "rejected",
      );
    }
  });

  it("hides instructions the server did not send", () => {
    render(<AssistedPaymentStatus payment={customerView("instructions_presented")} />);
    expect(container.querySelector('[data-testid="assisted-payment-instructions"]'))
      .toBeNull();
  });

  it("renders instructions the server did send", () => {
    render(
      <AssistedPaymentStatus
        payment={customerView("instructions_presented", {
          instructions: {
            methodCode: "wire",
            methodLabel: "Bank transfer",
            paymentReference: "XRR-20260819-ABCDEF0123",
            body: "Send the amount to the account on your invoice.",
            presentedAt: "2026-08-19T12:00:00.000Z",
            expiresAt: "2026-08-26T12:00:00.000Z",
          },
        })}
      />,
    );
    expect(text("assisted-payment-instructions")).toContain("Bank transfer");
  });
});

describe("the admin conversion panel", () => {
  it("never offers mark-paid without the verification grant", () => {
    render(
      <AssistedRequestConversionPanel
        payment={adminView("under_review")}
        canManage
        canVerifyPayment={false}
        convertedOrderNumber={null}
      />,
    );
    expect(button("action-mark-paid")?.disabled).toBe(true);
    expect(button("action-mark-paid")?.title).toContain("verification grant");
  });

  it("offers mark-paid to a grant holder in review", () => {
    const onMarkPaid = vi.fn();
    render(
      <AssistedRequestConversionPanel
        payment={adminView("under_review")}
        canManage
        canVerifyPayment
        convertedOrderNumber={null}
        onMarkPaid={onMarkPaid}
      />,
    );
    expect(button("action-mark-paid")?.disabled).toBe(false);
    act(() => {
      button("action-mark-paid")?.click();
    });
    expect(onMarkPaid).toHaveBeenCalledOnce();
  });

  it("never offers mark-paid from a state the server refuses", () => {
    // proof_submitted -> paid is not an edge; the button must not be live even
    // for a grant holder.
    for (const state of ["payment_required", "instructions_presented", "proof_submitted", "rejected", "refunded"] as const) {
      render(
        <AssistedRequestConversionPanel
          payment={adminView(state)}
          canManage
          canVerifyPayment
          convertedOrderNumber={null}
        />,
      );
      expect(button("action-mark-paid")?.disabled).toBe(true);
    }
  });

  it("disables every action for a viewer without manage", () => {
    render(
      <AssistedRequestConversionPanel
        payment={adminView("under_review")}
        canManage={false}
        canVerifyPayment
        convertedOrderNumber={null}
      />,
    );
    for (const id of [
      "action-present-instructions",
      "action-begin-review",
      "action-mark-paid",
      "action-reject",
      "action-raise-exception",
      "action-refund",
      "action-convert",
    ]) {
      expect(button(id)?.disabled).toBe(true);
    }
  });

  it("refuses to offer conversion until the money is real", () => {
    for (const state of assistedOrderPaymentStates) {
      render(
        <AssistedRequestConversionPanel
          payment={adminView(state)}
          canManage
          canVerifyPayment
          convertedOrderNumber={null}
        />,
      );
      expect(button("action-convert")?.disabled).toBe(state !== "paid");
    }
  });

  it("explains why an unpaid request cannot be converted", () => {
    render(
      <AssistedRequestConversionPanel
        payment={adminView("proof_submitted")}
        canManage
        canVerifyPayment
        convertedOrderNumber={null}
      />,
    );
    expect(text("conversion-not-converted")).toContain(
      "cannot become a fulfillable order",
    );
  });

  it("stops offering conversion once an order exists", () => {
    render(
      <AssistedRequestConversionPanel
        payment={adminView("paid")}
        canManage
        canVerifyPayment
        convertedOrderNumber="XO-ABCDEFGH12345678"
      />,
    );
    expect(button("action-convert")?.disabled).toBe(true);
    expect(text("conversion-order-number")).toBe("XO-ABCDEFGH12345678");
  });

  it("marks a filed claim as unverified, and shows no verified amount", () => {
    render(
      <AssistedRequestConversionPanel
        payment={adminView("proof_submitted", {
          proofs: [
            {
              proofId: "proof-1",
              customerReference: "WIRE-99",
              note: "sent Tuesday",
              submittedAt: "2026-08-19T12:00:00.000Z",
              submittedByLabel: "member@example.com",
              reviewOutcome: "pending",
            },
          ],
        })}
        canManage
        canVerifyPayment
        convertedOrderNumber={null}
      />,
    );
    expect(text("conversion-proofs")).toContain("Unverified claim");
    expect(text("conversion-verified-amount")).toBe("Not verified");
    expect(text("conversion-verified-by")).toBe("—");
  });

  it("names the verifier once money is real", () => {
    render(
      <AssistedRequestConversionPanel
        payment={adminView("paid", {
          settlement: {
            settlementId: "settle-1",
            verifiedAmountCents: AMOUNT_CENTS,
            currency: "USD",
            verifiedAt: "2026-08-19T12:00:00.000Z",
            verifiedByLabel: "finance@xeniostechnology.com",
            verifiedByKind: "admin",
            evidenceRef: "bank-ref-1",
          },
        })}
        canManage
        canVerifyPayment
        convertedOrderNumber={null}
      />,
    );
    expect(text("conversion-verified-amount")).toBe("$248.00");
    expect(text("conversion-verified-by")).toContain(
      "finance@xeniostechnology.com",
    );
  });

  it("shows the exception reason to an operator", () => {
    render(
      <AssistedRequestConversionPanel
        payment={adminView("exception", {
          exceptionReason: "Verified 24700 cents against 24800 cents due.",
        })}
        canManage
        canVerifyPayment
        convertedOrderNumber={null}
      />,
    );
    expect(text("conversion-exception-reason")).toContain("24700");
  });
});
