// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EarlyAccessAdminPaymentReviewDto } from "../../adapters/earlyAccessAdminPayment";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

// ---------------------------------------------------------------------------
// The screen that finally gives `EarlyAccessPaymentApproval` a non-test caller.
//
// The approval form's own rules are tested beside it. What is tested HERE is
// the screen around it: that it reads the server's review before rendering any
// approval action at all, that a blocked review renders a disabled one, and
// that it re-reads after approving rather than trusting what the browser hoped
// happened.
// ---------------------------------------------------------------------------

const REVIEW: EarlyAccessAdminPaymentReviewDto = {
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

const adapters = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock("../../adapters/earlyAccessAdminPayment", () => ({
  getEarlyAccessAdminPaymentReview: adapters.get,
  approveEarlyAccessAdminPayment: adapters.post,
}));

async function render() {
  const { EarlyAccessPaymentReviewBody } = await import("./EarlyAccessPaymentReview");
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(<EarlyAccessPaymentReviewBody token="admin-token" />));
  return { host, unmount: () => act(() => root.unmount()) };
}

function type(input: HTMLInputElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function loadFor(host: HTMLElement, checkoutNumber: string) {
  type(host.querySelector("#ea-review-checkout-number") as HTMLInputElement, checkoutNumber);
  await act(async () => {
    (host.querySelector("form") as HTMLFormElement).dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
}

describe("the Early Access payment review screen", () => {
  beforeEach(() => {
    adapters.get.mockReset();
    adapters.post.mockReset();
  });

  it("renders NO approval action until a real review has been read", async () => {
    const view = await render();
    expect(view.host.textContent).toContain("Early Access checkout number");
    expect(view.host.textContent).not.toContain("APPROVE PAYMENT");
    expect(adapters.get).not.toHaveBeenCalled();
    view.unmount();
  });

  it("refuses a malformed checkout number without calling the server", async () => {
    const view = await render();
    await loadFor(view.host, "not-a-checkout");
    expect(adapters.get).not.toHaveBeenCalled();
    expect(view.host.textContent).toContain("not an Early Access checkout number");
    view.unmount();
  });

  it("reads the review and then renders the approval action", async () => {
    adapters.get.mockResolvedValue({ kind: "ok", data: { review: REVIEW } });
    const view = await render();
    await loadFor(view.host, REVIEW.cartCheckoutNumber);
    expect(adapters.get).toHaveBeenCalledWith("admin-token", REVIEW.cartCheckoutNumber);
    expect(view.host.textContent).toContain("APPROVE PAYMENT & RELEASE ORDER");
    expect(view.host.textContent).toContain(REVIEW.invoiceNumber);
    view.unmount();
  });

  it("a BLOCKED review renders the blockers and a disabled approval", async () => {
    adapters.get.mockResolvedValue({
      kind: "ok",
      data: {
        review: {
          ...REVIEW,
          submission: null,
          canApprove: false,
          blockers: ["submission_missing", "agreements_not_current"],
        },
      },
    });
    const view = await render();
    await loadFor(view.host, REVIEW.cartCheckoutNumber);
    expect(view.host.textContent).toContain("This order cannot be approved yet");
    expect(view.host.textContent).toContain("submission missing");
    const approve = Array.from(view.host.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("APPROVE PAYMENT"),
    ) as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
    view.unmount();
  });

  it("says nothing about whether an unreadable order exists", async () => {
    // The server answers 404 both for an unknown checkout and for one this
    // admin may not see. The screen must not imply the difference.
    adapters.get.mockResolvedValue({ kind: "denied", code: "NOT_FOUND" });
    const view = await render();
    await loadFor(view.host, REVIEW.cartCheckoutNumber);
    expect(view.host.textContent).toContain("No Early Access order is readable");
    expect(view.host.textContent).not.toContain("APPROVE PAYMENT");
    view.unmount();
  });

  it("RE-READS the server after approving, rather than trusting the browser", async () => {
    adapters.get.mockResolvedValue({ kind: "ok", data: { review: REVIEW } });
    adapters.post.mockResolvedValue({ kind: "ok", data: { replayed: false } });
    const view = await render();
    await loadFor(view.host, REVIEW.cartCheckoutNumber);
    expect(adapters.get).toHaveBeenCalledTimes(1);

    const checks = Array.from(
      view.host.querySelectorAll('input[type="checkbox"]'),
    ) as HTMLInputElement[];
    act(() => checks[0]?.click());
    act(() => checks[1]?.click());
    type(view.host.querySelector("#ea-provider-transaction-id") as HTMLInputElement, "provider-42");
    const approve = Array.from(view.host.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("APPROVE PAYMENT"),
    ) as HTMLButtonElement;
    await act(async () => approve.click());

    expect(adapters.post).toHaveBeenCalledWith("admin-token", REVIEW.cartCheckoutNumber, {
      confirmedFundsReceived: true,
      confirmedAmountAndReference: true,
      externalTransactionId: "provider-42",
    });
    expect(adapters.get).toHaveBeenCalledTimes(2);
    view.unmount();
  });

  it("shows the server's refusal CODE, not a guess about why", async () => {
    adapters.get.mockResolvedValue({ kind: "ok", data: { review: REVIEW } });
    adapters.post.mockResolvedValue({ kind: "denied", code: "submission_unreconciled" });
    const view = await render();
    await loadFor(view.host, REVIEW.cartCheckoutNumber);
    const checks = Array.from(
      view.host.querySelectorAll('input[type="checkbox"]'),
    ) as HTMLInputElement[];
    act(() => checks[0]?.click());
    act(() => checks[1]?.click());
    type(view.host.querySelector("#ea-provider-transaction-id") as HTMLInputElement, "provider-42");
    const approve = Array.from(view.host.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("APPROVE PAYMENT"),
    ) as HTMLButtonElement;
    await act(async () => approve.click());
    expect(view.host.textContent).toContain("submission unreconciled");
    view.unmount();
  });
});
