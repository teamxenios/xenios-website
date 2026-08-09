// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EarlyAccessPaymentInstructionsPresentation } from "@shared/research/early-access-payment-instructions";
import {
  EarlyAccessCartSubmit,
  paymentOptionsFromInstructions,
} from "./EarlyAccessCartSubmit";
import type {
  EarlyAccessProofSubmitInput,
  EarlyAccessProofSubmitOutcome,
} from "./proofSubmissionPort";

/**
 * UPLOAD PAYMENT PROOF / SUBMIT ORDER.
 *
 * The three things this screen must never do, each with a test that would
 * catch it: offer a payment method the server did not confirm for this order,
 * pre-select one, or claim a submission the server has not acknowledged.
 */

const RESOLVED = Object.freeze({
  state: "resolved",
  amountDueDisplay: "$1,250.00",
  currency: "USD",
  paymentReference: "XEA-PAY-8F3K2Q",
  referenceLabel: "Payment reference",
  methods: [
    {
      code: "zelle",
      methodName: "Zelle",
      destinationLabel: "Zelle email",
      destinationValue: "pay@example.test",
      paymentUrl: null,
      steps: [],
      copyValue: null,
      referenceRequired: true,
    },
    {
      code: "ach_wire",
      methodName: "Bank transfer",
      destinationLabel: null,
      destinationValue: null,
      paymentUrl: null,
      steps: [],
      copyValue: null,
      referenceRequired: true,
    },
  ],
}) as EarlyAccessPaymentInstructionsPresentation;

let host: HTMLElement;
let root: Root;

function q(selector: string): HTMLElement | null {
  return host.querySelector(selector);
}

function render(node: React.ReactElement): void {
  act(() => {
    root.render(node);
  });
}

async function click(element: Element): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("payment methods come from the order's own server instructions", () => {
  it("offers exactly the methods the server confirmed, and NOTHING is pre-selected", () => {
    render(
      <EarlyAccessCartSubmit
        cartCheckoutNumber="XEC-ABCDEFGH12345678"
        paymentInstructions={RESOLVED}
        submitProof={async () => ({ kind: "recorded" })}
        onRecorded={() => {}}
        onBack={() => {}}
        onStatus={() => {}}
      />,
    );
    const radios = Array.from(host.querySelectorAll('input[type="radio"]')) as HTMLInputElement[];
    expect(radios.map((radio) => radio.value)).toEqual(["zelle", "ach_wire"]);
    // NO DEFAULT. A method the customer did not choose is a method they did not
    // pay with, and recording one is a false statement about their money.
    expect(radios.some((radio) => radio.checked)).toBe(false);
    expect(q('[data-testid="early-access-submit-needs-method"]')).not.toBeNull();
  });

  it("renders no methods at all while the server projection is unresolved", () => {
    render(
      <EarlyAccessCartSubmit
        cartCheckoutNumber="XEC-ABCDEFGH12345678"
        paymentInstructions={{ state: "unresolved" }}
        submitProof={async () => ({ kind: "recorded" })}
        onRecorded={() => {}}
        onBack={() => {}}
        onStatus={() => {}}
      />,
    );
    expect(host.querySelectorAll('input[type="radio"]').length).toBe(0);
    // Not a hardcoded fallback list, and not a guess.
    expect(host.textContent).not.toContain("Zelle");
  });

  it("the option list is derived, never authored here", () => {
    expect(paymentOptionsFromInstructions({ state: "unresolved" })).toEqual({ state: "unresolved" });
    expect(paymentOptionsFromInstructions(RESOLVED)).toEqual({
      state: "resolved",
      codes: ["zelle", "ach_wire"],
    });
  });
});

