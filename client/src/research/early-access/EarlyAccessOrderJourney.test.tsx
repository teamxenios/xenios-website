// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  EARLY_ACCESS_PROOF_MAX_BYTES,
  EarlyAccessProofUpload,
  rejectProof,
} from "./EarlyAccessProofUpload";
import {
  EarlyAccessOrderStatus,
  type EarlyAccessOrderState,
} from "./EarlyAccessOrderStatus";
import { EARLY_ACCESS_FULFILLMENT_TARGET_COPY } from "./fulfillment-copy";

let container: HTMLElement | null = null;
let root: Root | null = null;

function render(element: ReactElement): HTMLElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(element);
  });
  return container;
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
});

describe("proof upload", () => {
  it("accepts only the four permitted types", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp", "application/pdf"]) {
      expect(rejectProof({ type, size: 1_000 })).toBeNull();
    }
    for (const type of ["image/gif", "text/html", "application/zip", "image/svg+xml", ""]) {
      expect(rejectProof({ type, size: 1_000 }), `accepted ${type}`).toBe("type");
    }
  });

  it("refuses an empty file and one over the size limit", () => {
    expect(rejectProof({ type: "image/png", size: 0 })).toBe("empty");
    expect(rejectProof(null)).toBe("empty");
    expect(rejectProof({ type: "image/png", size: EARLY_ACCESS_PROOF_MAX_BYTES + 1 })).toBe("size");
    expect(rejectProof({ type: "image/png", size: EARLY_ACCESS_PROOF_MAX_BYTES })).toBeNull();
  });

  it("says on the upload screen that uploading does not pay the order", () => {
    // A customer who believes the upload settled it will expect a shipment that
    // is not coming.
    const el = render(
      <EarlyAccessProofUpload orderNumber="XEA-1" onSubmit={() => {}} />,
    );
    expect(el.textContent).toContain("does not pay your order");
    expect(el.textContent).toContain("stays unpaid until");
  });

  it("cannot submit until a valid file is chosen", () => {
    const onSubmit = vi.fn();
    const el = render(<EarlyAccessProofUpload orderNumber="XEA-1" onSubmit={onSubmit} />);
    const button = el.querySelector<HTMLButtonElement>(
      "[data-testid='early-access-proof-upload-submit']",
    );
    expect(button?.disabled).toBe(true);
    act(() => {
      button?.click();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("order status", () => {
  function status(state: EarlyAccessOrderState, extra: Record<string, unknown> = {}) {
    return render(
      <EarlyAccessOrderStatus
        orderNumber="XEA-0000000000000001"
        state={state}
        fulfillmentTargetCopy={EARLY_ACCESS_FULFILLMENT_TARGET_COPY}
        {...extra}
      />,
    );
  }

  it.each([
    ["awaiting_payment", false],
    ["proof_submitted", false],
    ["under_review", false],
    ["payment_verified", true],
    ["supplier_released", true],
    ["shipped", true],
  ] as ReadonlyArray<[EarlyAccessOrderState, boolean]>)(
    "states plainly whether %s is paid",
    (state, paid) => {
      const el = status(state);
      const line = el.querySelector("[data-testid='early-access-order-status-payment-line']");
      if (paid) {
        expect(line?.textContent).toContain("Payment confirmed");
      } else {
        expect(line?.textContent).toContain("Not yet paid");
      }
    },
  );

  it("never reads a submitted proof as payment", () => {
    // THE RULE. A proof is a claim, not a settlement. Only the server's own
    // state moves this line.
    const el = status("under_review", { proofSubmittedAt: "2026-08-04T12:00:00.000Z" });
    expect(el.textContent).toContain("Not yet paid");
    expect(el.textContent).toContain("does not settle the order on its own");
  });

  it("shows every timeline step, including ones not reached", () => {
    const el = status("under_review");
    expect(el.querySelectorAll("[data-testid^='early-access-order-status-step-']")).toHaveLength(6);
    expect(
      el
        .querySelector("[data-testid='early-access-order-status-step-under_review']")
        ?.getAttribute("data-reached"),
    ).toBe("true");
    expect(
      el
        .querySelector("[data-testid='early-access-order-status-step-shipped']")
        ?.getAttribute("data-reached"),
    ).toBe("false");
  });

  it("promises tracking rather than inventing it", () => {
    const none = status("under_review");
    expect(none.textContent).toContain("Tracking will be provided when the shipment is released");

    const shipped = status("shipped", {
      tracking: [{ occurredAt: "2026-08-05T09:00:00.000Z", label: "Shipped", carrier: "USPS", trackingNumber: "9400111" }],
    });
    expect(shipped.textContent).toContain("USPS");
    expect(shipped.textContent).toContain("9400111");
  });

  it("carries the fulfillment target as a target, never a guarantee", () => {
    const el = status("payment_verified");
    expect(el.textContent).toContain(EARLY_ACCESS_FULFILLMENT_TARGET_COPY);
    const text = (el.textContent ?? "").toLowerCase();
    expect(text).not.toContain("guarantee");
    expect(text).not.toContain("will arrive by");
  });
});
