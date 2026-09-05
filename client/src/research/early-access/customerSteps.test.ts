import { describe, expect, it } from "vitest";

import { EARLY_ACCESS_CHECKOUT_STEPS } from "./cart/history";
import {
  EARLY_ACCESS_CUSTOMER_STEP_LABELS,
  EARLY_ACCESS_CUSTOMER_STEPS,
  earlyAccessCustomerStepIndex,
} from "./customerSteps";

describe("Early Access customer step projection", () => {
  it("has exactly four stable customer-facing stages", () => {
    expect(EARLY_ACCESS_CUSTOMER_STEPS).toEqual([
      { key: "choose-products", label: "Choose products" },
      { key: "contact-delivery", label: "Contact and delivery" },
      { key: "review-payment", label: "Review and payment" },
      { key: "confirmation-tracking", label: "Confirmation and tracking" },
    ]);
    expect(EARLY_ACCESS_CUSTOMER_STEP_LABELS).toEqual([
      "Choose products",
      "Contact and delivery",
      "Review and payment",
      "Confirmation and tracking",
    ]);
  });

  it("projects every internal state without changing the eight-state machine", () => {
    expect(EARLY_ACCESS_CHECKOUT_STEPS).toEqual([
      "catalog",
      "cart",
      "details",
      "agreements",
      "review",
      "payment",
      "submit",
      "status",
    ]);
    expect(EARLY_ACCESS_CHECKOUT_STEPS.map(earlyAccessCustomerStepIndex)).toEqual([
      0, 0, 1, 1, 2, 2, 2, 3,
    ]);
  });

  it("uses the same stages for the capability-off and embedded journeys", () => {
    expect(earlyAccessCustomerStepIndex("products")).toBe(0);
    expect(earlyAccessCustomerStepIndex("contact")).toBe(1);
    expect(earlyAccessCustomerStepIndex("details")).toBe(1);
    expect(earlyAccessCustomerStepIndex("review")).toBe(2);
    expect(earlyAccessCustomerStepIndex("submitting")).toBe(2);
    expect(earlyAccessCustomerStepIndex("payment")).toBe(2);
    expect(earlyAccessCustomerStepIndex("submit")).toBe(2);
    expect(earlyAccessCustomerStepIndex("status")).toBe(3);
  });

  it("does not call payment confirmation or tracking before the status screen", () => {
    expect(EARLY_ACCESS_CUSTOMER_STEPS[earlyAccessCustomerStepIndex("payment")].label).toBe(
      "Review and payment",
    );
    expect(EARLY_ACCESS_CUSTOMER_STEPS[earlyAccessCustomerStepIndex("submit")].label).toBe(
      "Review and payment",
    );
    expect(EARLY_ACCESS_CUSTOMER_STEPS[earlyAccessCustomerStepIndex("status")].label).toBe(
      "Confirmation and tracking",
    );
  });
});
