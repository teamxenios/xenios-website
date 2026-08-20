// The supplier workspace view model, pinned to the fulfillment engine.
//
// The workspace draws its buttons from SUPPLIER_WORKSPACE_ACTIONS because the
// browser bundle cannot import server code. That makes it a SECOND COPY of a
// rule the engine already owns, and a second copy drifts. These tests import
// the engine's real table and fail the moment the two disagree, so the drift
// is caught here instead of as a supplier pressing a button the server rejects.

import { describe, expect, it } from "vitest";
import { FULFILLMENT_TRANSITIONS } from "../../../server/research/fulfillment/service";
import {
  FULFILLMENT_STATES,
  SUPPLIER_PERMITTED_ACTIONS,
  type FulfillmentAction,
  type FulfillmentAssignmentView,
  type FulfillmentState,
} from "../fulfillment/contracts";
import {
  FULFILLMENT_ACTION_LABEL,
  FULFILLMENT_STATE_LABEL,
  SUPPLIER_WORKSPACE_ACTIONS,
  forbiddenSupplierFields,
  hasShipped,
  isOpenForSupplier,
  isRenderableSupplierAssignment,
  primarySupplierAction,
  requiredEvidenceFor,
  supplierActionsFor,
} from "./workspace";

/** What the engine itself would permit a supplier to do from a given state. */
function engineTruthFor(state: FulfillmentState): FulfillmentAction[] {
  const permitted = SUPPLIER_PERMITTED_ACTIONS as readonly string[];
  return Object.keys(FULFILLMENT_TRANSITIONS[state])
    .filter((action) => permitted.includes(action))
    .sort() as FulfillmentAction[];
}

describe("the workspace's action map matches the fulfillment engine exactly", () => {
  it.each(FULFILLMENT_STATES)("state %s offers exactly what the engine permits a supplier", (state) => {
    expect([...supplierActionsFor(state)].sort()).toEqual(engineTruthFor(state));
  });

  it("covers every state, so a missing key can never read as 'no actions'", () => {
    for (const state of FULFILLMENT_STATES) {
      expect(SUPPLIER_WORKSPACE_ACTIONS[state], `missing ${state}`).toBeDefined();
    }
    expect(Object.keys(SUPPLIER_WORKSPACE_ACTIONS).sort()).toEqual([...FULFILLMENT_STATES].sort());
  });

  it("never offers an action outside the supplier-permitted set", () => {
    const permitted = new Set<string>(SUPPLIER_PERMITTED_ACTIONS);
    for (const state of FULFILLMENT_STATES) {
      for (const action of supplierActionsFor(state)) {
        expect(permitted.has(action), `${state} -> ${action}`).toBe(true);
      }
    }
  });

  it("never offers an internal-authority disposition anywhere", () => {
    const internalOnly: FulfillmentAction[] = [
      "cancel",
      "record_recall",
      "record_return",
      "record_replacement",
      "record_refund",
      "record_damage",
      "record_loss",
    ];
    for (const state of FULFILLMENT_STATES) {
      for (const forbidden of internalOnly) {
        expect(supplierActionsFor(state), `${state}`).not.toContain(forbidden);
      }
    }
  });
});

describe("the workspace cannot imply a parcel moved", () => {
  it("never lets a supplier reach shipped without the tracking step", () => {
    // The only route to `ship` is from tracking_created, in the engine and here.
    for (const state of FULFILLMENT_STATES) {
      if (supplierActionsFor(state).includes("ship")) expect(state).toBe("tracking_created");
    }
  });

  it("does not treat tracking_created as shipped", () => {
    expect(hasShipped("tracking_created")).toBe(false);
    expect(FULFILLMENT_STATE_LABEL.tracking_created).toContain("not yet shipped");
    expect(hasShipped("shipped")).toBe(true);
    expect(hasShipped("delivered")).toBe(true);
  });

  it("recovery from an exception passes back through the evidence steps, never straight to shipped", () => {
    expect(supplierActionsFor("exception")).not.toContain("ship");
    expect(supplierActionsFor("exception")).toContain("start_picking");
  });
});