describe("sending proof is not paying, and cannot be claimed early", () => {
  it("the send control stays disabled until BOTH a method and a file are chosen", () => {
    render(
      <EarlyAccessCartSubmit
        cartCheckoutNumber="XEC-ABCDEFGH12345678"
        paymentInstructions={RESOLVED}
        submitProof={async () => ({ kind: "recorded" })}
        onRecorded={() => {}}
        onBack={() => {}}
        onStatus={() => {}}
      />,
    );
    const send = q('[data-testid="early-access-submit-send"]') as HTMLButtonElement;
    expect(send.disabled).toBe(true);

    const radio = host.querySelector('input[value="zelle"]') as HTMLInputElement;
    act(() => {
      radio.click();
    });
    // A method alone is still not enough.
    expect((q('[data-testid="early-access-submit-send"]') as HTMLButtonElement).disabled).toBe(true);
  });

  it("says up front that proof does not pay the order", () => {
    render(
      <EarlyAccessCartSubmit
        cartCheckoutNumber="XEC-ABCDEFGH12345678"
        paymentInstructions={RESOLVED}
        submitProof={async () => ({ kind: "recorded" })}
        onRecorded={() => {}}
        onBack={() => {}}
        onStatus={() => {}}
      />,
    );
    const text = q('[data-testid="early-access-submit-not-payment"]')?.textContent ?? "";
    expect(text).toContain("does not pay this order");
    expect(text).toContain("does not confirm your payment");
  });

  it("is honest that a refresh loses the file but keeps the checkout", () => {
    render(
      <EarlyAccessCartSubmit
        cartCheckoutNumber="XEC-ABCDEFGH12345678"
        paymentInstructions={RESOLVED}
        submitProof={async () => ({ kind: "recorded" })}
        onRecorded={() => {}}
        onBack={() => {}}
        onStatus={() => {}}
      />,
    );
    const note = q('[data-testid="early-access-submit-refresh-note"]')?.textContent ?? "";
    expect(note).toContain("choose the file again");
    expect(note.toLowerCase()).toContain("kept");
  });

  it("a recorded upload tells the caller to re-read the server, and still does not claim payment", async () => {
    const onRecorded = vi.fn();
    const submitProof = vi.fn(
      async (_input: EarlyAccessProofSubmitInput): Promise<EarlyAccessProofSubmitOutcome> => ({
        kind: "recorded",
      }),
    );
    render(
      <EarlyAccessCartSubmit
        cartCheckoutNumber="XEC-ABCDEFGH12345678"
        paymentInstructions={RESOLVED}
        submitProof={submitProof}
        onRecorded={onRecorded}
        onBack={() => {}}
        onStatus={() => {}}
      />,
    );
    act(() => {
      (host.querySelector('input[value="zelle"]') as HTMLInputElement).click();
    });
    const input = q('[data-testid="early-access-submit-file"]') as HTMLInputElement;
    const file = new File(["bytes"], "receipt.png", { type: "image/png" });
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await click(q('[data-testid="early-access-submit-send"]')!);

    expect(submitProof).toHaveBeenCalledTimes(1);
    expect(submitProof.mock.calls[0]?.[0]).toMatchObject({
      cartCheckoutNumber: "XEC-ABCDEFGH12345678",
      methodCode: "zelle",
    });
    expect(onRecorded).toHaveBeenCalledTimes(1);
    const outcome = q('[data-testid="early-access-submit-outcome"]');
    expect(outcome?.getAttribute("data-outcome")).toBe("recorded");
    expect(outcome?.textContent).toContain("does not mean your payment has been confirmed");
  });
});

describe("nothing internal reaches the customer", () => {
  it("a thrown error becomes the one outcome that carries no detail", async () => {
    const secret = "provider-message-id=abc123 recipient=ops@internal.test";
    render(
      <EarlyAccessCartSubmit
        cartCheckoutNumber="XEC-ABCDEFGH12345678"
        paymentInstructions={RESOLVED}
        submitProof={async () => {
          throw new Error(secret);
        }}
        onRecorded={() => {}}
        onBack={() => {}}
        onStatus={() => {}}
      />,
    );
    act(() => {
      (host.querySelector('input[value="zelle"]') as HTMLInputElement).click();
    });
    const input = q('[data-testid="early-access-submit-file"]') as HTMLInputElement;
    Object.defineProperty(input, "files", {
      value: [new File(["b"], "r.pdf", { type: "application/pdf" })],
      configurable: true,
    });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await click(q('[data-testid="early-access-submit-send"]')!);

    expect(q('[data-testid="early-access-submit-outcome"]')?.getAttribute("data-outcome")).toBe("failed");
    const text = host.textContent ?? "";
    expect(text).not.toContain(secret);
    expect(text).not.toContain("provider-message-id");
    expect(text).not.toContain("ops@internal.test");
    expect(text.toLowerCase()).not.toContain("submissionkey");
  });
});

describe("no submission door means no uploader", () => {
  it("explains the concierge route rather than rendering a file input that would discard the file", () => {
    render(
      <EarlyAccessCartSubmit
        cartCheckoutNumber="XEC-ABCDEFGH12345678"
        paymentInstructions={RESOLVED}
        onRecorded={() => {}}
        onBack={() => {}}
        onStatus={() => {}}
      />,
    );
    expect(q('[data-testid="early-access-submit-concierge"]')).not.toBeNull();
    expect(q('[data-testid="early-access-submit-file"]')).toBeNull();
    expect(q('[data-testid="early-access-submit-send"]')).toBeNull();
    // And it still does not pretend the order has been submitted.
    expect(q('[data-testid="early-access-submit-not-payment"]')?.textContent).toContain(
      "does not confirm your payment",
    );
  });
});
