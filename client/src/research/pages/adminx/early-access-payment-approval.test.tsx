// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import type { EarlyAccessAdminPaymentReviewDto } from "../../adapters/earlyAccessAdminPayment";
import { EarlyAccessPaymentApproval } from "./EarlyAccessPaymentApproval";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const review: EarlyAccessAdminPaymentReviewDto = {
  cartCheckoutNumber: "XEC-1234567890ABCDEF",
  invoiceNumber: "XEI-1234567890ABCDEF",
  paymentReference: "XEACART-1234567890ABCDEF",
  amountDueCents: 1200,
  currency: "USD",
  customer: { email: "founder@example.com", phone: null },
  lines: [
    { orderNumber: "XEA-CART-1234567890ABCDEF-01", sku: "EA-1", quantity: 1, payableCents: 1200 },
  ],
  paymentState: "under_review",
  active: true,
  alreadySettled: false,
  agreementCurrent: true,
  agreementPackageVersion: "package-v1",
  submission: {
    submissionId: "submission-1",
    methodName: "Bank transfer",
    filename: "receipt.pdf",
    byteSize: 1200,
    internalEmailAcceptance: "accepted",
    reconciliationRequired: false,
    createdAt: "2026-08-09T00:00:00.000Z",
  },
  canApprove: true,
  blockers: [],
};

function render(
  approve = vi.fn(async () => ({ ok: true as const, replayed: false })),
  value: EarlyAccessAdminPaymentReviewDto = review,
) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(<EarlyAccessPaymentApproval review={value} approve={approve} />));
  return { host, approve, unmount: () => act(() => root.unmount()) };
}

function change(input: HTMLInputElement, value: string | boolean) {
  act(() => {
    if (typeof value === "boolean") input.click();
    else {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
}

describe("founder Early Access payment approval", () => {
  it("requires both confirmations and the real provider transaction id", async () => {
    const view = render();
    const button = view.host.querySelector("button") as HTMLButtonElement;
    const checks = Array.from(view.host.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
    const transaction = view.host.querySelector('#ea-provider-transaction-id') as HTMLInputElement;
    expect(button.textContent).toContain("APPROVE PAYMENT & RELEASE ORDER");
    expect(button.disabled).toBe(true);
    change(checks[0], true);
    change(checks[1], true);
    change(transaction, " provider-transaction-42 ");
    expect(button.disabled).toBe(false);
    await act(async () => button.click());
    expect(view.approve).toHaveBeenCalledWith({
      confirmedFundsReceived: true,
      confirmedAmountAndReference: true,
      externalTransactionId: "provider-transaction-42",
    });
    view.unmount();
  });

  it("locks synchronously so a double click invokes one authoritative action", async () => {
    let release: (() => void) | undefined;
    const approve = vi.fn(() => new Promise<{ ok: true; replayed: false }>((resolve) => {
      release = () => resolve({ ok: true, replayed: false });
    }));
    const view = render(approve);
    const button = view.host.querySelector("button") as HTMLButtonElement;
    const checks = Array.from(view.host.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
    const transaction = view.host.querySelector('#ea-provider-transaction-id') as HTMLInputElement;
    change(checks[0], true);
    change(checks[1], true);
    change(transaction, "provider-transaction-42");
    act(() => {
      button.click();
      button.click();
    });
    expect(approve).toHaveBeenCalledTimes(1);
    await act(async () => {
      release?.();
      await Promise.resolve();
    });
    view.unmount();
  });

  it("shows server blockers and never enables release", () => {
    const blocked: EarlyAccessAdminPaymentReviewDto = {
      ...review,
      canApprove: false,
      blockers: ["agreements_not_current"],
    };
    const view = render(vi.fn(), blocked);
    expect(view.host.textContent).toContain("agreements not current");
    expect((view.host.querySelector("button") as HTMLButtonElement).disabled).toBe(true);
    view.unmount();
  });
});