describe("primary action and queue split", () => {
  it("suggests the forward step, never 'report a problem'", () => {
    expect(primarySupplierAction("assigned")).toBe("acknowledge");
    expect(primarySupplierAction("packed")).toBe("record_tracking");
    expect(primarySupplierAction("tracking_created")).toBe("ship");
    for (const state of FULFILLMENT_STATES) {
      expect(primarySupplierAction(state)).not.toBe("record_exception");
    }
  });

  it("has no primary action once the work has left the supplier", () => {
    expect(primarySupplierAction("delivered")).toBeNull();
    expect(primarySupplierAction("cancelled")).toBeNull();
    expect(primarySupplierAction("recalled")).toBeNull();
  });

  it("treats a state as open exactly when the supplier can still act", () => {
    expect(isOpenForSupplier("assigned")).toBe(true);
    expect(isOpenForSupplier("shipped")).toBe(true);
    expect(isOpenForSupplier("delivered")).toBe(false);
    expect(isOpenForSupplier("cancelled")).toBe(false);
  });

  it("asks for the evidence the server requires", () => {
    expect(requiredEvidenceFor("record_tracking")).toEqual(["tracking"]);
    expect(requiredEvidenceFor("record_exception")).toEqual(["reason"]);
    expect(requiredEvidenceFor("acknowledge")).toEqual([]);
  });

  it("labels every state and every action", () => {
    for (const state of FULFILLMENT_STATES) expect(FULFILLMENT_STATE_LABEL[state]).toBeTruthy();
    for (const action of SUPPLIER_PERMITTED_ACTIONS) expect(FULFILLMENT_ACTION_LABEL[action]).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Minimum-necessary projection
// ---------------------------------------------------------------------------

const CLEAN_VIEW: FulfillmentAssignmentView = {
  assignmentId: "asg_1",
  fulfillmentOrderId: "ful_1",
  orderReference: "XRR-1001",
  supplierId: "raw-peptides",
  supplierLabel: "Raw Peptides",
  state: "assigned",
  version: 1,
  expectedShipAt: "2026-08-22T00:00:00Z",
  recipient: {
    name: "A Quinn",
    addressLine1: "1 Test St",
    addressLine2: null,
    city: "Austin",
    state: "TX",
    postalCode: "78701",
    country: "US",
    phone: null,
  },
  shippingService: "ground",
  handlingProfile: "ambient",
  lines: [{ lineId: "l1", sku: "SKU-1", quantity: 2, lotId: "lot_1", lotCode: "L-1" }],
  labelReference: null,
  carrier: null,
  trackingReference: null,
  updatedAt: "2026-08-20T00:00:00Z",
};

describe("the workspace refuses to render anything a supplier must not see", () => {
  it("passes the engine's real projection shape", () => {
    expect(forbiddenSupplierFields(CLEAN_VIEW)).toEqual([]);
    expect(isRenderableSupplierAssignment(CLEAN_VIEW)).toBe(true);
  });

  it.each([
    ["xeniosMarginCents", 500],
    ["commissionCents", 250],
    ["affiliateCode", "AVERY"],
    ["retailPriceCents", 9900],
    ["wholesaleCost", 4000],
    ["memberId", "mem_1"],
    ["customerEmail", "a@b.test"],
    ["paymentState", "paid"],
  ])("catches a widened projection carrying %s", (field, value) => {
    const widened = { ...CLEAN_VIEW, [field]: value } as unknown as FulfillmentAssignmentView;
    expect(forbiddenSupplierFields(widened)).toContain(field);
    expect(isRenderableSupplierAssignment(widened)).toBe(false);
  });

  it("catches a forbidden field nested inside a line", () => {
    const widened = {
      ...CLEAN_VIEW,
      lines: [{ ...CLEAN_VIEW.lines[0], unitCostCents: 1200 }],
    } as unknown as FulfillmentAssignmentView;
    expect(forbiddenSupplierFields(widened)).toContain("lines.0.unitCostCents");
  });
});
